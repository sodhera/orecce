import { Firestore, Timestamp } from "firebase-admin/firestore";

function toMillis(value: unknown): number | undefined {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return undefined;
}

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

export class NewsReadService {
  private readonly newsArticlesCollection = "newsArticles";
  private readonly newsSourceStateCollection = "newsSourceState";
  private readonly newsArticleTextChunksCollection = "newsArticleTextChunks";

  constructor(private readonly db: Firestore) {}

  async listSources(): Promise<NewsSourceSummary[]> {
    const sourcesSnap = await this.db.collection(this.newsSourceStateCollection).orderBy("sourceName", "asc").get();
    if (sourcesSnap.empty) {
      return [];
    }

    const sources = await Promise.all(
      sourcesSnap.docs.map(async (doc) => {
        const data = doc.data() ?? {};
        const sourceId = String(data.sourceId ?? doc.id);
        const articleCount = (
          await this.db.collection(this.newsArticlesCollection).where("sourceId", "==", sourceId).count().get()
        ).data().count;

        return {
          id: sourceId,
          name: String(data.sourceName ?? sourceId),
          homepageUrl: String(data.homepageUrl ?? ""),
          language: String(data.language ?? ""),
          countryCode: data.countryCode ? String(data.countryCode) : undefined,
          articleCount,
          lastStatus: data.lastStatus ? String(data.lastStatus) : undefined,
          lastRunAtMs: toMillis(data.lastRunAt),
          lastSuccessAtMs: toMillis(data.lastSuccessAt)
        } satisfies NewsSourceSummary;
      })
    );

    return sources.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listArticlesBySource(sourceId: string, limit: number): Promise<NewsArticleListItem[]> {
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const snap = await this.db
      .collection(this.newsArticlesCollection)
      .where("sourceId", "==", sourceId)
      .orderBy("publishedAt", "desc")
      .limit(boundedLimit)
      .get();

    return snap.docs.map((doc) => this.mapNewsArticle(doc.id, doc.data() ?? {}));
  }

  async getArticleDetail(articleId: string): Promise<NewsArticleDetail | null> {
    const articleRef = this.db.collection(this.newsArticlesCollection).doc(articleId);
    const articleSnap = await articleRef.get();
    if (!articleSnap.exists) {
      return null;
    }

    const base = this.mapNewsArticle(articleSnap.id, articleSnap.data() ?? {});
    const chunksSnap = await this.db
      .collection(this.newsArticleTextChunksCollection)
      .where("articleId", "==", articleId)
      .get();

    const fullText = chunksSnap.docs
      .map((doc) => doc.data() ?? {})
      .sort((a, b) => Number(a.chunkIndex ?? 0) - Number(b.chunkIndex ?? 0))
      .map((chunk) => String(chunk.text ?? ""))
      .join("");

    const data = articleSnap.data() ?? {};
    return {
      ...base,
      fullText: fullText || undefined,
      fullTextError: data.fullTextError ? String(data.fullTextError) : undefined,
      fullTextLength: typeof data.fullTextLength === "number" ? data.fullTextLength : undefined,
      fullTextChunkCount: typeof data.fullTextChunkCount === "number" ? data.fullTextChunkCount : undefined
    };
  }

  private mapNewsArticle(id: string, data: Record<string, unknown>): NewsArticleListItem {
    return {
      id,
      sourceId: String(data.sourceId ?? ""),
      sourceName: String(data.sourceName ?? ""),
      title: String(data.title ?? ""),
      summary: String(data.summary ?? ""),
      canonicalUrl: String(data.canonicalUrl ?? ""),
      publishedAtMs: toMillis(data.publishedAt),
      fullTextStatus: data.fullTextStatus ? String(data.fullTextStatus) : undefined
    };
  }
}
