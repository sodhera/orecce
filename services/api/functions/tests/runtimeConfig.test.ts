import { afterEach, describe, expect, it } from "vitest";
import {
  getNewsArticleConcurrency,
  getNewsArticleTimeoutMs,
  getNewsMaxArticlesPerSource,
  getNewsSourceConcurrency,
  getOpenAiApiKey,
  isNewsSyncEnabled,
  shouldFetchNewsFullText
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
    process.env.NEWS_SOURCE_CONCURRENCY = "0";
    process.env.NEWS_ARTICLE_TIMEOUT_MS = "999999";
    process.env.NEWS_ARTICLE_CONCURRENCY = "-1";

    expect(getNewsMaxArticlesPerSource()).toBe(200);
    expect(getNewsSourceConcurrency()).toBe(1);
    expect(getNewsArticleTimeoutMs()).toBe(45000);
    expect(getNewsArticleConcurrency()).toBe(1);
  });

  it("fetches full text by default and allows explicit false", () => {
    delete process.env.NEWS_FETCH_FULL_TEXT;
    expect(shouldFetchNewsFullText()).toBe(true);

    process.env.NEWS_FETCH_FULL_TEXT = "false";
    expect(shouldFetchNewsFullText()).toBe(false);
  });
});
