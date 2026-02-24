export interface NewsSourceConfig {
  id: string;
  name: string;
  homepageUrl: string;
  feedUrl: string;
  language: string;
  countryCode?: string;
}

export interface ParsedFeedArticle {
  externalId: string;
  canonicalUrl: string;
  title: string;
  summary: string;
  categories: string[];
  author?: string;
  publishedAtMs?: number;
  fullText?: string;
  fullTextError?: string;
}

export interface NewsUpsertResult {
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
}

export type NewsSourceSyncStatus = "success" | "error" | "skipped";

export interface SourceSyncStateInput {
  source: NewsSourceConfig;
  status: NewsSourceSyncStatus;
  runId: string;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  durationMs: number;
  errorMessage?: string;
  httpStatus?: number;
}

export interface SourceSyncResult {
  sourceId: string;
  sourceName: string;
  status: NewsSourceSyncStatus;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  durationMs: number;
  errorMessage?: string;
  httpStatus?: number;
}

export interface NewsSyncRunInput {
  runId: string;
  startedAtMs: number;
  completedAtMs: number;
  schedule: string;
  sourceResults: SourceSyncResult[];
}

export interface NewsSyncRunResult {
  runId: string;
  startedAtMs: number;
  completedAtMs: number;
  sourceResults: SourceSyncResult[];
  totalFetchedCount: number;
  totalInsertedCount: number;
  totalUpdatedCount: number;
  totalUnchangedCount: number;
}

export interface NewsSyncRepository {
  upsertArticles(source: NewsSourceConfig, articles: ParsedFeedArticle[]): Promise<NewsUpsertResult>;
  recordSourceSyncState(input: SourceSyncStateInput): Promise<void>;
  recordSyncRun(input: NewsSyncRunInput): Promise<void>;
}
