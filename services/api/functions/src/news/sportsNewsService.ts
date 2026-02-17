import { createHash } from "crypto";
import { getOpenAiApiKey, getOpenAiBaseUrl } from "../config/runtimeConfig";
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
  timeZone?: string;
}

export interface FetchSportsStoriesResult {
  sport: SportId;
  gameDateKey: string;
  gameDrafts: SportsGameDraft[];
  stories: SportsStory[];
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

function extractGameNameFromText(value: string): string | null {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const scorelineMatch = normalized.match(/^(.+?)\s+\d+\s*[-–]\s*\d+\s+(.+)$/i);
  if (scorelineMatch) {
    return `${scorelineMatch[1].trim()} vs ${scorelineMatch[2].trim()}`;
  }

  const versusMatch = normalized.match(/^(.+?)\s+(?:vs|v|against)\s+(.+)$/i);
  if (versusMatch) {
    return `${versusMatch[1].trim()} vs ${versusMatch[2].trim()}`;
  }

  const beatMatch = normalized.match(/^(.+?)\s+(?:beat|beats|defeat|defeats|defeated|edge|edges|edged)\s+(.+)$/i);
  if (beatMatch) {
    return `${beatMatch[1].trim()} vs ${beatMatch[2].trim()}`;
  }

  return null;
}

function buildFallbackGameDrafts(input: GameClusterBuilderInput): SportsGameDraft[] {
  const byGame = new Map<string, GameArticleReference[]>();

  for (const article of input.articles) {
    const inferred = extractGameNameFromText(article.title) || extractGameNameFromText(article.summary) || article.title;
    const gameName = truncate(normalizeWhitespace(inferred), 120);
    if (!gameName) {
      continue;
    }
    if (!byGame.has(gameName)) {
      byGame.set(gameName, []);
    }
    byGame.get(gameName)?.push(article);
  }

  return Array.from(byGame.entries()).map(([gameName, articleRefs]) => ({
    gameId: hashText(`${input.sport}:${input.gameDateKey}:${gameName.toLowerCase()}`),
    gameName,
    gameDateKey: input.gameDateKey,
    articleRefs: articleRefs.sort((a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0))
  }));
}

async function defaultGameClusterBuilder(input: GameClusterBuilderInput): Promise<SportsGameDraft[]> {
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
      model: "gpt-5-mini",
      reasoning: { effort: "minimal" },
      max_output_tokens: 1200,
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
  const allText = input.articles.map((article) => article.rawText).join(" ");
  const sentences = splitSentences(allText);
  const bulletPoints = (sentences.length ? sentences : input.articles.map((item) => item.summary))
    .map((value) => truncate(value, 220))
    .filter(Boolean)
    .slice(0, 6);
  const reconstructedArticle = truncate(
    (sentences.length ? sentences.join(" ") : input.articles.map((item) => item.summary).join(" ")) ||
      `Match summary for ${input.gameName}.`,
    1_600
  );

  const recentPublishedAt = Math.max(...input.articles.map((article) => article.publishedAtMs ?? 0));
  const recencyWeight = recentPublishedAt > 0 ? 65 : 45;
  const sourceWeight = clamp(input.articles.length * 5, 0, 30);

  return {
    importanceScore: clamp(recencyWeight + sourceWeight, 1, 100),
    bulletPoints: bulletPoints.length ? bulletPoints : [truncate(`Update for ${input.gameName}.`, 220)],
    reconstructedArticle,
    summarySource: "fallback"
  };
}

async function defaultGameStoryBuilder(input: GameStoryBuilderInput): Promise<GameStoryDraft> {
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
      model: "gpt-5-mini",
      reasoning: { effort: "minimal" },
      max_output_tokens: 1200,
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
            "Produce one concise summary article for exactly one game.",
            "Use bullet points first (most important to least important).",
            "Then add a concise reconstruction paragraph.",
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
                `Text: ${truncate(item.rawText, 3600)}`
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

    const bulletPoints = Array.isArray(parsed.bullet_points)
      ? parsed.bullet_points.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8)
      : [];
    const reconstructedArticle = String(parsed.reconstructed_article ?? "").trim();

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

    let itemCounter = 0;
    const allItems: CandidateStoryItem[] = [];

    await Promise.all(
      feedSources.map(async (source) => {
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
      })
    );

    const selectedItems = allItems
      .filter((item) => typeof item.publishedAtMs === "number")
      .filter((item) => selectedDateKeySet.has(toDateKey(item.publishedAtMs as number, timeZone)));

    const articleRefs: GameArticleReference[] = selectedItems.map((item) => ({
      itemIndex: item.itemIndex,
      sourceId: item.source.id,
      sourceName: item.source.name,
      title: item.title,
      summary: normalizeWhitespace(item.summary),
      canonicalUrl: item.canonicalUrl,
      publishedAtMs: item.publishedAtMs
    }));

    if (!articleRefs.length) {
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
      const refsForDate = refsByDate.get(dateKey) ?? [];
      if (!refsForDate.length) {
        continue;
      }

      let draftsForDate = await this.gameClusterBuilder({
        sport,
        gameDateKey: dateKey,
        articles: refsForDate
      });

      if (!draftsForDate.length) {
        draftsForDate = buildFallbackGameDrafts({
          sport,
          gameDateKey: dateKey,
          articles: refsForDate
        });
      }
      gameDrafts = gameDrafts.concat(draftsForDate);
    }

    if (!gameDrafts.length) {
      return {
        sport,
        gameDateKey: yesterdayDateKey,
        gameDrafts: [],
        stories: []
      };
    }

    const storyResults = await runWithConcurrency(gameDrafts, 3, async (draft) => {
      const enrichedArticles = await runWithConcurrency(draft.articleRefs, 4, async (articleRef) => {
        try {
          const fullText = await this.articleTextFetcher(articleRef.canonicalUrl, {
            timeoutMs: Math.max(1_000, input.articleTimeoutMs),
            userAgent: input.userAgent
          });
          if (fullText.trim()) {
            return {
              ...articleRef,
              rawText: fullText,
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
      });

      const fallbackStory = buildFallbackGameStory({
        sport,
        gameName: draft.gameName,
        gameDateKey: draft.gameDateKey,
        articles: enrichedArticles
      });

      let storyDraft = fallbackStory;
      try {
        storyDraft = await this.gameStoryBuilder({
          sport,
          gameName: draft.gameName,
          gameDateKey: draft.gameDateKey,
          articles: enrichedArticles
        });
      } catch {
        storyDraft = fallbackStory;
      }

      const uniqueSourceIds = Array.from(new Set(draft.articleRefs.map((item) => item.sourceId)));
      const uniqueSourceNames = Array.from(new Set(draft.articleRefs.map((item) => item.sourceName)));
      const latestPublishedAtMs = Math.max(...draft.articleRefs.map((item) => item.publishedAtMs ?? 0));
      const firstArticle = draft.articleRefs[0];
      const anyFullText = enrichedArticles.some((item) => item.fullTextStatus === "ready");

      return {
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
        fullTextStatus: anyFullText ? "ready" : "fallback",
        summarySource: storyDraft.summarySource
      } satisfies SportsStory;
    });

    const sortedStories = storyResults.sort((a, b) => {
      if (b.importanceScore !== a.importanceScore) {
        return b.importanceScore - a.importanceScore;
      }
      return (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0);
    });

    const boundedLimit = Math.max(1, Math.min(60, Math.floor(input.limit)));

    return {
      sport,
      gameDateKey: yesterdayDateKey,
      gameDrafts,
      stories: sortedStories.slice(0, boundedLimit)
    };
  }
}
