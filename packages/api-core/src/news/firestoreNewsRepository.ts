import { createHash } from "crypto";
import { Firestore, Timestamp } from "firebase-admin/firestore";
import {
  NewsSyncRepository,
  NewsSyncRunInput,
  NewsUpsertResult,
  ParsedFeedArticle,
  NewsSourceConfig,
  SourceSyncStateInput
} from "./types";

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function articleDocIdFromUrl(canonicalUrl: string): string {
  return hashText(canonicalUrl.toLowerCase());
}

function articleFingerprint(article: ParsedFeedArticle): string {
  const payload = [
    article.canonicalUrl,
    article.title,
    article.summary,
    String(article.publishedAtMs ?? 0),
    article.externalId,
    article.author ?? "",
    article.categories.join("|")
  ].join("::");
  return hashText(payload);
}

export class FirestoreNewsRepository implements NewsSyncRepository {
  private readonly articleTextChunkTargetBytes = 350 * 1024;
  private readonly newsArticlesCollection = "newsArticles";
  private readonly newsArticleTextChunksCollection = "newsArticleTextChunks";
  private readonly newsSourceStateCollection = "newsSourceState";
  private readonly newsSyncRunsCollection = "newsSyncRuns";

  constructor(private readonly db: Firestore) {}

  async upsertArticles(source: NewsSourceConfig, articles: ParsedFeedArticle[]): Promise<NewsUpsertResult> {
    if (!articles.length) {
      return {
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0
      };
    }

    const dedupedArticles = this.dedupeByCanonicalUrl(articles);
    const refs = dedupedArticles.map((article) =>
      this.db.collection(this.newsArticlesCollection).doc(articleDocIdFromUrl(article.canonicalUrl))
    );
    const existingSnapshots = await this.db.getAll(...refs);
    const existingById = new Map(existingSnapshots.map((snap) => [snap.id, snap.data() ?? {}]));

    const batch = this.db.batch();
    const now = Timestamp.now();
    let insertedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    dedupedArticles.forEach((article) => {
      const docId = articleDocIdFromUrl(article.canonicalUrl);
      const ref = this.db.collection(this.newsArticlesCollection).doc(docId);
      const feedFingerprint = articleFingerprint(article);
      const existing = existingById.get(docId) ?? null;
      const existingFingerprint =
        existing && typeof existing.feedFingerprint === "string"
          ? existing.feedFingerprint
          : existing && typeof existing.fingerprint === "string"
            ? existing.fingerprint
            : undefined;
      const publishedAt =
        typeof article.publishedAtMs === "number" ? Timestamp.fromMillis(article.publishedAtMs) : null;
      const firstSeenAt =
        existing && existing.firstSeenAt instanceof Timestamp ? existing.firstSeenAt : now;
      const createdAt = existing && existing.createdAt instanceof Timestamp ? existing.createdAt : now;
      const fullTextChanged = this.applyFullTextPatch(batch, docId, article, existing, now);

      const payload: Record<string, unknown> = {
        sourceId: source.id,
        sourceName: source.name,
        source: {
          id: source.id,
          name: source.name,
          homepageUrl: source.homepageUrl,
          feedUrl: source.feedUrl,
          language: source.language,
          countryCode: source.countryCode ?? null
        },
        canonicalUrl: article.canonicalUrl,
        title: article.title,
        summary: article.summary,
        categories: article.categories,
        externalId: article.externalId,
        author: article.author ?? null,
        publishedAt,
        feedFingerprint,
        fingerprint: feedFingerprint,
        firstSeenAt,
        createdAt,
        lastSeenAt: now,
        updatedAt: now
      };

      if (!existing) {
        insertedCount += 1;
        batch.set(ref, {
          ...payload,
          createdAt: now
        });
        return;
      }

      if (existingFingerprint !== feedFingerprint || fullTextChanged) {
        updatedCount += 1;
        batch.set(ref, payload, { merge: true });
        return;
      }

      unchangedCount += 1;
      const unchangedPatch: Record<string, unknown> = {
        lastSeenAt: now
      };
      if (!(existing && existing.createdAt instanceof Timestamp)) {
        unchangedPatch.createdAt = now;
      }
      batch.set(
        ref,
        unchangedPatch,
        { merge: true }
      );
    });

    await batch.commit();

    return {
      fetchedCount: dedupedArticles.length,
      insertedCount,
      updatedCount,
      unchangedCount
    };
  }

  async recordSourceSyncState(input: SourceSyncStateInput): Promise<void> {
    const now = Timestamp.now();
    const patch: Record<string, unknown> = {
      sourceId: input.source.id,
      sourceName: input.source.name,
      feedUrl: input.source.feedUrl,
      homepageUrl: input.source.homepageUrl,
      language: input.source.language,
      countryCode: input.source.countryCode ?? null,
      lastStatus: input.status,
      lastRunId: input.runId,
      lastRunAt: now,
      fetchedCount: input.fetchedCount,
      insertedCount: input.insertedCount,
      updatedCount: input.updatedCount,
      unchangedCount: input.unchangedCount,
      durationMs: input.durationMs,
      lastHttpStatus: input.httpStatus ?? null,
      updatedAt: now
    };

    if (input.status === "success") {
      patch.lastSuccessAt = now;
      patch.lastError = null;
    } else if (input.errorMessage) {
      patch.lastError = input.errorMessage;
    }

    await this.db.collection(this.newsSourceStateCollection).doc(input.source.id).set(patch, { merge: true });
  }

  async recordSyncRun(input: NewsSyncRunInput): Promise<void> {
    const totalFetchedCount = input.sourceResults.reduce((sum, item) => sum + item.fetchedCount, 0);
    const totalInsertedCount = input.sourceResults.reduce((sum, item) => sum + item.insertedCount, 0);
    const totalUpdatedCount = input.sourceResults.reduce((sum, item) => sum + item.updatedCount, 0);
    const totalUnchangedCount = input.sourceResults.reduce((sum, item) => sum + item.unchangedCount, 0);
    const successCount = input.sourceResults.filter((item) => item.status === "success").length;
    const errorCount = input.sourceResults.filter((item) => item.status === "error").length;
    const skippedCount = input.sourceResults.filter((item) => item.status === "skipped").length;

    await this.db.collection(this.newsSyncRunsCollection).doc(input.runId).set({
      runId: input.runId,
      schedule: input.schedule,
      startedAt: Timestamp.fromMillis(input.startedAtMs),
      completedAt: Timestamp.fromMillis(input.completedAtMs),
      durationMs: Math.max(0, input.completedAtMs - input.startedAtMs),
      sourceCount: input.sourceResults.length,
      successCount,
      errorCount,
      skippedCount,
      totalFetchedCount,
      totalInsertedCount,
      totalUpdatedCount,
      totalUnchangedCount,
      sourceResults: input.sourceResults
    });
  }

  private dedupeByCanonicalUrl(articles: ParsedFeedArticle[]): ParsedFeedArticle[] {
    const seen = new Set<string>();
    const deduped: ParsedFeedArticle[] = [];
    for (const article of articles) {
      const key = article.canonicalUrl.trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(article);
    }
    return deduped;
  }

  private applyFullTextPatch(
    batch: FirebaseFirestore.WriteBatch,
    articleId: string,
    article: ParsedFeedArticle,
    existing: Record<string, unknown> | null,
    now: Timestamp
  ): boolean {
    if (typeof article.fullText === "string" && article.fullText.trim()) {
      const fullText = article.fullText.trim();
      const fullTextFingerprint = hashText(fullText);
      const existingFingerprint =
        existing && typeof existing.fullTextFingerprint === "string" ? existing.fullTextFingerprint : "";
      const existingChunkCount =
        existing && typeof existing.fullTextChunkCount === "number" ? Math.max(0, existing.fullTextChunkCount) : 0;
      const chunks = this.chunkTextByBytes(fullText, this.articleTextChunkTargetBytes);
      const chunkCountChanged = existingChunkCount !== chunks.length;
      const isChanged = existingFingerprint !== fullTextFingerprint || chunkCountChanged;

      if (isChanged) {
        const articleRef = this.db.collection(this.newsArticlesCollection).doc(articleId);
        batch.set(
          articleRef,
          {
            fullTextStatus: "ready",
            fullTextError: null,
            fullTextLength: fullText.length,
            fullTextChunkCount: chunks.length,
            fullTextFingerprint,
            fullTextUpdatedAt: now
          },
          { merge: true }
        );
        this.writeTextChunks(batch, articleId, chunks, existingChunkCount, now);
      }
      return isChanged;
    }

    if (article.fullTextError) {
      const existingStatus = existing && typeof existing.fullTextStatus === "string" ? existing.fullTextStatus : "";
      const existingError = existing && typeof existing.fullTextError === "string" ? existing.fullTextError : "";
      const errorChanged = existingStatus !== "error" || existingError !== article.fullTextError;
      if (errorChanged) {
        const articleRef = this.db.collection(this.newsArticlesCollection).doc(articleId);
        batch.set(
          articleRef,
          {
            fullTextStatus: "error",
            fullTextError: article.fullTextError,
            fullTextUpdatedAt: now
          },
          { merge: true }
        );
      }
      return errorChanged;
    }

    return false;
  }

  private writeTextChunks(
    batch: FirebaseFirestore.WriteBatch,
    articleId: string,
    chunks: string[],
    existingChunkCount: number,
    now: Timestamp
  ): void {
    const maxCount = Math.max(chunks.length, existingChunkCount);
    for (let i = 0; i < maxCount; i += 1) {
      const chunkRef = this.db
        .collection(this.newsArticleTextChunksCollection)
        .doc(`${articleId}_${String(i + 1).padStart(4, "0")}`);

      if (i < chunks.length) {
        batch.set(chunkRef, {
          articleId,
          chunkIndex: i,
          text: chunks[i],
          updatedAt: now,
          createdAt: now
        });
      } else {
        batch.delete(chunkRef);
      }
    }
  }

  private chunkTextByBytes(value: string, targetBytes: number): string[] {
    const chunks: string[] = [];
    let cursor = 0;
    while (cursor < value.length) {
      let end = Math.min(value.length, cursor + Math.max(4_096, Math.floor(targetBytes / 2)));
      while (end < value.length && Buffer.byteLength(value.slice(cursor, end), "utf8") < targetBytes) {
        end = Math.min(value.length, end + 4_096);
      }
      while (end > cursor && Buffer.byteLength(value.slice(cursor, end), "utf8") > targetBytes) {
        end -= 1024;
      }
      if (end <= cursor) {
        end = Math.min(value.length, cursor + 1_024);
      }
      chunks.push(value.slice(cursor, end));
      cursor = end;
    }

    return chunks.length ? chunks : [value];
  }
}
