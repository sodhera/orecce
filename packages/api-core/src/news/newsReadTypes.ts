export interface NewsSourceSummary {
  id: string;
  name: string;
  homepageUrl: string;
  language: string;
  countryCode?: string;
  articleCount: number;
  lastStatus?: string;
  lastRunAtMs?: number;
  lastSuccessAtMs?: number;
}

export interface NewsArticleListItem {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  summary: string;
  canonicalUrl: string;
  publishedAtMs?: number;
  fullTextStatus?: string;
}

export interface NewsArticleDetail extends NewsArticleListItem {
  fullText?: string;
  fullTextError?: string;
  fullTextLength?: number;
  fullTextChunkCount?: number;
}

export interface NewsReadServiceContract {
  listSources(): Promise<NewsSourceSummary[]>;
  listArticlesBySource(sourceId: string, limit: number): Promise<NewsArticleListItem[]>;
  getArticleDetail(articleId: string): Promise<NewsArticleDetail | null>;
}
