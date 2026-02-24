import { createHash } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
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

function chunkTextByBytes(value: string, targetBytes: number): string[] {
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

export class PostgresNewsRepository implements NewsSyncRepository {
    private readonly articleTextChunkTargetBytes = 350 * 1024;

    constructor(private readonly supabase: SupabaseClient) { }

    async upsertArticles(source: NewsSourceConfig, articles: ParsedFeedArticle[]): Promise<NewsUpsertResult> {
        if (!articles.length) {
            return { fetchedCount: 0, insertedCount: 0, updatedCount: 0, unchangedCount: 0 };
        }

        const dedupedArticles = this.dedupeByCanonicalUrl(articles);
        const now = new Date().toISOString();
        let insertedCount = 0;
        let updatedCount = 0;
        let unchangedCount = 0;

        for (const article of dedupedArticles) {
            const docId = articleDocIdFromUrl(article.canonicalUrl);
            const feedFingerprint = articleFingerprint(article);
            const publishedAt =
                typeof article.publishedAtMs === "number"
                    ? new Date(article.publishedAtMs).toISOString()
                    : null;

            // Check if article exists
            const { data: existing } = await this.supabase
                .from("news_articles")
                .select("*")
                .eq("id", docId)
                .maybeSingle();

            if (!existing) {
                // Insert new article
                await this.supabase.from("news_articles").insert({
                    id: docId,
                    source_id: source.id,
                    source_name: source.name,
                    source: {
                        id: source.id,
                        name: source.name,
                        homepageUrl: source.homepageUrl,
                        feedUrl: source.feedUrl,
                        language: source.language,
                        countryCode: source.countryCode ?? null
                    },
                    canonical_url: article.canonicalUrl,
                    title: article.title,
                    summary: article.summary,
                    categories: article.categories,
                    external_id: article.externalId,
                    author: article.author ?? null,
                    published_at: publishedAt,
                    feed_fingerprint: feedFingerprint,
                    fingerprint: feedFingerprint,
                    first_seen_at: now,
                    last_seen_at: now,
                    created_at: now,
                    updated_at: now
                });

                await this.applyFullTextPatch(docId, article, null, now);
                insertedCount += 1;
                continue;
            }

            const existingFingerprint =
                typeof existing.feed_fingerprint === "string"
                    ? existing.feed_fingerprint
                    : typeof existing.fingerprint === "string"
                        ? existing.fingerprint
                        : undefined;

            const fullTextChanged = await this.applyFullTextPatch(docId, article, existing, now);

            if (existingFingerprint !== feedFingerprint || fullTextChanged) {
                await this.supabase
                    .from("news_articles")
                    .update({
                        source_id: source.id,
                        source_name: source.name,
                        source: {
                            id: source.id,
                            name: source.name,
                            homepageUrl: source.homepageUrl,
                            feedUrl: source.feedUrl,
                            language: source.language,
                            countryCode: source.countryCode ?? null
                        },
                        canonical_url: article.canonicalUrl,
                        title: article.title,
                        summary: article.summary,
                        categories: article.categories,
                        external_id: article.externalId,
                        author: article.author ?? null,
                        published_at: publishedAt,
                        feed_fingerprint: feedFingerprint,
                        fingerprint: feedFingerprint,
                        last_seen_at: now,
                        updated_at: now
                    })
                    .eq("id", docId);

                updatedCount += 1;
            } else {
                await this.supabase
                    .from("news_articles")
                    .update({ last_seen_at: now })
                    .eq("id", docId);

                unchangedCount += 1;
            }
        }

        return {
            fetchedCount: dedupedArticles.length,
            insertedCount,
            updatedCount,
            unchangedCount
        };
    }

    async recordSourceSyncState(input: SourceSyncStateInput): Promise<void> {
        const now = new Date().toISOString();
        const patch: Record<string, unknown> = {
            source_id: input.source.id,
            source_name: input.source.name,
            feed_url: input.source.feedUrl,
            homepage_url: input.source.homepageUrl,
            language: input.source.language,
            country_code: input.source.countryCode ?? null,
            last_status: input.status,
            last_run_id: input.runId,
            last_run_at: now,
            fetched_count: input.fetchedCount,
            inserted_count: input.insertedCount,
            updated_count: input.updatedCount,
            unchanged_count: input.unchangedCount,
            duration_ms: input.durationMs,
            last_http_status: input.httpStatus ?? null,
            updated_at: now
        };

        if (input.status === "success") {
            patch.last_success_at = now;
            patch.last_error = null;
        } else if (input.errorMessage) {
            patch.last_error = input.errorMessage;
        }

        await this.supabase
            .from("news_source_state")
            .upsert(patch);
    }

    async recordSyncRun(input: NewsSyncRunInput): Promise<void> {
        const totalFetchedCount = input.sourceResults.reduce((sum, item) => sum + item.fetchedCount, 0);
        const totalInsertedCount = input.sourceResults.reduce((sum, item) => sum + item.insertedCount, 0);
        const totalUpdatedCount = input.sourceResults.reduce((sum, item) => sum + item.updatedCount, 0);
        const totalUnchangedCount = input.sourceResults.reduce((sum, item) => sum + item.unchangedCount, 0);
        const successCount = input.sourceResults.filter((item) => item.status === "success").length;
        const errorCount = input.sourceResults.filter((item) => item.status === "error").length;
        const skippedCount = input.sourceResults.filter((item) => item.status === "skipped").length;

        await this.supabase.from("news_sync_runs").upsert({
            run_id: input.runId,
            schedule: input.schedule,
            started_at: new Date(input.startedAtMs).toISOString(),
            completed_at: new Date(input.completedAtMs).toISOString(),
            duration_ms: Math.max(0, input.completedAtMs - input.startedAtMs),
            source_count: input.sourceResults.length,
            success_count: successCount,
            error_count: errorCount,
            skipped_count: skippedCount,
            total_fetched_count: totalFetchedCount,
            total_inserted_count: totalInsertedCount,
            total_updated_count: totalUpdatedCount,
            total_unchanged_count: totalUnchangedCount,
            source_results: input.sourceResults
        });
    }

    private dedupeByCanonicalUrl(articles: ParsedFeedArticle[]): ParsedFeedArticle[] {
        const seen = new Set<string>();
        const deduped: ParsedFeedArticle[] = [];
        for (const article of articles) {
            const key = article.canonicalUrl.trim().toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            deduped.push(article);
        }
        return deduped;
    }

    private async applyFullTextPatch(
        articleId: string,
        article: ParsedFeedArticle,
        existing: Record<string, unknown> | null,
        now: string
    ): Promise<boolean> {
        if (typeof article.fullText === "string" && article.fullText.trim()) {
            const fullText = article.fullText.trim();
            const fullTextFingerprint = hashText(fullText);
            const existingFingerprint =
                existing && typeof existing.full_text_fingerprint === "string" ? existing.full_text_fingerprint : "";
            const existingChunkCount =
                existing && typeof existing.full_text_chunk_count === "number"
                    ? Math.max(0, existing.full_text_chunk_count)
                    : 0;
            const chunks = chunkTextByBytes(fullText, this.articleTextChunkTargetBytes);
            const isChanged = existingFingerprint !== fullTextFingerprint || existingChunkCount !== chunks.length;

            if (isChanged) {
                await this.supabase
                    .from("news_articles")
                    .update({
                        full_text_status: "ready",
                        full_text_error: null,
                        full_text_length: fullText.length,
                        full_text_chunk_count: chunks.length,
                        full_text_fingerprint: fullTextFingerprint,
                        full_text_updated_at: now
                    })
                    .eq("id", articleId);

                await this.writeTextChunks(articleId, chunks, existingChunkCount, now);
            }
            return isChanged;
        }

        if (article.fullTextError) {
            const existingStatus =
                existing && typeof existing.full_text_status === "string" ? existing.full_text_status : "";
            const existingError =
                existing && typeof existing.full_text_error === "string" ? existing.full_text_error : "";
            const errorChanged = existingStatus !== "error" || existingError !== article.fullTextError;
            if (errorChanged) {
                await this.supabase
                    .from("news_articles")
                    .update({
                        full_text_status: "error",
                        full_text_error: article.fullTextError,
                        full_text_updated_at: now
                    })
                    .eq("id", articleId);
            }
            return errorChanged;
        }

        return false;
    }

    private async writeTextChunks(
        articleId: string,
        chunks: string[],
        existingChunkCount: number,
        now: string
    ): Promise<void> {
        // Delete existing chunks
        await this.supabase
            .from("news_article_text_chunks")
            .delete()
            .eq("article_id", articleId);

        // Insert new chunks
        if (chunks.length > 0) {
            const rows = chunks.map((chunk, index) => ({
                id: `${articleId}_${String(index + 1).padStart(4, "0")}`,
                article_id: articleId,
                chunk_index: index,
                text: chunk,
                created_at: now,
                updated_at: now
            }));

            await this.supabase.from("news_article_text_chunks").insert(rows);
        }
    }
}
