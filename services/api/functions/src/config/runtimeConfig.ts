import * as functionsV1 from "firebase-functions/v1";

function normalizeSecret(rawValue: string | undefined): string {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function readFirebaseConfig(): Record<string, unknown> {
  try {
    return (functionsV1.config?.() ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getNestedConfigString(path: string[]): string | undefined {
  const config = readFirebaseConfig();
  let cursor: unknown = config;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" && cursor.trim() ? cursor.trim() : undefined;
}

export function getOpenAiApiKey(): string {
  return (
    normalizeSecret(process.env.OPENAI_API_KEY) ||
    normalizeSecret(process.env.OPENAI_KEY) ||
    normalizeSecret(getNestedConfigString(["openai", "key"])) ||
    ""
  );
}

export function getOpenAiModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    getNestedConfigString(["openai", "model"]) ||
    "gpt-5.2-2025-12-11"
  );
}

export function getOpenAiBaseUrl(): string {
  return process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
}

export function getGenerationTemperature(): number {
  return 0.3;
}

function envFlagTrue(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const normalized = raw?.trim();
  if (!normalized) {
    return fallback;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function isMockLlmEnabled(): boolean {
  return envFlagTrue(process.env.MOCK_LLM_OVERRIDE) || envFlagTrue(process.env.MOCK_LLM);
}

export function getDefaultPrefillPostsPerMode(): number {
  const raw = process.env.PREFILL_POSTS_PER_MODE?.trim();
  const value = Number(raw ?? "8");
  if (!Number.isFinite(value) || value <= 0) {
    return 8;
  }
  return Math.max(1, Math.min(60, Math.floor(value)));
}

export function isNewsSyncEnabled(): boolean {
  const raw = process.env.NEWS_SYNC_ENABLED?.trim();
  if (!raw) {
    return true;
  }
  return raw.toLowerCase() !== "false";
}

export function getNewsMaxSourcesPerRun(): number {
  return parseBoundedInt(process.env.NEWS_MAX_SOURCES_PER_RUN, 12, 1, 50);
}

export function getNewsMaxArticlesPerSource(): number {
  return parseBoundedInt(process.env.NEWS_MAX_ARTICLES_PER_SOURCE, 25, 1, 200);
}

export function getNewsSourceConcurrency(): number {
  return parseBoundedInt(process.env.NEWS_SOURCE_CONCURRENCY, 4, 1, 10);
}

export function getNewsFeedTimeoutMs(): number {
  return parseBoundedInt(process.env.NEWS_FEED_TIMEOUT_MS, 8000, 1000, 30000);
}

export function getNewsArticleTimeoutMs(): number {
  return parseBoundedInt(process.env.NEWS_ARTICLE_TIMEOUT_MS, 12000, 1000, 45000);
}

export function getNewsArticleConcurrency(): number {
  return parseBoundedInt(process.env.NEWS_ARTICLE_CONCURRENCY, 2, 1, 6);
}

export function shouldFetchNewsFullText(): boolean {
  const raw = process.env.NEWS_FETCH_FULL_TEXT?.trim();
  if (!raw) {
    return true;
  }
  return raw.toLowerCase() !== "false";
}

export function isSportsNewsLlmEnabled(): boolean {
  return envFlagTrue(process.env.SPORTS_NEWS_LLM_ENABLED);
}

export function shouldFetchSportsNewsFullText(): boolean {
  return envFlagTrue(process.env.SPORTS_NEWS_FETCH_FULL_TEXT);
}

export function getSportsNewsMaxArticlesPerGame(): number {
  return parseBoundedInt(process.env.SPORTS_NEWS_MAX_ARTICLES_PER_GAME, 3, 1, 8);
}

export function getSportsNewsArticleConcurrency(): number {
  return parseBoundedInt(process.env.SPORTS_NEWS_ARTICLE_CONCURRENCY, 2, 1, 4);
}

export function getNewsCrawlerUserAgent(): string {
  const value = process.env.NEWS_CRAWLER_USER_AGENT?.trim();
  if (value) {
    return value;
  }
  return "OrecceNewsBot/1.0 (+https://orecce.local/news-ingest)";
}
