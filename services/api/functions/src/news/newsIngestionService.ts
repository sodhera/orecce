import { fetchArticleFullText } from "./articleTextFetcher";
import { parseFeedXml } from "./feedParser";
import {
  NewsSourceConfig,
  NewsSyncRepository,
  NewsSyncRunResult,
  ParsedFeedArticle,
  SourceSyncResult
} from "./types";
import { logError, logInfo, logWarn } from "../utils/logging";

interface FetchFeedOptions {
  timeoutMs: number;
  userAgent: string;
}

interface FeedFetchResult {
  status: number;
  body: string;
}

type ArticleTextFetcher = (url: string, options: FetchFeedOptions) => Promise<string>;
type FeedFetcher = (url: string, options: FetchFeedOptions) => Promise<FeedFetchResult>;
type FeedParser = (xml: string) => ParsedFeedArticle[];

interface NewsIngestionServiceDeps {
  repository: NewsSyncRepository;
  sources: NewsSourceConfig[];
  feedFetcher?: FeedFetcher;
  feedParser?: FeedParser;
  articleTextFetcher?: ArticleTextFetcher;
}

export interface NewsSyncOptions {
  maxArticlesPerSource: number;
  sourceConcurrency: number;
  feedTimeoutMs: number;
  articleTimeoutMs: number;
  articleConcurrency: number;
  fetchFullText: boolean;
  userAgent: string;
  schedule: string;
  deadlineMs?: number;
  maxSourcesPerRun?: number;
}

class HttpStatusError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
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
    throw new HttpStatusError(`Feed request failed with status ${response.status}.`, response.status);
  }

  return {
    status: response.status,
    body
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars).trim()}...`;
}

function normalizeCategories(categories: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const category of categories) {
    const normalized = normalizeWhitespace(category);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= 12) {
      break;
    }
  }
  return result;
}

export class NewsIngestionService {
  private readonly repository: NewsSyncRepository;
  private readonly sources: NewsSourceConfig[];
  private readonly feedFetcher: FeedFetcher;
  private readonly feedParser: FeedParser;
  private readonly articleTextFetcher: ArticleTextFetcher;

  constructor(deps: NewsIngestionServiceDeps) {
    this.repository = deps.repository;
    this.sources = deps.sources;
    this.feedFetcher = deps.feedFetcher ?? defaultFeedFetcher;
    this.feedParser = deps.feedParser ?? parseFeedXml;
    this.articleTextFetcher = deps.articleTextFetcher ?? fetchArticleFullText;
  }

  async syncAllSources(options: NewsSyncOptions): Promise<NewsSyncRunResult> {
    const startedAtMs = Date.now();
    const runId = `news-sync-${startedAtMs}`;
    const sourceLimit =
      typeof options.maxSourcesPerRun === "number" && options.maxSourcesPerRun > 0
        ? Math.min(options.maxSourcesPerRun, this.sources.length)
        : this.sources.length;
    const sourcesToProcess = this.sources.slice(0, sourceLimit);

    logInfo("news.sync.run.start", {
      run_id: runId,
      source_count: sourcesToProcess.length,
      max_articles_per_source: options.maxArticlesPerSource,
      source_concurrency: options.sourceConcurrency,
      feed_timeout_ms: options.feedTimeoutMs,
      article_timeout_ms: options.articleTimeoutMs,
      article_concurrency: options.articleConcurrency,
      fetch_full_text: options.fetchFullText,
      schedule: options.schedule
    });

    const sourceResults = await this.runWithConcurrency(
      sourcesToProcess,
      Math.max(1, Math.min(options.sourceConcurrency, sourcesToProcess.length || 1)),
      async (source) => this.syncSingleSource(runId, source, options)
    );

    const completedAtMs = Date.now();
    await this.repository.recordSyncRun({
      runId,
      startedAtMs,
      completedAtMs,
      schedule: options.schedule,
      sourceResults
    });

    const result: NewsSyncRunResult = {
      runId,
      startedAtMs,
      completedAtMs,
      sourceResults,
      totalFetchedCount: sourceResults.reduce((sum, item) => sum + item.fetchedCount, 0),
      totalInsertedCount: sourceResults.reduce((sum, item) => sum + item.insertedCount, 0),
      totalUpdatedCount: sourceResults.reduce((sum, item) => sum + item.updatedCount, 0),
      totalUnchangedCount: sourceResults.reduce((sum, item) => sum + item.unchangedCount, 0)
    };

    logInfo("news.sync.run.complete", {
      run_id: result.runId,
      duration_ms: result.completedAtMs - result.startedAtMs,
      source_count: result.sourceResults.length,
      fetched_count: result.totalFetchedCount,
      inserted_count: result.totalInsertedCount,
      updated_count: result.totalUpdatedCount
    });

    return result;
  }

  private async syncSingleSource(
    runId: string,
    source: NewsSourceConfig,
    options: NewsSyncOptions
  ): Promise<SourceSyncResult> {
    const startedAtMs = Date.now();
    const remainingMs = typeof options.deadlineMs === "number" ? options.deadlineMs - startedAtMs : Infinity;
    if (remainingMs <= 1_500) {
      const skipped: SourceSyncResult = {
        sourceId: source.id,
        sourceName: source.name,
        status: "skipped",
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        durationMs: 0,
        errorMessage: "Skipped to stay within function deadline."
      };
      await this.repository.recordSourceSyncState({
        source,
        runId,
        ...skipped
      });
      return skipped;
    }

    try {
      const feed = await this.feedFetcher(source.feedUrl, {
        timeoutMs: Math.max(1_000, options.feedTimeoutMs),
        userAgent: options.userAgent
      });
      const parsedItems = this.feedParser(feed.body);
      const normalizedItems = this.prepareItems(parsedItems, options.maxArticlesPerSource);
      const hydratedItems = options.fetchFullText
        ? await this.hydrateItemsWithFullText(normalizedItems, options)
        : normalizedItems;
      const upsert = await this.repository.upsertArticles(source, hydratedItems);
      const result: SourceSyncResult = {
        sourceId: source.id,
        sourceName: source.name,
        status: "success",
        fetchedCount: upsert.fetchedCount,
        insertedCount: upsert.insertedCount,
        updatedCount: upsert.updatedCount,
        unchangedCount: upsert.unchangedCount,
        durationMs: Date.now() - startedAtMs,
        httpStatus: feed.status
      };

      await this.repository.recordSourceSyncState({
        source,
        runId,
        ...result
      });

      return result;
    } catch (error) {
      const httpStatus = error instanceof HttpStatusError ? error.status : undefined;
      const message = error instanceof Error ? error.message : "Unknown feed sync error.";
      const result: SourceSyncResult = {
        sourceId: source.id,
        sourceName: source.name,
        status: "error",
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        durationMs: Date.now() - startedAtMs,
        errorMessage: message,
        ...(typeof httpStatus === "number" ? { httpStatus } : {})
      };

      await this.repository.recordSourceSyncState({
        source,
        runId,
        ...result
      });
      logWarn("news.sync.source.failed", {
        run_id: runId,
        source_id: source.id,
        source_name: source.name,
        http_status: httpStatus ?? null,
        message
      });
      return result;
    }
  }

  private prepareItems(items: ParsedFeedArticle[], maxArticlesPerSource: number): ParsedFeedArticle[] {
    const results: ParsedFeedArticle[] = [];
    const seen = new Set<string>();
    const maxItems = Math.max(1, maxArticlesPerSource);

    for (const item of items) {
      if (results.length >= maxItems) {
        break;
      }

      const canonicalUrl = normalizeWhitespace(item.canonicalUrl);
      const title = truncate(normalizeWhitespace(item.title), 500);
      if (!canonicalUrl || !title) {
        continue;
      }

      const dedupeKey = canonicalUrl.toLowerCase();
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      const summary = truncate(normalizeWhitespace(item.summary), 4_000);
      const externalId = normalizeWhitespace(item.externalId) || canonicalUrl;
      const publishedAtMs =
        typeof item.publishedAtMs === "number" && Number.isFinite(item.publishedAtMs)
          ? item.publishedAtMs
          : undefined;

      results.push({
        externalId,
        canonicalUrl,
        title,
        summary,
        categories: normalizeCategories(item.categories),
        author: item.author ? truncate(normalizeWhitespace(item.author), 120) : undefined,
        publishedAtMs,
        fullText: item.fullText,
        fullTextError: item.fullTextError
      });
    }

    return results;
  }

  private async hydrateItemsWithFullText(
    items: ParsedFeedArticle[],
    options: NewsSyncOptions
  ): Promise<ParsedFeedArticle[]> {
    if (!items.length) {
      return items;
    }

    const concurrency = Math.max(1, Math.min(options.articleConcurrency, 6));
    return this.runWithConcurrency(items, concurrency, async (item) => {
      try {
        const fullText = await this.articleTextFetcher(item.canonicalUrl, {
          timeoutMs: Math.max(1_000, options.articleTimeoutMs),
          userAgent: options.userAgent
        });
        return {
          ...item,
          fullText
        };
      } catch (error) {
        return {
          ...item,
          fullTextError: error instanceof Error ? error.message : "Unknown article fetch error."
        };
      }
    });
  }

  private async runWithConcurrency<TInput, TOutput>(
    items: TInput[],
    concurrency: number,
    worker: (item: TInput) => Promise<TOutput>
  ): Promise<TOutput[]> {
    const results: TOutput[] = new Array(items.length);
    let cursor = 0;

    const workers = Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }

        try {
          results[index] = await worker(items[index]);
        } catch (error) {
          logError("news.sync.worker.unhandled", {
            item_index: index,
            message: error instanceof Error ? error.message : "Unknown worker error."
          });
          throw error;
        }
      }
    });

    await Promise.all(workers);
    return results;
  }
}
