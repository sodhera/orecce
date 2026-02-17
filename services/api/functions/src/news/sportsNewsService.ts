import { fetchArticleFullText } from "./articleTextFetcher";
import { parseFeedXml } from "./feedParser";
import { ParsedFeedArticle } from "./types";
import { SportFeedSource, SportId, SPORT_NEWS_SOURCES } from "./sportsNewsSources";
import { getOpenAiApiKey, getOpenAiBaseUrl } from "../config/runtimeConfig";

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
type StoryBuilder = (input: BuildStoryInput) => Promise<StoryDraft>;

interface SportsNewsServiceDeps {
  feedFetcher?: FeedFetcher;
  feedParser?: FeedParser;
  articleTextFetcher?: ArticleTextFetcher;
  storyBuilder?: StoryBuilder;
}

export interface SportsStory {
  id: string;
  sport: SportId;
  sourceId: string;
  sourceName: string;
  title: string;
  canonicalUrl: string;
  publishedAtMs?: number;
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
}

interface CandidateStoryItem extends ParsedFeedArticle {
  source: SportFeedSource;
}

interface BuildStoryInput {
  title: string;
  sourceName: string;
  canonicalUrl: string;
  publishedAtMs?: number;
  rawText: string;
}

interface StoryDraft {
  importanceScore: number;
  bulletPoints: string[];
  reconstructedArticle: string;
  summarySource: "llm" | "fallback";
}

interface OpenAiSummaryResponse {
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

function computeRecencyScore(publishedAtMs: number | undefined): number {
  if (!publishedAtMs) {
    return 35;
  }
  const hoursOld = Math.max(0, (Date.now() - publishedAtMs) / 3_600_000);
  if (hoursOld <= 2) {
    return 95;
  }
  if (hoursOld <= 6) {
    return 85;
  }
  if (hoursOld <= 24) {
    return 72;
  }
  if (hoursOld <= 48) {
    return 60;
  }
  return 45;
}

function computeTopicWeight(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  const highPriority = [
    "breaking",
    "sacked",
    "injury",
    "transfer",
    "final",
    "champions league",
    "world cup",
    "title race",
    "relegation"
  ];
  const mediumPriority = ["goal", "manager", "derby", "ban", "contract", "cup"];

  for (const token of highPriority) {
    if (lower.includes(token)) {
      score += 8;
    }
  }
  for (const token of mediumPriority) {
    if (lower.includes(token)) {
      score += 4;
    }
  }
  return clamp(score, 0, 35);
}

function buildFallbackStoryDraft(input: BuildStoryInput): StoryDraft {
  const sentences = splitSentences(input.rawText);
  const bulletPoints = (sentences.length ? sentences : [input.title])
    .slice(0, 6)
    .map((sentence) => truncate(sentence, 180));
  const reconstructedArticle = sentences.length
    ? truncate(sentences.slice(0, 7).join(" "), 1_400)
    : `${input.title}. Source: ${input.sourceName}.`;
  const importanceScore = clamp(
    Math.round(computeRecencyScore(input.publishedAtMs) + computeTopicWeight(`${input.title} ${input.rawText}`)),
    1,
    100
  );

  return {
    importanceScore,
    bulletPoints,
    reconstructedArticle,
    summarySource: "fallback"
  };
}

function parseOpenAiText(json: OpenAiSummaryResponse): string {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }
  if (Array.isArray(json.output)) {
    const text = json.output
      .filter((item) => item.type === "message" || item.type === undefined)
      .flatMap((item) => item.content ?? [])
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function parseStoryDraftFromOpenAi(content: string): StoryDraft {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const bulletPointsRaw = Array.isArray(parsed.bullet_points) ? parsed.bullet_points : [];
  const bulletPoints = bulletPointsRaw
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 7);
  const reconstructedArticle = String(parsed.reconstructed_article ?? "")
    .trim()
    .slice(0, 2_200);
  const importanceScore = clamp(Math.round(Number(parsed.importance_score ?? 50)), 1, 100);

  if (!bulletPoints.length || !reconstructedArticle) {
    throw new Error("invalid-llm-summary-payload");
  }

  return {
    importanceScore,
    bulletPoints,
    reconstructedArticle,
    summarySource: "llm"
  };
}

async function defaultStoryBuilder(input: BuildStoryInput): Promise<StoryDraft> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return buildFallbackStoryDraft(input);
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
      max_output_tokens: 800,
      text: {
        format: {
          type: "json_schema",
          name: "sports_news_summary",
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
                maxItems: 7,
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
            "You are a sports news editor.",
            "Return strict JSON only.",
            "Use concise factual tone.",
            "Bullet points must be ordered from most important to least important.",
            "importance_score is 1-100 where 100 is urgent and globally significant."
          ].join("\n")
        },
        {
          role: "user",
          content: [
            `Sport: football`,
            `Source: ${input.sourceName}`,
            `Title: ${input.title}`,
            `URL: ${input.canonicalUrl}`,
            `PublishedAtMs: ${input.publishedAtMs ?? "unknown"}`,
            "Write 3-7 bullet points, then a reconstructed short article in 2-4 paragraphs.",
            "Text to reconstruct from:",
            input.rawText.slice(0, 12_000)
          ].join("\n\n")
        }
      ]
    }),
    signal: AbortSignal.timeout(16_000)
  });

  if (!response.ok) {
    return buildFallbackStoryDraft(input);
  }

  const text = await response.text();
  if (!text.trim()) {
    return buildFallbackStoryDraft(input);
  }

  try {
    const payload = JSON.parse(text) as OpenAiSummaryResponse;
    const content = parseOpenAiText(payload);
    if (!content) {
      return buildFallbackStoryDraft(input);
    }
    return parseStoryDraftFromOpenAi(content);
  } catch {
    return buildFallbackStoryDraft(input);
  }
}

function buildLegacyStoryBody(sourceName: string, draft: StoryDraft): string {
  return `${draft.bulletPoints.map((line) => `- ${line}`).join("\n")}\n\n${draft.reconstructedArticle}\n\nSource: ${sourceName}`;
}

function asSportId(value: string): SportId | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "football" ? "football" : null;
}

export class SportsNewsService {
  private readonly feedFetcher: FeedFetcher;
  private readonly feedParser: FeedParser;
  private readonly articleTextFetcher: ArticleTextFetcher;
  private readonly storyBuilder: StoryBuilder;

  constructor(deps: SportsNewsServiceDeps = {}) {
    this.feedFetcher = deps.feedFetcher ?? defaultFeedFetcher;
    this.feedParser = deps.feedParser ?? parseFeedXml;
    this.articleTextFetcher = deps.articleTextFetcher ?? fetchArticleFullText;
    this.storyBuilder = deps.storyBuilder ?? defaultStoryBuilder;
  }

  async fetchLatestStories(input: FetchSportsStoriesInput): Promise<{ sport: SportId; stories: SportsStory[] }> {
    const sport = asSportId(input.sport);
    if (!sport) {
      throw new Error("Unsupported sport. Supported sports: football.");
    }

    const feedSources = SPORT_NEWS_SOURCES[sport];
    const candidateItems: CandidateStoryItem[] = [];

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
          candidateItems.push({
            ...item,
            source
          });
        }
      })
    );

    const uniqueByUrl = new Map<string, CandidateStoryItem>();
    for (const item of candidateItems) {
      if (!uniqueByUrl.has(item.canonicalUrl)) {
        uniqueByUrl.set(item.canonicalUrl, item);
      }
    }

    const sorted = Array.from(uniqueByUrl.values()).sort(
      (a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0)
    );
    const boundedLimit = Math.max(1, Math.min(20, Math.floor(input.limit)));
    const selected = sorted.slice(0, boundedLimit);

    const stories = await Promise.all(
      selected.map(async (item, index) => {
        let rawText = normalizeWhitespace(item.summary);
        let fullTextStatus: SportsStory["fullTextStatus"] = "fallback";
        try {
          const fetchedText = await this.articleTextFetcher(item.canonicalUrl, {
            timeoutMs: Math.max(1_000, input.articleTimeoutMs),
            userAgent: input.userAgent
          });
          if (fetchedText.trim()) {
            rawText = fetchedText;
            fullTextStatus = "ready";
          }
        } catch {
          rawText = normalizeWhitespace(item.summary);
        }

        const fallbackDraft = buildFallbackStoryDraft({
          title: item.title,
          sourceName: item.source.name,
          canonicalUrl: item.canonicalUrl,
          publishedAtMs: item.publishedAtMs,
          rawText
        });

        let draft = fallbackDraft;
        try {
          draft = await this.storyBuilder({
            title: item.title,
            sourceName: item.source.name,
            canonicalUrl: item.canonicalUrl,
            publishedAtMs: item.publishedAtMs,
            rawText
          });
        } catch {
          draft = fallbackDraft;
        }

        return {
          id: `${sport}-${index + 1}`,
          sport,
          sourceId: item.source.id,
          sourceName: item.source.name,
          title: item.title,
          canonicalUrl: item.canonicalUrl,
          publishedAtMs: item.publishedAtMs,
          importanceScore: draft.importanceScore,
          bulletPoints: draft.bulletPoints,
          reconstructedArticle: draft.reconstructedArticle,
          story: buildLegacyStoryBody(item.source.name, draft),
          fullTextStatus,
          summarySource: draft.summarySource
        } satisfies SportsStory;
      })
    );

    const rankedStories = stories.sort((a, b) => {
      if (b.importanceScore !== a.importanceScore) {
        return b.importanceScore - a.importanceScore;
      }
      return (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0);
    });

    return { sport, stories: rankedStories };
  }
}
