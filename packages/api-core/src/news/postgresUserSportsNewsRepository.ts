import { createHash } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { parseSportId, SportId } from "./sportsNewsSources";
import { SportsGameDraft, SportsStory } from "./sportsNewsService";
import {
    UserSportsNewsRepository,
    UserSportsFeedCursor,
    UserSportsFeedPage,
    UserSportsFeedItem,
    UserSportsSyncState
} from "./userSportsNewsTypes";

function hashText(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function toMs(value: string | null | undefined): number | undefined {
    if (!value) return undefined;
    return new Date(value).getTime();
}

function buildPreviewText(story: SportsStory): string {
    const raw =
        String(story.story ?? "").trim() ||
        String(story.reconstructedArticle ?? "").trim() ||
        String(story.bulletPoints[0] ?? "").trim();
    if (!raw) return "Open to read the full article.";
    if (raw.length <= 220) return raw;
    return `${raw.slice(0, 217)}...`;
}

function mapStoryRow(row: Record<string, unknown>): SportsStory | null {
    const sport = parseSportId(String(row.sport ?? ""));
    if (!sport) return null;
    return {
        id: String(row.id),
        sport,
        sourceId: String(row.source_id ?? ""),
        sourceName: String(row.source_name ?? ""),
        title: String(row.title ?? ""),
        canonicalUrl: String(row.canonical_url ?? ""),
        publishedAtMs: toMs(row.published_at as string),
        gameId: String(row.game_id ?? ""),
        gameName: String(row.game_name ?? ""),
        gameDateKey: String(row.game_date_key ?? ""),
        importanceScore: typeof row.importance_score === "number" ? row.importance_score : 0,
        bulletPoints: Array.isArray(row.bullet_points) ? row.bullet_points.map((item) => String(item)) : [],
        reconstructedArticle: String(row.reconstructed_article ?? ""),
        story: String(row.story ?? ""),
        fullTextStatus: row.full_text_status === "ready" ? "ready" : "fallback",
        summarySource: row.summary_source === "llm" ? "llm" : "fallback"
    };
}

function mapFeedItem(row: Record<string, unknown>): UserSportsFeedItem | null {
    const sport = parseSportId(String(row.sport ?? ""));
    if (!sport) return null;
    return {
        id: String(row.id),
        sport,
        title: String(row.title ?? ""),
        publishedAtMs: toMs(row.published_at as string),
        importanceScore: typeof row.importance_score === "number" ? row.importance_score : 0,
        preview: String(row.preview ?? "").trim() || "Open to read the full article."
    };
}

export class PostgresUserSportsNewsRepository implements UserSportsNewsRepository {
    constructor(private readonly supabase: SupabaseClient) { }

    async enqueueRefreshForUser(userId: string, sport: SportId): Promise<void> {
        const now = new Date().toISOString();

        const { data: existing } = await this.supabase
            .from("user_sports_news_refresh_jobs")
            .select("status")
            .eq("user_id", userId)
            .eq("sport", sport)
            .maybeSingle();

        const status = String(existing?.status ?? "idle");

        if (status === "processing") {
            await this.supabase.from("user_sports_news_refresh_jobs").upsert({
                user_id: userId,
                sport,
                status: "processing",
                pending: true,
                requested_at: now,
                updated_at: now
            });
            return;
        }

        await this.supabase.from("user_sports_news_refresh_jobs").upsert({
            user_id: userId,
            sport,
            status: "queued",
            pending: false,
            requested_at: now,
            updated_at: now,
            error_message: null
        });
    }

    async claimRefreshForUser(userId: string, sport: SportId): Promise<boolean> {
        const { data: existing } = await this.supabase
            .from("user_sports_news_refresh_jobs")
            .select("*")
            .eq("user_id", userId)
            .eq("sport", sport)
            .maybeSingle();

        if (!existing || String(existing.status) !== "queued") {
            return false;
        }

        const now = new Date().toISOString();
        const { error } = await this.supabase
            .from("user_sports_news_refresh_jobs")
            .update({
                status: "processing",
                pending: false,
                started_at: now,
                updated_at: now,
                error_message: null
            })
            .eq("user_id", userId)
            .eq("sport", sport)
            .eq("status", "queued");

        return !error;
    }

    async finishRefreshForUser(
        userId: string,
        sport: SportId,
        input: { success: boolean; errorMessage?: string }
    ): Promise<void> {
        const { data: existing } = await this.supabase
            .from("user_sports_news_refresh_jobs")
            .select("*")
            .eq("user_id", userId)
            .eq("sport", sport)
            .maybeSingle();

        if (!existing) return;

        const now = new Date().toISOString();
        const pending = Boolean(existing.pending);

        if (pending) {
            await this.supabase
                .from("user_sports_news_refresh_jobs")
                .update({
                    status: "queued",
                    pending: false,
                    updated_at: now,
                    error_message: null
                })
                .eq("user_id", userId)
                .eq("sport", sport);
            return;
        }

        await this.supabase
            .from("user_sports_news_refresh_jobs")
            .update({
                status: input.success ? "idle" : "error",
                pending: false,
                completed_at: now,
                updated_at: now,
                error_message: input.success ? null : input.errorMessage ?? "Unknown refresh error"
            })
            .eq("user_id", userId)
            .eq("sport", sport);
    }

    async replaceSyncStateForUser(userId: string, sport: SportId, state: UserSportsSyncState): Promise<void> {
        await this.supabase.from("user_sports_news_sync_state").upsert({
            user_id: userId,
            sport,
            status: state.status,
            step: state.step,
            message: state.message,
            total_games: state.totalGames,
            processed_games: state.processedGames,
            found_games: state.foundGames,
            updated_at: new Date(state.updatedAtMs).toISOString(),
            started_at:
                typeof state.startedAtMs === "number" ? new Date(state.startedAtMs).toISOString() : null,
            completed_at:
                typeof state.completedAtMs === "number" ? new Date(state.completedAtMs).toISOString() : null,
            error_message: state.errorMessage ?? null
        });
    }

    async getSyncStateForUser(userId: string, sport: SportId): Promise<UserSportsSyncState | null> {
        const { data } = await this.supabase
            .from("user_sports_news_sync_state")
            .select("*")
            .eq("user_id", userId)
            .eq("sport", sport)
            .maybeSingle();

        if (!data) return null;

        return {
            status:
                data.status === "running" || data.status === "complete" || data.status === "error"
                    ? data.status
                    : "idle",
            step:
                data.step === "looking_games" ||
                    data.step === "games_found" ||
                    data.step === "preparing_articles" ||
                    data.step === "complete" ||
                    data.step === "error"
                    ? data.step
                    : "idle",
            message: String(data.message ?? ""),
            totalGames: typeof data.total_games === "number" ? data.total_games : 0,
            processedGames: typeof data.processed_games === "number" ? data.processed_games : 0,
            foundGames: Array.isArray(data.found_games)
                ? data.found_games.map((item: unknown) => String(item)).slice(0, 40)
                : [],
            updatedAtMs: toMs(data.updated_at) ?? Date.now(),
            startedAtMs: toMs(data.started_at),
            completedAtMs: toMs(data.completed_at),
            errorMessage: data.error_message ? String(data.error_message) : undefined
        };
    }

    async replaceGameDraftsForUser(
        userId: string,
        sport: SportId,
        gameDateKey: string,
        drafts: SportsGameDraft[]
    ): Promise<void> {
        // Delete existing drafts for user + sport
        await this.supabase
            .from("user_sports_news_game_drafts")
            .delete()
            .eq("user_id", userId)
            .eq("sport", sport);

        if (!drafts.length) return;

        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        const rows = drafts.map((draft) => ({
            id: hashText(`${userId}:${sport}:${draft.gameId}`),
            user_id: userId,
            sport,
            game_id: draft.gameId,
            game_name: draft.gameName,
            game_date_key: draft.gameDateKey || gameDateKey,
            article_count: draft.articleRefs.length,
            articles: draft.articleRefs.map((item) => ({
                itemIndex: item.itemIndex,
                sourceId: item.sourceId,
                sourceName: item.sourceName,
                title: item.title,
                canonicalUrl: item.canonicalUrl,
                publishedAtMs: item.publishedAtMs ?? null
            })),
            created_at: now,
            updated_at: now,
            expires_at: expiresAt
        }));

        await this.supabase.from("user_sports_news_game_drafts").insert(rows);
    }

    async replaceStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void> {
        // Delete existing stories for user + sport
        await this.supabase
            .from("user_sports_news_stories")
            .delete()
            .eq("user_id", userId)
            .eq("sport", sport);

        if (!stories.length) return;

        const now = new Date().toISOString();
        const rows = stories.map((story, index) => ({
            id: hashText(`${userId}:${sport}:${story.gameDateKey}:${story.gameId}`),
            user_id: userId,
            sport,
            source_id: story.sourceId,
            source_name: story.sourceName,
            title: story.title,
            canonical_url: story.canonicalUrl,
            published_at:
                typeof story.publishedAtMs === "number" ? new Date(story.publishedAtMs).toISOString() : null,
            game_id: story.gameId,
            game_name: story.gameName,
            game_date_key: story.gameDateKey,
            importance_score: story.importanceScore,
            bullet_points: story.bulletPoints,
            reconstructed_article: story.reconstructedArticle,
            story: story.story,
            preview: buildPreviewText(story),
            full_text_status: story.fullTextStatus,
            summary_source: story.summarySource,
            rank: index + 1,
            updated_at: now,
            created_at: now
        }));

        await this.supabase.from("user_sports_news_stories").insert(rows);
    }

    async upsertStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void> {
        if (!stories.length) return;

        const now = new Date().toISOString();
        const rows = stories.map((story, index) => ({
            id: hashText(`${userId}:${sport}:${story.gameDateKey}:${story.gameId}`),
            user_id: userId,
            sport,
            source_id: story.sourceId,
            source_name: story.sourceName,
            title: story.title,
            canonical_url: story.canonicalUrl,
            published_at:
                typeof story.publishedAtMs === "number" ? new Date(story.publishedAtMs).toISOString() : null,
            game_id: story.gameId,
            game_name: story.gameName,
            game_date_key: story.gameDateKey,
            importance_score: story.importanceScore,
            bullet_points: story.bulletPoints,
            reconstructed_article: story.reconstructedArticle,
            story: story.story,
            preview: buildPreviewText(story),
            full_text_status: story.fullTextStatus,
            summary_source: story.summarySource,
            rank: index + 1,
            updated_at: now,
            created_at: now
        }));

        await this.supabase.from("user_sports_news_stories").upsert(rows);
    }

    async listStoriesForUser(userId: string, sport: SportId, limit: number): Promise<SportsStory[]> {
        const boundedLimit = Math.max(1, Math.min(40, Math.floor(limit)));

        const { data, error } = await this.supabase
            .from("user_sports_news_stories")
            .select("*")
            .eq("user_id", userId)
            .eq("sport", sport);

        if (error) throw error;

        const stories = (data ?? [])
            .map(mapStoryRow)
            .filter((item): item is SportsStory => Boolean(item))
            .filter((item) => item.sport === sport);

        stories.sort((a, b) => {
            if (b.importanceScore !== a.importanceScore) {
                return b.importanceScore - a.importanceScore;
            }
            return (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0);
        });

        return stories.slice(0, boundedLimit);
    }

    async getStoryForUser(userId: string, storyId: string): Promise<SportsStory | null> {
        const storyIdTrimmed = String(storyId ?? "").trim();
        if (!storyIdTrimmed) return null;

        const { data } = await this.supabase
            .from("user_sports_news_stories")
            .select("*")
            .eq("id", storyIdTrimmed)
            .eq("user_id", userId)
            .maybeSingle();

        if (!data) return null;
        return mapStoryRow(data);
    }

    async listFeedStoriesForUser(
        userId: string,
        limit: number,
        cursor?: UserSportsFeedCursor,
        sports?: SportId[]
    ): Promise<UserSportsFeedPage> {
        const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));

        let q = this.supabase
            .from("user_sports_news_stories")
            .select("id, sport, title, published_at, importance_score, preview")
            .eq("user_id", userId)
            .order("published_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .limit(boundedLimit + 1);

        const selectedSports = Array.isArray(sports)
            ? Array.from(new Set(sports.map((item) => item.trim()).filter(Boolean)))
            : [];

        if (selectedSports.length === 1) {
            q = q.eq("sport", selectedSports[0]);
        } else if (selectedSports.length > 1) {
            q = q.in("sport", selectedSports);
        }

        if (cursor) {
            if (cursor.publishedAtMs !== null) {
                const cursorTs = new Date(cursor.publishedAtMs).toISOString();
                // Composite cursor: published_at < cursorTs OR (published_at = cursorTs AND id < docId)
                q = q.or(
                    `published_at.lt.${cursorTs},and(published_at.eq.${cursorTs},id.lt.${cursor.docId})`
                );
            } else {
                q = q.lt("id", cursor.docId);
            }
        }

        const { data, error } = await q;
        if (error) throw error;

        const rows = data ?? [];
        const hasMore = rows.length > boundedLimit;
        const pageRows = hasMore ? rows.slice(0, boundedLimit) : rows;
        const items = pageRows
            .map(mapFeedItem)
            .filter((item): item is UserSportsFeedItem => Boolean(item));

        if (!hasMore || pageRows.length === 0) {
            return { items, nextCursor: null };
        }

        const lastRow = pageRows[pageRows.length - 1];
        return {
            items,
            nextCursor: {
                publishedAtMs: toMs(lastRow.published_at as string) ?? null,
                docId: String(lastRow.id)
            }
        };
    }
}
