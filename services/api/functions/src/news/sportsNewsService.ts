import { createHash } from "crypto";
import {
  getOpenAiApiKey,
  getOpenAiBaseUrl,
  getSportsNewsArticleConcurrency,
  getSportsNewsMinSourcesPerGame,
  getSportsNewsModel,
  getSportsNewsMaxArticlesPerGame,
  isSportsNewsLlmEnabled,
  shouldFetchSportsNewsFullText
} from "../config/runtimeConfig";
import { fetchArticleFullText } from "./articleTextFetcher";
import { parseFeedXml } from "./feedParser";
import { SportFeedSource, SportId, SPORT_NEWS_SOURCES } from "./sportsNewsSources";
import { ParsedFeedArticle } from "./types";

interface FetchFeedOptions {
  timeoutMs: number;
  userAgent: string;
}

interface FeedFetchResult {
  status: number;
  body: string;
}

type FeedFetcher = (url: string, options: FetchFeedOptions) => Promise<FeedFetchResult>;
type FeedParser = (xml: string) => ParsedFeedArticle[];
type ArticleTextFetcher = (url: string, options: FetchFeedOptions) => Promise<string>;
type GameClusterBuilder = (input: GameClusterBuilderInput) => Promise<SportsGameDraft[]>;
type GameStoryBuilder = (input: GameStoryBuilderInput) => Promise<GameStoryDraft>;

interface SportsNewsServiceDeps {
  feedFetcher?: FeedFetcher;
  feedParser?: FeedParser;
  articleTextFetcher?: ArticleTextFetcher;
  gameClusterBuilder?: GameClusterBuilder;
  gameStoryBuilder?: GameStoryBuilder;
}

export interface GameArticleReference {
  itemIndex: number;
  sourceId: string;
  sourceName: string;
  title: string;
  summary: string;
  canonicalUrl: string;
  publishedAtMs?: number;
  matchKey?: string;
  matchDisplayName?: string;
}

export interface SportsGameDraft {
  gameId: string;
  gameName: string;
  gameDateKey: string;
  articleRefs: GameArticleReference[];
}

export interface SportsStory {
  id: string;
  sport: SportId;
  sourceId: string;
  sourceName: string;
  title: string;
  canonicalUrl: string;
  publishedAtMs?: number;
  gameId: string;
  gameName: string;
  gameDateKey: string;
  importanceScore: number;
  bulletPoints: string[];
  reconstructedArticle: string;
  story: string;
  fullTextStatus: "ready" | "fallback";
  summarySource: "llm" | "fallback";
}

export interface FetchSportsStoriesInput {
  sport: string;
  limit: number;
  userAgent: string;
  feedTimeoutMs: number;
  articleTimeoutMs: number;
  deadlineMs?: number;
  timeZone?: string;
  knownGameIds?: string[];
  onProgress?: (progress: SportsRefreshProgress) => void | Promise<void>;
  onStoryReady?: (story: SportsStory) => void | Promise<void>;
}

export interface FetchSportsStoriesResult {
  sport: SportId;
  gameDateKey: string;
  gameDrafts: SportsGameDraft[];
  stories: SportsStory[];
}

export interface SportsRefreshProgress {
  step: "looking_games" | "games_found" | "preparing_articles";
  message: string;
  totalGames?: number;
  processedGames?: number;
  foundGames?: string[];
  gameName?: string;
}

interface CandidateStoryItem extends ParsedFeedArticle {
  source: SportFeedSource;
  itemIndex: number;
}

interface GameClusterBuilderInput {
  sport: SportId;
  gameDateKey: string;
  articles: GameArticleReference[];
}

interface GameStoryArticleInput extends GameArticleReference {
  rawText: string;
  fullTextStatus: "ready" | "fallback";
}

interface GameStoryBuilderInput {
  sport: SportId;
  gameName: string;
  gameDateKey: string;
  articles: GameStoryArticleInput[];
}

interface GameStoryDraft {
  importanceScore: number;
  bulletPoints: string[];
  reconstructedArticle: string;
  summarySource: "llm" | "fallback";
}

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ text?: string; type?: string }>;
  }>;
}

async function defaultFeedFetcher(url: string, options: FetchFeedOptions): Promise<FeedFetchResult> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": options.userAgent,
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1"
    },
    signal: AbortSignal.timeout(options.timeoutMs)
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Feed request failed with status ${response.status}`);
  }

  return {
    status: response.status,
    body
  };
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitSentences(value: string): string[] {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return [];
  }
  return normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars).trim()}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const MAX_GAMES_PER_REFRESH = 12;
const GAME_PROCESSING_CONCURRENCY = 2;
const MIN_SPORTS_FULL_TEXT_CHARS = 120;

function selectArticlesForStory(articleRefs: GameArticleReference[], maxArticles: number): GameArticleReference[] {
  const sorted = [...articleRefs].sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0));
  const boundedMax = Math.max(1, Math.floor(maxArticles));
  const selected: GameArticleReference[] = [];
  const selectedUrls = new Set<string>();
  const selectedSourceIds = new Set<string>();

  for (const article of sorted) {
    if (selected.length >= boundedMax) {
      break;
    }
    if (selectedSourceIds.has(article.sourceId) || selectedUrls.has(article.canonicalUrl)) {
      continue;
    }
    selected.push(article);
    selectedSourceIds.add(article.sourceId);
    selectedUrls.add(article.canonicalUrl);
  }

  for (const article of sorted) {
    if (selected.length >= boundedMax) {
      break;
    }
    if (selectedUrls.has(article.canonicalUrl)) {
      continue;
    }
    selected.push(article);
    selectedUrls.add(article.canonicalUrl);
  }

  return selected;
}

function validTimeZone(value: string | undefined): string {
  const candidate = String(value ?? "").trim();
  if (!candidate) {
    return "America/New_York";
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "America/New_York";
  }
}

function toDateKey(timestampMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestampMs));

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function resolveYesterdayDateKey(timeZone: string): string {
  return toDateKey(Date.now() - 24 * 60 * 60 * 1000, timeZone);
}

function resolveTodayDateKey(timeZone: string): string {
  return toDateKey(Date.now(), timeZone);
}

function asSportId(value: string): SportId | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "football" ? "football" : null;
}

function parseOpenAiText(payload: OpenAiResponse): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .filter((item) => item.type === "message" || item.type === undefined)
    .flatMap((item) => item.content ?? [])
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("")
    .trim();
}

interface MatchIdentity {
  key: string;
  displayName: string;
}

const TEAM_CLEANUP_REGEXES = [
  /^watch:\s*/i,
  /^highlights:\s*/i,
  /^live:\s*/i,
  /^report:\s*/i,
  /^preview:\s*/i,
  /\b(media caption|published\s+\d+.*)$/i,
  /\b(uefa champions league|premier league|fa cup|carabao cup|scottish cup)\b/gi,
  /\b(reaction|report|preview|analysis|highlights|recap|latest|watch)\b.*$/i
];

const BOILERPLATE_TOKENS = [
  "skip to main content",
  "skip to navigation",
  "menu espn",
  "espn scores nfl",
  "where to watch",
  "fantasy watch soccer",
  "subsection",
  "share close panel",
  "copy link about sharing"
];

const TEAM_EDGE_STOPWORDS = new Set([
  "out",
  "again",
  "in",
  "at",
  "to",
  "for",
  "of",
  "on",
  "with",
  "from",
  "over",
  "under",
  "into",
  "after",
  "before",
  "the",
  "a",
  "an"
]);

const TEAM_INVALID_WORDS = new Set([
  "win",
  "wins",
  "winning",
  "league",
  "champions",
  "championship",
  "cup",
  "goal",
  "goals",
  "forward",
  "coach",
  "manager",
  "reaction",
  "report",
  "preview",
  "analysis",
  "live",
  "watch",
  "home",
  "away",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "updates",
  "update",
  "news",
  "little",
  "does",
  "but"
]);

const TEAM_ALIAS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bmanchester city\b/g, "man city"],
  [/\bmanchester united\b/g, "man utd"],
  [/\bnewcastle united\b/g, "newcastle"],
  [/\bparis saint[- ]germain\b/g, "psg"],
  [/\breal madrid\b/g, "real madrid"],
  [/\batletico madrid\b/g, "atletico madrid"],
  [/\btottenham hotspur\b/g, "tottenham"],
  [/\bwolverhampton wanderers\b/g, "wolves"]
];

function sanitizeArticleNarrativeText(raw: string): string {
  const normalized = normalizeWhitespace(raw);
  if (!normalized) {
    return "";
  }

  const text = normalized
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/Image source,[^.]*\./gi, " ")
    .replace(/Image caption,[^.]*\./gi, " ")
    .replace(/Published [^.]*\./gi, " ")
    .replace(/\bBy [A-Z][A-Za-z .'-]{2,40}\b/g, " ")
    .replace(/Related topics [A-Za-z0-9 ,&'-]+/gi, " ")
    .replace(/\bUK only\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = text.toLowerCase();
  for (const token of BOILERPLATE_TOKENS) {
    if (lower.includes(token)) {
      return "";
    }
  }
  const filteredSentences = splitSentences(text)
    .filter((sentence) => {
      const s = sentence.toLowerCase();
      return !BOILERPLATE_TOKENS.some((token) => s.includes(token));
    })
    .slice(0, 10);

  return normalizeWhitespace(filteredSentences.join(" "));
}

function sanitizeTeamName(raw: string): string {
  let value = normalizeWhitespace(raw)
    .replace(/'s\b/gi, "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9]+$/, "")
    .replace(/\s+/g, " ");
  for (const regex of TEAM_CLEANUP_REGEXES) {
    value = normalizeWhitespace(value.replace(regex, ""));
  }
  const words = value.split(" ").filter(Boolean);
  while (words.length && TEAM_EDGE_STOPWORDS.has(words[0].toLowerCase())) {
    words.shift();
  }
  while (words.length && TEAM_EDGE_STOPWORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  value = words.join(" ");
  if (value.length > 44) {
    value = value.slice(0, 44).trim();
  }
  return value;
}

function normalizeComparableText(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeadlineLikeSentence(sentence: string, titleKeys: Set<string>): boolean {
  const sentenceKey = normalizeComparableText(sentence);
  if (!sentenceKey || sentenceKey.length < 16) {
    return false;
  }
  for (const titleKey of titleKeys) {
    if (!titleKey || titleKey.length < 16) {
      continue;
    }
    if (titleKey.includes(sentenceKey) || sentenceKey.includes(titleKey)) {
      return true;
    }
  }
  return false;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    const key = normalizeComparableText(line);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(line);
  }
  return deduped;
}

function normalizeTeamKey(raw: string): string {
  let normalized = sanitizeTeamName(raw)
    .toLowerCase()
    .replace(/\b(fc|afc|cf|sc|women|wfc)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [regex, value] of TEAM_ALIAS_REPLACEMENTS) {
    normalized = normalized.replace(regex, value);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function buildMatchIdentity(teamA: string, teamB: string): MatchIdentity | null {
  const a = sanitizeTeamName(teamA);
  const b = sanitizeTeamName(teamB);
  const aKey = normalizeTeamKey(a);
  const bKey = normalizeTeamKey(b);

  if (!a || !b || !aKey || !bKey || aKey === bKey) {
    return null;
  }
  const aWords = aKey.split(" ").filter(Boolean);
  const bWords = bKey.split(" ").filter(Boolean);
  if (aWords.length > 4 || bWords.length > 4) {
    return null;
  }
  if (aWords.some((word) => TEAM_INVALID_WORDS.has(word)) || bWords.some((word) => TEAM_INVALID_WORDS.has(word))) {
    return null;
  }

  const [leftKey, rightKey] = [aKey, bKey].sort();
  const [leftLabel, rightLabel] = [a, b].sort((x, y) => normalizeTeamKey(x).localeCompare(normalizeTeamKey(y)));
  return {
    key: `${leftKey}__${rightKey}`,
    displayName: `${leftLabel} vs ${rightLabel}`
  };
}

function extractTeamPhrases(text: string): string[] {
  const regex = /[A-Z][A-Za-z0-9'&.\-]*(?:\s+[A-Z][A-Za-z0-9'&.\-]*){0,3}/g;
  const matches = text.match(regex) ?? [];
  return matches.map((item) => normalizeWhitespace(item)).filter(Boolean);
}

function extractLastTeamPhrase(text: string): string | null {
  const phrases = extractTeamPhrases(text);
  if (!phrases.length) {
    return null;
  }
  return phrases[phrases.length - 1];
}

function extractFirstTeamPhrase(text: string): string | null {
  const phrases = extractTeamPhrases(text);
  if (!phrases.length) {
    return null;
  }
  return phrases[0];
}

function extractMatchIdentityFromText(value: string): MatchIdentity | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const scorelineRegex =
    /([A-Z][A-Za-z0-9'&.\-]*(?:\s+[A-Z][A-Za-z0-9'&.\-]*){0,3})\s+\d+\s*[-–]\s*\d+\s+([A-Z][A-Za-z0-9'&.\-]*(?:\s+[A-Z][A-Za-z0-9'&.\-]*){0,3})/g;
  let scorelineMatch = scorelineRegex.exec(normalized);
  while (scorelineMatch) {
    const identity = buildMatchIdentity(scorelineMatch[1], scorelineMatch[2]);
    if (identity) {
      return identity;
    }
    scorelineMatch = scorelineRegex.exec(normalized);
  }

  const versusTokenRegex = /\b(vs|v|versus)\b/gi;
  let versusToken = versusTokenRegex.exec(normalized);
  while (versusToken) {
    const tokenIndex = versusToken.index;
    const tokenEndIndex = tokenIndex + versusToken[0].length;
    const leftContext = normalized
      .slice(Math.max(0, tokenIndex - 90), tokenIndex)
      .replace(/[^A-Za-z0-9'&.\-\s]/g, " ");
    const rightContext = normalized
      .slice(tokenEndIndex, Math.min(normalized.length, tokenEndIndex + 90))
      .replace(/[^A-Za-z0-9'&.\-\s]/g, " ");

    const leftTeam = extractLastTeamPhrase(leftContext);
    const rightTeam = extractFirstTeamPhrase(rightContext);
    const identity = leftTeam && rightTeam ? buildMatchIdentity(leftTeam, rightTeam) : null;
    if (identity) {
      return identity;
    }
    versusToken = versusTokenRegex.exec(normalized);
  }

  const beatRegex =
    /([A-Z][A-Za-z0-9'&.\-]*(?:\s+[A-Z][A-Za-z0-9'&.\-]*){0,3})\s+(?:beat|beats|defeat|defeats|defeated|edge|edges|edged)\s+([A-Z][A-Za-z0-9'&.\-]*(?:\s+[A-Z][A-Za-z0-9'&.\-]*){0,3})/gi;
  let beatMatch = beatRegex.exec(normalized);
  while (beatMatch) {
    const identity = buildMatchIdentity(beatMatch[1], beatMatch[2]);
    if (identity) {
      return identity;
    }
    beatMatch = beatRegex.exec(normalized);
  }

  return null;
}

function resolveMatchIdentity(title: string, summary: string): MatchIdentity | null {
  const combined = normalizeWhitespace(`${title} ${summary}`).toLowerCase();
  const versusTokenCount = (combined.match(/\b(vs|v|versus)\b/g) ?? []).length;
  if (versusTokenCount > 1) {
    return null;
  }
  if (combined.includes("live updates")) {
    return null;
  }
  return extractMatchIdentityFromText(title) ?? extractMatchIdentityFromText(summary);
}

function hasScorelinePattern(value: string): boolean {
  return /\b\d+\s*[-–]\s*\d+\b/.test(normalizeWhitespace(value));
}

function isLikelyGameArticle(title: string, summary: string): boolean {
  if (resolveMatchIdentity(title, summary)) {
    return true;
  }

  const combined = normalizeWhitespace(`${title} ${summary}`);
  if (!combined) {
    return false;
  }

  if (hasScorelinePattern(combined)) {
    return true;
  }

  const lower = combined.toLowerCase();
  const hasVersusTerm = /\b(vs|v|versus|against)\b/.test(lower);
  const hasMatchContext =
    /\b(match|fixture|preview|report|reaction|recap|final|semi-final|quarter-final|play-off|first leg|second leg)\b/.test(
      lower
    );
  return hasVersusTerm && hasMatchContext;
}

function compareDraftPriority(a: SportsGameDraft, b: SportsGameDraft): number {
  if (b.articleRefs.length !== a.articleRefs.length) {
    return b.articleRefs.length - a.articleRefs.length;
  }

  const aLatest = Math.max(...a.articleRefs.map((item) => item.publishedAtMs ?? 0));
  const bLatest = Math.max(...b.articleRefs.map((item) => item.publishedAtMs ?? 0));
  return bLatest - aLatest;
}

function resolveRemainingMs(deadlineMs: number | undefined): number {
  if (typeof deadlineMs !== "number" || !Number.isFinite(deadlineMs)) {
    return Number.POSITIVE_INFINITY;
  }
  return deadlineMs - Date.now();
}

function isNearDeadline(deadlineMs: number | undefined, safetyBufferMs: number): boolean {
  return resolveRemainingMs(deadlineMs) <= safetyBufferMs;
}

function buildFallbackGameDrafts(input: GameClusterBuilderInput): SportsGameDraft[] {
  const byGame = new Map<string, { gameName: string; articleRefs: GameArticleReference[] }>();

  for (const article of input.articles) {
    const identity = resolveMatchIdentity(article.title, article.summary);
    const fallbackKey = article.matchKey ? article.matchKey : identity?.key;
    const fallbackName = article.matchDisplayName ? article.matchDisplayName : identity?.displayName;
    if (!fallbackKey || !fallbackName) {
      continue;
    }
    const gameName = truncate(normalizeWhitespace(fallbackName), 120);
    if (!gameName) {
      continue;
    }
    if (!byGame.has(fallbackKey)) {
      byGame.set(fallbackKey, { gameName, articleRefs: [] });
    }
    byGame.get(fallbackKey)?.articleRefs.push(article);
  }

  return Array.from(byGame.entries()).map(([gameKey, entry]) => ({
    gameId: hashText(`${input.sport}:${input.gameDateKey}:${gameKey}`),
    gameName: entry.gameName,
    gameDateKey: input.gameDateKey,
    articleRefs: entry.articleRefs.sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0))
  }));
}

function coalesceDraftsByMatchKey(input: GameClusterBuilderInput, suggestedDrafts: SportsGameDraft[]): SportsGameDraft[] {
  const byKey = new Map<string, { gameName: string; refs: Map<string, GameArticleReference> }>();

  const ensureEntry = (key: string, gameName: string) => {
    if (!byKey.has(key)) {
      byKey.set(key, { gameName, refs: new Map<string, GameArticleReference>() });
      return;
    }
    const entry = byKey.get(key);
    if (entry && (!entry.gameName || entry.gameName.length < gameName.length)) {
      entry.gameName = gameName;
    }
  };

  for (const article of input.articles) {
    const identity = resolveMatchIdentity(article.title, article.summary);
    const matchKey = article.matchKey ?? identity?.key ?? hashText(article.canonicalUrl);
    const matchName =
      article.matchDisplayName ?? identity?.displayName ?? truncate(normalizeWhitespace(article.title), 120);
    ensureEntry(matchKey, matchName);
    byKey.get(matchKey)?.refs.set(article.canonicalUrl, article);
  }

  for (const draft of suggestedDrafts) {
    for (const article of draft.articleRefs) {
      const identity = resolveMatchIdentity(article.title, article.summary);
      const matchKey = article.matchKey ?? identity?.key ?? hashText(article.canonicalUrl);
      const entry = byKey.get(matchKey);
      const draftName = truncate(normalizeWhitespace(draft.gameName), 120);
      if (entry && draftName && draftName.length >= entry.gameName.length) {
        entry.gameName = draftName;
      }
      ensureEntry(
        matchKey,
        article.matchDisplayName ??
          identity?.displayName ??
          draftName ??
          truncate(normalizeWhitespace(article.title), 120)
      );
      byKey.get(matchKey)?.refs.set(article.canonicalUrl, article);
    }
  }

  return Array.from(byKey.entries())
    .map(([matchKey, entry]) => ({
      gameId: hashText(`${input.sport}:${input.gameDateKey}:${matchKey}`),
      gameName: entry.gameName,
      gameDateKey: input.gameDateKey,
      articleRefs: Array.from(entry.refs.values()).sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0))
    }))
    .filter((draft) => draft.articleRefs.length > 0 && draft.gameName);
}

async function defaultGameClusterBuilder(input: GameClusterBuilderInput): Promise<SportsGameDraft[]> {
  if (!isSportsNewsLlmEnabled()) {
    return buildFallbackGameDrafts(input);
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return buildFallbackGameDrafts(input);
  }

  const response = await fetch(`${getOpenAiBaseUrl()}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: getSportsNewsModel(),
      reasoning: { effort: "low" },
      max_output_tokens: 600,
      text: {
        format: {
          type: "json_schema",
          name: "sports_game_clusters",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["games"],
            properties: {
              games: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["game_name", "article_indices"],
                  properties: {
                    game_name: { type: "string" },
                    article_indices: {
                      type: "array",
                      items: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      input: [
        {
          role: "system",
          content: [
            "You are a football editor.",
            "Group RSS articles into games that happened on the provided date.",
            "Use all relevant articles from the list.",
            "Output strict JSON only."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `Sport: ${input.sport}`,
            `Game date: ${input.gameDateKey}`,
            "Articles:",
            ...input.articles.map((item) =>
              JSON.stringify({
                item_index: item.itemIndex,
                source: item.sourceName,
                title: item.title,
                summary: item.summary,
                published_at_ms: item.publishedAtMs ?? null,
                url: item.canonicalUrl
              })
            )
          ].join("\n")
        }
      ]
    }),
    signal: AbortSignal.timeout(18_000)
  });

  if (!response.ok) {
    return buildFallbackGameDrafts(input);
  }

  const text = await response.text();
  if (!text.trim()) {
    return buildFallbackGameDrafts(input);
  }

  try {
    const payload = JSON.parse(text) as OpenAiResponse;
    const content = parseOpenAiText(payload);
    if (!content) {
      return buildFallbackGameDrafts(input);
    }

    const parsed = JSON.parse(content) as {
      games?: Array<{ game_name?: unknown; article_indices?: unknown }>;
    };
    const games = Array.isArray(parsed.games) ? parsed.games : [];
    const byIndex = new Map(input.articles.map((article) => [article.itemIndex, article] as const));

    const drafts: SportsGameDraft[] = [];
    for (const game of games) {
      const gameName = truncate(normalizeWhitespace(String(game.game_name ?? "")), 120);
      const indicesRaw = Array.isArray(game.article_indices) ? game.article_indices : [];
      const indices = indicesRaw.map((item) => Number(item)).filter((item) => Number.isFinite(item));
      const articleRefs = indices
        .map((index) => byIndex.get(index))
        .filter((value): value is GameArticleReference => Boolean(value));

      if (!gameName || !articleRefs.length) {
        continue;
      }

      const deduped = new Map<string, GameArticleReference>();
      for (const article of articleRefs) {
        if (!deduped.has(article.canonicalUrl)) {
          deduped.set(article.canonicalUrl, article);
        }
      }

      drafts.push({
        gameId: hashText(`${input.sport}:${input.gameDateKey}:${gameName.toLowerCase()}`),
        gameName,
        gameDateKey: input.gameDateKey,
        articleRefs: Array.from(deduped.values()).sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0))
      });
    }

    return drafts.length ? drafts : buildFallbackGameDrafts(input);
  } catch {
    return buildFallbackGameDrafts(input);
  }
}

function buildFallbackGameStory(input: GameStoryBuilderInput): GameStoryDraft {
  const cleanedSummaries = input.articles
    .map((article) => sanitizeArticleNarrativeText(article.summary))
    .filter(Boolean);
  const cleanedNarratives = input.articles
    .map((article) => sanitizeArticleNarrativeText(article.rawText))
    .filter(Boolean);
  const allText = [...cleanedSummaries, ...cleanedNarratives].join(" ");
  const sentenceSeen = new Set<string>();
  const titleKeys = new Set(
    input.articles.map((article) => normalizeComparableText(article.title)).filter((value) => value.length >= 16)
  );
  const sentences = splitSentences(allText).filter((sentence) => {
    const key = sentence.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
    if (!key || sentenceSeen.has(key)) {
      return false;
    }
    sentenceSeen.add(key);
    return !isHeadlineLikeSentence(sentence, titleKeys);
  });
  const bulletSource = sentences.length ? sentences.slice(0, 6) : input.articles.map((item) => item.summary);
  const reconstructionSource =
    sentences.length > 4 ? sentences.slice(4) : sentences.length > 1 ? sentences.slice(1) : sentences;
  const bulletPoints = bulletSource
    .map((value) => truncate(value, 220))
    .filter(Boolean)
    .slice(0, 6);
  const sourceNames = Array.from(new Set(input.articles.map((article) => article.sourceName))).join(", ");
  const reconstructedArticle = truncate(
    (reconstructionSource.length
      ? reconstructionSource.join(" ")
      : sentences.length
      ? sentences.join(" ")
      : input.articles.map((item) => item.summary).join(" ")) ||
      `Match summary for ${input.gameName}.`,
    1_600
  );

  const recentPublishedAt = Math.max(...input.articles.map((article) => article.publishedAtMs ?? 0));
  const recencyWeight = recentPublishedAt > 0 ? 65 : 45;
  const sourceWeight = clamp(input.articles.length * 5, 0, 30);

  return {
    importanceScore: clamp(recencyWeight + sourceWeight, 1, 100),
    bulletPoints: bulletPoints.length ? bulletPoints : [truncate(`Update for ${input.gameName}.`, 220)],
    reconstructedArticle: sourceNames ? `${reconstructedArticle} Coverage: ${sourceNames}.` : reconstructedArticle,
    summarySource: "fallback"
  };
}

async function defaultGameStoryBuilder(input: GameStoryBuilderInput): Promise<GameStoryDraft> {
  if (!isSportsNewsLlmEnabled()) {
    return buildFallbackGameStory(input);
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return buildFallbackGameStory(input);
  }

  const response = await fetch(`${getOpenAiBaseUrl()}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: getSportsNewsModel(),
      reasoning: { effort: "low" },
      max_output_tokens: 900,
      text: {
        format: {
          type: "json_schema",
          name: "sports_game_story",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["importance_score", "bullet_points", "reconstructed_article"],
            properties: {
              importance_score: { type: "number" },
              bullet_points: {
                type: "array",
                minItems: 3,
                maxItems: 8,
                items: { type: "string" }
              },
              reconstructed_article: { type: "string" }
            }
          }
        }
      },
      input: [
        {
          role: "system",
          content: [
            "You are a football match editor.",
            "Produce one concise summary article for exactly one game using all provided sources.",
            "Use bullet points first (most important to least important).",
            "Then add a concise reconstruction paragraph in your own words.",
            "Do not repeat article titles or source names in bullet points or summary text.",
            "Avoid near-verbatim copying from source text.",
            "Return strict JSON only."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `Game: ${input.gameName}`,
            `Game date: ${input.gameDateKey}`,
            "Related articles:",
            ...input.articles.map((item, index) =>
              [
                `Article ${index + 1}`,
                `Source: ${item.sourceName}`,
                `Title: ${item.title}`,
                `URL: ${item.canonicalUrl}`,
                `PublishedAtMs: ${item.publishedAtMs ?? "unknown"}`,
                `Text: ${truncate(item.rawText, 1800)}`
              ].join("\n")
            )
          ].join("\n\n")
        }
      ]
    }),
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    return buildFallbackGameStory(input);
  }

  const text = await response.text();
  if (!text.trim()) {
    return buildFallbackGameStory(input);
  }

  try {
    const payload = JSON.parse(text) as OpenAiResponse;
    const content = parseOpenAiText(payload);
    if (!content) {
      return buildFallbackGameStory(input);
    }

    const parsed = JSON.parse(content) as {
      importance_score?: unknown;
      bullet_points?: unknown;
      reconstructed_article?: unknown;
    };

    const titleKeys = new Set(
      input.articles.map((article) => normalizeComparableText(article.title)).filter((value) => value.length >= 16)
    );
    const bulletPoints = Array.isArray(parsed.bullet_points)
      ? dedupeLines(parsed.bullet_points.map((item) => String(item ?? "").trim()).filter(Boolean))
          .filter((line) => !isHeadlineLikeSentence(line, titleKeys))
          .slice(0, 8)
      : [];
    const reconstructedSentences = dedupeLines(
      splitSentences(String(parsed.reconstructed_article ?? "").trim()).filter(Boolean)
    ).filter((line) => !isHeadlineLikeSentence(line, titleKeys));
    const reconstructedArticle = reconstructedSentences.join(" ").trim();

    if (!bulletPoints.length || !reconstructedArticle) {
      return buildFallbackGameStory(input);
    }

    return {
      importanceScore: clamp(Math.round(Number(parsed.importance_score ?? 50)), 1, 100),
      bulletPoints,
      reconstructedArticle: truncate(reconstructedArticle, 2_200),
      summarySource: "llm"
    };
  } catch {
    return buildFallbackGameStory(input);
  }
}

function buildStoryBody(draft: GameStoryDraft): string {
  return `${draft.bulletPoints.map((line) => `- ${line}`).join("\n")}\n\n${draft.reconstructedArticle}`;
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const bounded = Math.max(1, Math.min(concurrency, items.length || 1));
  let cursor = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index]);
    }
  };

  await Promise.all(Array.from({ length: bounded }, () => runWorker()));
  return results;
}

async function reportProgress(
  onProgress: FetchSportsStoriesInput["onProgress"],
  progress: SportsRefreshProgress
): Promise<void> {
  if (!onProgress) {
    return;
  }
  await onProgress(progress);
}

export class SportsNewsService {
  private readonly feedFetcher: FeedFetcher;
  private readonly feedParser: FeedParser;
  private readonly articleTextFetcher: ArticleTextFetcher;
  private readonly gameClusterBuilder: GameClusterBuilder;
  private readonly gameStoryBuilder: GameStoryBuilder;

  constructor(deps: SportsNewsServiceDeps = {}) {
    this.feedFetcher = deps.feedFetcher ?? defaultFeedFetcher;
    this.feedParser = deps.feedParser ?? parseFeedXml;
    this.articleTextFetcher = deps.articleTextFetcher ?? fetchArticleFullText;
    this.gameClusterBuilder = deps.gameClusterBuilder ?? defaultGameClusterBuilder;
    this.gameStoryBuilder = deps.gameStoryBuilder ?? defaultGameStoryBuilder;
  }

  async fetchLatestStories(input: FetchSportsStoriesInput): Promise<FetchSportsStoriesResult> {
    const sport = asSportId(input.sport);
    if (!sport) {
      throw new Error("Unsupported sport. Supported sports: football.");
    }

    const timeZone = validTimeZone(input.timeZone);
    const yesterdayDateKey = resolveYesterdayDateKey(timeZone);
    const todayDateKey = resolveTodayDateKey(timeZone);
    const selectedDateKeys = [todayDateKey, yesterdayDateKey];
    const selectedDateKeySet = new Set(selectedDateKeys);
    const feedSources = SPORT_NEWS_SOURCES[sport];

    await reportProgress(input.onProgress, {
      step: "looking_games",
      message: "Looking at games from today and yesterday."
    });

    let itemCounter = 0;
    const allItems: CandidateStoryItem[] = [];
    let failedSources = 0;

    await runWithConcurrency(feedSources, Math.min(4, feedSources.length || 1), async (source) => {
      try {
        const response = await this.feedFetcher(source.feedUrl, {
          timeoutMs: Math.max(1_000, input.feedTimeoutMs),
          userAgent: input.userAgent
        });
        const parsed = this.feedParser(response.body);

        for (const item of parsed) {
          if (!item.canonicalUrl || !item.title) {
            continue;
          }
          allItems.push({
            ...item,
            source,
            itemIndex: itemCounter
          });
          itemCounter += 1;
        }
      } catch {
        failedSources += 1;
      }
    });

    if (!allItems.length && failedSources > 0) {
      await reportProgress(input.onProgress, {
        step: "games_found",
        message: `No feed items available. ${failedSources}/${feedSources.length} sources failed.`,
        totalGames: 0,
        foundGames: []
      });
      return {
        sport,
        gameDateKey: yesterdayDateKey,
        gameDrafts: [],
        stories: []
      };
    }

    const selectedItems = allItems
      .filter((item) => typeof item.publishedAtMs === "number")
      .filter((item) => selectedDateKeySet.has(toDateKey(item.publishedAtMs as number, timeZone)))
      .filter((item) => isLikelyGameArticle(item.title, item.summary))
      .map((item) => {
        const identity = resolveMatchIdentity(item.title, item.summary);
        return { item, identity };
      })
      .filter((entry) => Boolean(entry.identity));

    const articleRefs: GameArticleReference[] = selectedItems.map(({ item, identity }) => ({
      itemIndex: item.itemIndex,
      sourceId: item.source.id,
      sourceName: item.source.name,
      title: item.title,
      summary: normalizeWhitespace(item.summary),
      canonicalUrl: item.canonicalUrl,
      publishedAtMs: item.publishedAtMs,
      matchKey: identity?.key,
      matchDisplayName: identity?.displayName
    }));

    if (!articleRefs.length) {
      const failureSuffix =
        failedSources > 0 ? ` ${failedSources}/${feedSources.length} sources failed to respond.` : "";
      await reportProgress(input.onProgress, {
        step: "games_found",
        message: `Found 0 games for today and yesterday.${failureSuffix}`,
        totalGames: 0,
        foundGames: []
      });
      return {
        sport,
        gameDateKey: yesterdayDateKey,
        gameDrafts: [],
        stories: []
      };
    }

    const refsByDate = new Map<string, GameArticleReference[]>();
    for (const articleRef of articleRefs) {
      const dateKey = toDateKey(articleRef.publishedAtMs as number, timeZone);
      if (!refsByDate.has(dateKey)) {
        refsByDate.set(dateKey, []);
      }
      refsByDate.get(dateKey)?.push(articleRef);
    }

    let gameDrafts: SportsGameDraft[] = [];
    for (const dateKey of selectedDateKeys) {
      if (isNearDeadline(input.deadlineMs, 20_000)) {
        break;
      }
      const refsForDate = refsByDate.get(dateKey) ?? [];
      if (!refsForDate.length) {
        continue;
      }

      let suggestedDrafts: SportsGameDraft[] = [];
      try {
        suggestedDrafts = await this.gameClusterBuilder({
          sport,
          gameDateKey: dateKey,
          articles: refsForDate
        });
      } catch {
        suggestedDrafts = [];
      }
      const draftsForDate = coalesceDraftsByMatchKey(
        {
          sport,
          gameDateKey: dateKey,
          articles: refsForDate
        },
        suggestedDrafts
      );
      gameDrafts = gameDrafts.concat(draftsForDate);
    }

    if (!gameDrafts.length) {
      await reportProgress(input.onProgress, {
        step: "games_found",
        message: "Found 0 games after clustering.",
        totalGames: 0,
        foundGames: []
      });
      return {
        sport,
        gameDateKey: yesterdayDateKey,
        gameDrafts: [],
        stories: []
      };
    }

    const prioritizedDrafts = [...gameDrafts].sort(compareDraftPriority);
    const selectedGameDrafts = prioritizedDrafts.slice(0, MAX_GAMES_PER_REFRESH);
    const hiddenGamesCount = Math.max(0, prioritizedDrafts.length - selectedGameDrafts.length);
    const knownGameIdSet = new Set((input.knownGameIds ?? []).map((item) => String(item)));
    const gameDraftsToGenerate = selectedGameDrafts.filter((draft) => !knownGameIdSet.has(draft.gameId));
    const remainingMs = resolveRemainingMs(input.deadlineMs) - 15_000;
    const estimatedGamesCapacity = Number.isFinite(remainingMs)
      ? Math.max(1, Math.floor(remainingMs / 30_000) * GAME_PROCESSING_CONCURRENCY)
      : gameDraftsToGenerate.length;
    const budgetedGameDraftsToGenerate = gameDraftsToGenerate.slice(
      0,
      Math.min(gameDraftsToGenerate.length, estimatedGamesCapacity)
    );
    const foundGames = selectedGameDrafts.map((draft) => draft.gameName).slice(0, 40);
    const todayGamesCount = selectedGameDrafts.filter((draft) => draft.gameDateKey === todayDateKey).length;
    const yesterdayGamesCount = selectedGameDrafts.filter((draft) => draft.gameDateKey === yesterdayDateKey).length;
    const foundMessage =
      hiddenGamesCount > 0
        ? `Found ${prioritizedDrafts.length} games (today: ${todayGamesCount}, yesterday: ${yesterdayGamesCount}). Preparing top ${selectedGameDrafts.length}.`
        : `Found ${selectedGameDrafts.length} games (today: ${todayGamesCount}, yesterday: ${yesterdayGamesCount}).`;

    await reportProgress(input.onProgress, {
      step: "games_found",
      message: foundMessage,
      totalGames: selectedGameDrafts.length,
      processedGames: 0,
      foundGames
    });

    if (!budgetedGameDraftsToGenerate.length) {
      await reportProgress(input.onProgress, {
        step: "preparing_articles",
        message:
          gameDraftsToGenerate.length > 0
            ? "Skipping generation for now to avoid timeout. Existing summaries are still available."
            : "No new games to prepare. Existing summaries are current.",
        totalGames: selectedGameDrafts.length,
        processedGames: selectedGameDrafts.length,
        foundGames
      });
      return {
        sport,
        gameDateKey: yesterdayDateKey,
        gameDrafts: selectedGameDrafts,
        stories: []
      };
    }

    let processedGames = 0;
    const storyResults = await runWithConcurrency<SportsGameDraft, SportsStory | null>(
      budgetedGameDraftsToGenerate,
      GAME_PROCESSING_CONCURRENCY,
      async (draft) => {
        if (isNearDeadline(input.deadlineMs, 15_000)) {
          processedGames += 1;
          return null;
        }
        await reportProgress(input.onProgress, {
          step: "preparing_articles",
          message: `Preparing article for ${draft.gameName}.`,
          totalGames: budgetedGameDraftsToGenerate.length,
          processedGames,
          gameName: draft.gameName,
          foundGames
        });

        const distinctSourceIdsForDraft = new Set(draft.articleRefs.map((item) => item.sourceId));
        const minSourcesPerGame = getSportsNewsMinSourcesPerGame();
        if (distinctSourceIdsForDraft.size < minSourcesPerGame) {
          processedGames += 1;
          await reportProgress(input.onProgress, {
            step: "preparing_articles",
            message: `Skipped ${draft.gameName} because coverage from at least ${minSourcesPerGame} source(s) is required.`,
            totalGames: budgetedGameDraftsToGenerate.length,
            processedGames,
            gameName: draft.gameName,
            foundGames
          });
          return null;
        }

        const storyArticleRefs = selectArticlesForStory(draft.articleRefs, getSportsNewsMaxArticlesPerGame());
        const fetchSportsFullText = shouldFetchSportsNewsFullText();
        const articleFetchConcurrency = getSportsNewsArticleConcurrency();
        const enrichedArticles = fetchSportsFullText
          ? await runWithConcurrency(storyArticleRefs, articleFetchConcurrency, async (articleRef) => {
              try {
                const fullText = await this.articleTextFetcher(articleRef.canonicalUrl, {
                  timeoutMs: Math.max(1_000, input.articleTimeoutMs),
                  userAgent: input.userAgent
                });
                const sanitized = sanitizeArticleNarrativeText(fullText);
                if (sanitized.length >= MIN_SPORTS_FULL_TEXT_CHARS) {
                  return {
                    ...articleRef,
                    rawText: sanitized,
                    fullTextStatus: "ready"
                  } satisfies GameStoryArticleInput;
                }
                return {
                  ...articleRef,
                  rawText: articleRef.summary,
                  fullTextStatus: "fallback"
                } satisfies GameStoryArticleInput;
              } catch {
                return {
                  ...articleRef,
                  rawText: articleRef.summary,
                  fullTextStatus: "fallback"
                } satisfies GameStoryArticleInput;
              }
            })
          : storyArticleRefs.map(
              (articleRef) =>
                ({
                  ...articleRef,
                  rawText: articleRef.summary,
                  fullTextStatus: "fallback"
                } satisfies GameStoryArticleInput)
            );

        const readyArticles = enrichedArticles.filter((item) => item.fullTextStatus === "ready");
        if (fetchSportsFullText && readyArticles.length === 0) {
          processedGames += 1;
          await reportProgress(input.onProgress, {
            step: "preparing_articles",
            message: `Skipped ${draft.gameName} due to unavailable full article content.`,
            totalGames: budgetedGameDraftsToGenerate.length,
            processedGames,
            gameName: draft.gameName,
            foundGames
          });
          return null;
        }
        const usableArticles = readyArticles.length ? readyArticles : enrichedArticles;
        if (!usableArticles.length) {
          processedGames += 1;
          await reportProgress(input.onProgress, {
            step: "preparing_articles",
            message: `Processed ${processedGames}/${budgetedGameDraftsToGenerate.length} games.`,
            totalGames: budgetedGameDraftsToGenerate.length,
            processedGames,
            gameName: draft.gameName,
            foundGames
          });
          return null;
        }

        const fallbackStory = buildFallbackGameStory({
          sport,
          gameName: draft.gameName,
          gameDateKey: draft.gameDateKey,
          articles: usableArticles
        });

        let storyDraft = fallbackStory;
        try {
          storyDraft = await this.gameStoryBuilder({
            sport,
            gameName: draft.gameName,
            gameDateKey: draft.gameDateKey,
            articles: usableArticles
          });
        } catch {
          storyDraft = fallbackStory;
        }

        const uniqueSourceIds = Array.from(new Set(draft.articleRefs.map((item) => item.sourceId)));
        const uniqueSourceNames = Array.from(new Set(draft.articleRefs.map((item) => item.sourceName)));
        const latestPublishedAtMs = Math.max(...draft.articleRefs.map((item) => item.publishedAtMs ?? 0));
        const firstArticle = usableArticles[0] ?? draft.articleRefs[0];
        processedGames += 1;

        await reportProgress(input.onProgress, {
          step: "preparing_articles",
          message: `Processed ${processedGames}/${budgetedGameDraftsToGenerate.length} games.`,
          totalGames: budgetedGameDraftsToGenerate.length,
          processedGames,
          gameName: draft.gameName,
          foundGames
        });

        const nextStory: SportsStory = {
          id: `${sport}-${draft.gameId}`,
          sport,
          sourceId: uniqueSourceIds.join(", "),
          sourceName: uniqueSourceNames.join(", "),
          title: `${draft.gameName} - ${draft.gameDateKey}`,
          canonicalUrl: firstArticle?.canonicalUrl ?? "",
          publishedAtMs: latestPublishedAtMs > 0 ? latestPublishedAtMs : undefined,
          gameId: draft.gameId,
          gameName: draft.gameName,
          gameDateKey: draft.gameDateKey,
          importanceScore: storyDraft.importanceScore,
          bulletPoints: storyDraft.bulletPoints,
          reconstructedArticle: storyDraft.reconstructedArticle,
          story: buildStoryBody(storyDraft),
          fullTextStatus: readyArticles.length > 0 ? "ready" : "fallback",
          summarySource: storyDraft.summarySource
        };
        if (input.onStoryReady) {
          await input.onStoryReady(nextStory);
        }
        return nextStory;
      }
    );

    const sortedStories = storyResults
      .filter((story): story is SportsStory => story !== null)
      .sort((a, b) => {
        if (b.importanceScore !== a.importanceScore) {
          return b.importanceScore - a.importanceScore;
        }
        return (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0);
      });

    const boundedLimit = Math.max(1, Math.min(60, Math.floor(input.limit)));

    return {
      sport,
      gameDateKey: yesterdayDateKey,
      gameDrafts: selectedGameDrafts,
      stories: sortedStories.slice(0, boundedLimit)
    };
  }
}
