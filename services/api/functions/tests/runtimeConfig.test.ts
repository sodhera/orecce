import { afterEach, describe, expect, it } from "vitest";
import {
  getNewsArticleConcurrency,
  getNewsArticleTimeoutMs,
  getNewsMaxArticlesPerSource,
  getNewsMaxSourcesPerRun,
  getNewsSourceConcurrency,
  getOpenAiApiKey,
  getSportsNewsModel,
  getSportsNewsArticleConcurrency,
  getSportsNewsMaxArticlesPerGame,
  isNewsSyncEnabled,
  isSportsNewsLlmEnabled,
  shouldFetchNewsFullText,
  shouldFetchSportsNewsFullText
} from "../src/config/runtimeConfig";

const ORIGINAL_ENV = { ...process.env };

describe("runtimeConfig", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("normalizes quoted OPENAI_API_KEY values", () => {
    process.env.OPENAI_API_KEY = "\"sk-test-quoted\"";
    expect(getOpenAiApiKey()).toBe("sk-test-quoted");
  });

  it("falls back to OPENAI_KEY and strips single quotes", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_KEY = "'sk-test-fallback'";
    expect(getOpenAiApiKey()).toBe("sk-test-fallback");
  });

  it("keeps news sync enabled by default and supports explicit false", () => {
    delete process.env.NEWS_SYNC_ENABLED;
    expect(isNewsSyncEnabled()).toBe(true);

    process.env.NEWS_SYNC_ENABLED = "false";
    expect(isNewsSyncEnabled()).toBe(false);
  });

  it("parses bounded news sync numeric settings", () => {
    process.env.NEWS_MAX_ARTICLES_PER_SOURCE = "500";
    process.env.NEWS_MAX_SOURCES_PER_RUN = "0";
    process.env.NEWS_SOURCE_CONCURRENCY = "0";
    process.env.NEWS_ARTICLE_TIMEOUT_MS = "999999";
    process.env.NEWS_ARTICLE_CONCURRENCY = "-1";

    expect(getNewsMaxArticlesPerSource()).toBe(200);
    expect(getNewsMaxSourcesPerRun()).toBe(1);
    expect(getNewsSourceConcurrency()).toBe(1);
    expect(getNewsArticleTimeoutMs()).toBe(45000);
    expect(getNewsArticleConcurrency()).toBe(1);
  });

  it("uses fallback defaults when numeric settings are unset", () => {
    delete process.env.NEWS_MAX_ARTICLES_PER_SOURCE;
    delete process.env.NEWS_MAX_SOURCES_PER_RUN;
    delete process.env.NEWS_SOURCE_CONCURRENCY;
    delete process.env.NEWS_ARTICLE_TIMEOUT_MS;
    delete process.env.NEWS_ARTICLE_CONCURRENCY;

    expect(getNewsMaxArticlesPerSource()).toBe(25);
    expect(getNewsMaxSourcesPerRun()).toBe(12);
    expect(getNewsSourceConcurrency()).toBe(4);
    expect(getNewsArticleTimeoutMs()).toBe(12000);
    expect(getNewsArticleConcurrency()).toBe(2);
  });

  it("fetches full text by default and allows explicit false", () => {
    delete process.env.NEWS_FETCH_FULL_TEXT;
    expect(shouldFetchNewsFullText()).toBe(true);

    process.env.NEWS_FETCH_FULL_TEXT = "false";
    expect(shouldFetchNewsFullText()).toBe(false);
  });

  it("keeps sports LLM and full text enabled by default", () => {
    delete process.env.SPORTS_NEWS_LLM_ENABLED;
    delete process.env.SPORTS_NEWS_FETCH_FULL_TEXT;

    expect(isSportsNewsLlmEnabled()).toBe(true);
    expect(shouldFetchSportsNewsFullText()).toBe(true);
  });

  it("supports explicit sports LLM/full text flags and bounded tuning", () => {
    process.env.SPORTS_NEWS_LLM_ENABLED = "false";
    process.env.SPORTS_NEWS_FETCH_FULL_TEXT = "false";
    process.env.SPORTS_NEWS_MAX_ARTICLES_PER_GAME = "99";
    process.env.SPORTS_NEWS_ARTICLE_CONCURRENCY = "0";

    expect(isSportsNewsLlmEnabled()).toBe(false);
    expect(shouldFetchSportsNewsFullText()).toBe(false);
    expect(getSportsNewsMaxArticlesPerGame()).toBe(8);
    expect(getSportsNewsArticleConcurrency()).toBe(1);
  });

  it("uses sports model override when set", () => {
    process.env.OPENAI_MODEL = "gpt-5.2-2025-12-11";
    delete process.env.SPORTS_NEWS_MODEL;
    expect(getSportsNewsModel()).toBe("gpt-5.2-2025-12-11");

    process.env.SPORTS_NEWS_MODEL = "gpt-5-mini";
    expect(getSportsNewsModel()).toBe("gpt-5-mini");
  });
});
