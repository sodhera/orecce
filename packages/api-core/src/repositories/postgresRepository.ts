import { SupabaseClient } from "@supabase/supabase-js";
import { AnalyticsEventInput } from "../analytics/types";
import { DEFAULT_PROFILE_BY_MODE } from "../services/prefillBlueprint";
import {
    EnsureUserInput,
    SaveAnalyticsEventsInput,
    ListFeedbackQuery,
    ListFeedbackResult,
    ListSeenRecommendationPostsQuery,
    MarkSeenRecommendationPostsInput,
    ListPostsQuery,
    NextPrefillPostQuery,
    ReplaceUserPrefillPostsInput,
    RecentTitleQuery,
    Repository,
    SaveFeedbackInput,
    SavePostInput,
    UpdateUserProfileInput
} from "../types/contracts";
import {
    AppUser,
    FeedMode,
    PromptPreferences,
    StoredFeedback,
    StoredPost,
    UserPrefillSummary
} from "../types/domain";
import { ApiError } from "../types/errors";
import { normalizeProfileKey } from "../utils/text";

const PREFILL_DOC_TARGET_BYTES = 900 * 1024;

function parseUserPrefillStatus(value: unknown): AppUser["prefillStatus"] {
    if (value === "empty" || value === "generating" || value === "ready" || value === "error") {
        return value;
    }
    return "empty";
}

function parseFeedMode(raw: unknown): FeedMode | null {
    if (raw === "BIOGRAPHY" || raw === "TRIVIA" || raw === "NICHE") {
        return raw;
    }
    return null;
}

function toMs(value: string | null | undefined): number {
    if (!value) return Date.now();
    return new Date(value).getTime();
}

function isSharedDatasetUserId(userId: string): boolean {
    return userId === "common_prefill_dataset";
}

export class PostgresRepository implements Repository {
    constructor(private readonly supabase: SupabaseClient) { }

    async getUser(userId: string): Promise<AppUser | null> {
        const { data, error } = await this.supabase
            .from("app_users")
            .select("*")
            .or(`id.eq.${userId},auth_uid.eq.${userId}`)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;
        return this.mapUserRow(data);
    }

    async getOrCreateUser(input: EnsureUserInput): Promise<AppUser> {
        const existing = await this.getUser(input.userId);

        if (existing) {
            // Patch with latest auth info
            const patch: Record<string, unknown> = {
                updated_at: new Date().toISOString()
            };
            if (!isSharedDatasetUserId(input.userId)) {
                patch.auth_uid = input.userId;
            }
            if (typeof input.email === "string") {
                patch.email = input.email;
            }
            if (typeof input.displayName === "string") {
                patch.display_name = input.displayName;
            }
            if (typeof input.photoURL === "string") {
                patch.photo_url = input.photoURL;
            }

            const { error } = await this.supabase
                .from("app_users")
                .update(patch)
                .eq("id", existing.id);

            if (error) throw error;

            return {
                ...existing,
                email: typeof input.email === "string" ? input.email : existing.email,
                profile: {
                    displayName:
                        typeof input.displayName === "string"
                            ? input.displayName
                            : existing.profile.displayName,
                    photoURL:
                        typeof input.photoURL === "string"
                            ? input.photoURL
                            : existing.profile.photoURL
                },
                updatedAtMs: Date.now()
            };
        }

        // Create new user
        const now = new Date().toISOString();
        const docId = input.userId;

        const { error } = await this.supabase.from("app_users").insert({
            id: docId,
            email: input.email ?? null,
            display_name: input.displayName ?? null,
            photo_url: input.photoURL ?? null,
            auth_uid: isSharedDatasetUserId(input.userId) ? null : input.userId,
            prefill_status: "empty",
            prefill_post_count: 0,
            prefill_chunk_count: 0,
            prefill_bytes: 0,
            prefill_updated_at: null,
            prefill_pointers: {},
            created_at: now,
            updated_at: now
        });

        if (error) throw error;

        const nowMs = Date.now();
        return {
            id: input.userId,
            email: input.email ?? null,
            profile: {
                displayName: input.displayName ?? null,
                photoURL: input.photoURL ?? null
            },
            prefillStatus: "empty",
            prefillPostCount: 0,
            prefillChunkCount: 0,
            prefillBytes: 0,
            createdAtMs: nowMs,
            updatedAtMs: nowMs,
            prefillUpdatedAtMs: undefined
        };
    }

    async updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<AppUser> {
        const user = await this.getOrCreateUser({ userId });
        const displayName = input.displayName === undefined ? user.profile.displayName : input.displayName;
        const photoURL = input.photoURL === undefined ? user.profile.photoURL : input.photoURL;
        const now = new Date().toISOString();

        const { error } = await this.supabase
            .from("app_users")
            .update({
                display_name: displayName ?? null,
                photo_url: photoURL ?? null,
                updated_at: now
            })
            .eq("id", user.id);

        if (error) throw error;

        return {
            ...user,
            profile: {
                displayName: displayName ?? null,
                photoURL: photoURL ?? null
            },
            updatedAtMs: new Date(now).getTime()
        };
    }

    async updateUserPrefillStatus(
        userId: string,
        status: AppUser["prefillStatus"],
        summary?: Partial<UserPrefillSummary>
    ): Promise<AppUser> {
        const user = await this.getOrCreateUser({ userId });
        const patch: Record<string, unknown> = {
            prefill_status: status,
            updated_at: new Date().toISOString()
        };

        if (summary) {
            if (typeof summary.postCount === "number") {
                patch.prefill_post_count = summary.postCount;
            }
            if (typeof summary.chunkCount === "number") {
                patch.prefill_chunk_count = summary.chunkCount;
            }
            if (typeof summary.totalBytes === "number") {
                patch.prefill_bytes = summary.totalBytes;
            }
            if (typeof summary.generatedAtMs === "number") {
                patch.prefill_updated_at = new Date(summary.generatedAtMs).toISOString();
            }
        }

        const { error } = await this.supabase
            .from("app_users")
            .update(patch)
            .eq("id", user.id);

        if (error) throw error;

        const updated = await this.getOrCreateUser({ userId });
        return { ...updated, prefillStatus: status };
    }

    async replaceUserPrefillPosts(input: ReplaceUserPrefillPostsInput): Promise<UserPrefillSummary> {
        const now = new Date().toISOString();
        const nowMs = Date.now();
        const docId = input.userId;

        const preparedPosts = input.posts.map((post, index) => ({
            id: String(post.id || `prefill-${index + 1}`),
            userId: input.userId,
            mode: post.mode,
            profile: String(post.profile),
            profileKey: String(post.profileKey),
            length: post.length,
            title: String(post.title),
            body: String(post.body),
            post_type: String(post.post_type),
            tags: Array.isArray(post.tags) ? post.tags.map((tag) => String(tag)) : [],
            confidence: post.confidence,
            uncertainty_note: post.uncertainty_note ?? null,
            createdAtMs: Number(post.createdAtMs) || nowMs + index
        }));

        const chunks = this.chunkPostsByDocumentSize(docId, preparedPosts);

        // Delete existing chunks for this user
        const { error: deleteError } = await this.supabase
            .from("user_prefill_chunks")
            .delete()
            .eq("user_id", docId);

        if (deleteError) throw deleteError;

        // Insert new chunks
        if (chunks.length > 0) {
            const rows = chunks.map((chunk, index) => ({
                id: `${docId}_${String(index + 1).padStart(4, "0")}`,
                user_id: docId,
                auth_uid: isSharedDatasetUserId(input.userId) ? null : input.userId,
                chunk_index: index,
                size_bytes: chunk.sizeBytes,
                posts: chunk.posts,
                created_at: now,
                updated_at: now
            }));

            const { error: insertError } = await this.supabase
                .from("user_prefill_chunks")
                .insert(rows);

            if (insertError) throw insertError;
        }

        const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0);
        const summary: UserPrefillSummary = {
            postCount: preparedPosts.length,
            chunkCount: chunks.length,
            totalBytes,
            generatedAtMs: nowMs
        };

        // Update user record
        const { error: updateError } = await this.supabase
            .from("app_users")
            .update({
                auth_uid: isSharedDatasetUserId(input.userId) ? null : input.userId,
                prefill_status: "ready",
                prefill_post_count: summary.postCount,
                prefill_chunk_count: summary.chunkCount,
                prefill_bytes: summary.totalBytes,
                prefill_updated_at: new Date(summary.generatedAtMs).toISOString(),
                updated_at: now
            })
            .eq("id", docId);

        if (updateError) throw updateError;

        return summary;
    }

    async getNextPrefillPost(query: NextPrefillPostQuery): Promise<StoredPost | null> {
        const all = await this.listAllPrefillPosts(query.userId);
        const filtered = this.filterPostsWithFallback(all, query.mode, query.profileKey).filter(
            (post) => post.length === query.length
        );
        if (!filtered.length) {
            return null;
        }

        // Read and advance pointer
        const { data: userData } = await this.supabase
            .from("app_users")
            .select("prefill_pointers")
            .eq("id", query.userId)
            .maybeSingle();

        const pointers: Record<string, number> =
            userData?.prefill_pointers && typeof userData.prefill_pointers === "object"
                ? { ...(userData.prefill_pointers as Record<string, number>) }
                : {};

        const key = `${query.mode}:${query.profileKey}:${query.length}`;
        const currentPointer = typeof pointers[key] === "number" && pointers[key] >= 0 ? pointers[key] : 0;
        const selected = filtered[currentPointer % filtered.length];

        pointers[key] = currentPointer + 1;
        await this.supabase
            .from("app_users")
            .update({
                prefill_pointers: pointers,
                updated_at: new Date().toISOString()
            })
            .eq("id", query.userId);

        return selected;
    }

    async getRecentTitles(query: RecentTitleQuery): Promise<string[]> {
        const { data, error } = await this.supabase
            .from("posts")
            .select("title")
            .eq("user_id", query.userId)
            .eq("mode", query.mode)
            .eq("profile_key", query.profileKey)
            .order("created_at", { ascending: false })
            .limit(query.limit);

        if (error) throw error;

        return (data ?? [])
            .map((row) => row.title)
            .filter((title): title is string => typeof title === "string" && title.trim().length > 0);
    }

    async savePost(input: SavePostInput): Promise<StoredPost> {
        const now = new Date().toISOString();

        const { data, error } = await this.supabase
            .from("posts")
            .insert({
                user_id: input.userId,
                mode: input.mode,
                profile: input.profile,
                profile_key: input.profileKey,
                length: input.length,
                title: input.payload.title,
                body: input.payload.body,
                post_type: input.payload.post_type,
                tags: input.payload.tags,
                confidence: input.payload.confidence,
                uncertainty_note: input.payload.uncertainty_note,
                created_at: now
            })
            .select("id")
            .single();

        if (error) throw error;

        return {
            id: data.id,
            userId: input.userId,
            mode: input.mode,
            profile: input.profile,
            profileKey: input.profileKey,
            length: input.length,
            ...input.payload,
            createdAtMs: new Date(now).getTime()
        };
    }

    async listPosts(query: ListPostsQuery): Promise<{ items: StoredPost[]; nextCursor: string | null }> {
        const all = await this.listAllPrefillPosts(query.userId);
        const filtered = this.filterPostsWithFallback(all, query.mode, query.profileKey);

        const offsetRaw = Number(query.cursor ?? "0");
        const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
        const items = filtered.slice(offset, offset + query.pageSize);
        const nextOffset = offset + items.length;

        return {
            items,
            nextCursor: nextOffset < filtered.length ? String(nextOffset) : null
        };
    }

    async saveFeedback(input: SaveFeedbackInput): Promise<StoredFeedback> {
        const now = new Date().toISOString();

        const { data, error } = await this.supabase
            .from("feedback")
            .insert({
                user_id: input.userId,
                post_id: input.postId,
                type: input.type,
                created_at: now
            })
            .select("id")
            .single();

        if (error) throw error;

        return {
            id: data.id,
            userId: input.userId,
            postId: input.postId,
            type: input.type,
            createdAtMs: new Date(now).getTime()
        };
    }

    async listFeedback(query: ListFeedbackQuery): Promise<ListFeedbackResult> {
        let q = this.supabase
            .from("feedback")
            .select("*")
            .eq("user_id", query.userId)
            .order("created_at", { ascending: false })
            .limit(query.pageSize + 1);

        if (query.postId) {
            q = q.eq("post_id", query.postId);
        }

        if (query.cursor) {
            const cursorMs = Number(query.cursor);
            if (!Number.isNaN(cursorMs) && cursorMs > 0) {
                q = q.lt("created_at", new Date(cursorMs).toISOString());
            }
        }

        const { data, error } = await q;
        if (error) throw error;

        const rows = data ?? [];
        const hasMore = rows.length > query.pageSize;
        const pageRows = hasMore ? rows.slice(0, query.pageSize) : rows;

        const items: StoredFeedback[] = pageRows.map((row) => ({
            id: row.id,
            userId: String(row.user_id),
            postId: String(row.post_id),
            type: row.type,
            createdAtMs: toMs(row.created_at)
        }));

        const nextCursor = hasMore ? String(items[items.length - 1]?.createdAtMs ?? "") : null;
        return { items, nextCursor: nextCursor || null };
    }

    async saveAnalyticsEvents(input: SaveAnalyticsEventsInput): Promise<void> {
        const safeUserId = String(input.userId ?? "").trim() || null;
        const rows = input.events.map((event) => this.mapAnalyticsRow(event, safeUserId));
        if (!rows.length) {
            return;
        }

        const { error } = await this.supabase
            .from("analytics_events_raw")
            .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true });
        if (error) throw error;
    }

    async listSeenRecommendationPostIds(query: ListSeenRecommendationPostsQuery): Promise<string[]> {
        const safeLimit = Math.max(1, Math.min(5000, Math.floor(Number(query.limit) || 1)));
        const { data, error } = await this.supabase
            .from("user_recommendation_seen_posts")
            .select("post_id")
            .eq("user_id", query.userId)
            .eq("author_id", query.authorId)
            .order("last_seen_at", { ascending: false })
            .limit(safeLimit);

        if (error) throw error;

        return (data ?? [])
            .map((row) => String(row.post_id ?? "").trim())
            .filter(Boolean);
    }

    async markRecommendationPostsSeen(input: MarkSeenRecommendationPostsInput): Promise<void> {
        const userId = String(input.userId ?? "").trim();
        const authorId = String(input.authorId ?? "").trim();
        if (!userId || !authorId) {
            return;
        }

        const dedupedPostIds = Array.from(
            new Set(
                (input.postIds ?? [])
                    .map((postId) => String(postId ?? "").trim())
                    .filter(Boolean)
            )
        );
        if (!dedupedPostIds.length) {
            return;
        }

        const now = new Date().toISOString();
        const rows = dedupedPostIds.map((postId) => ({
            user_id: userId,
            author_id: authorId,
            post_id: postId,
            first_seen_at: now,
            last_seen_at: now
        }));

        const { error } = await this.supabase
            .from("user_recommendation_seen_posts")
            .upsert(rows, { onConflict: "user_id,author_id,post_id" });
        if (error) throw error;
    }

    async getPromptPreferences(userId: string): Promise<PromptPreferences> {
        const { data, error } = await this.supabase
            .from("prompt_preferences")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return { biographyInstructions: "", nicheInstructions: "" };
        }

        return {
            biographyInstructions: typeof data.biography_instructions === "string" ? data.biography_instructions : "",
            nicheInstructions: typeof data.niche_instructions === "string" ? data.niche_instructions : "",
            updatedAtMs: toMs(data.updated_at)
        };
    }

    async setPromptPreferences(userId: string, input: Partial<PromptPreferences>): Promise<PromptPreferences> {
        const current = await this.getPromptPreferences(userId);
        const now = new Date().toISOString();

        const next: PromptPreferences = {
            biographyInstructions:
                typeof input.biographyInstructions === "string"
                    ? input.biographyInstructions
                    : current.biographyInstructions,
            nicheInstructions:
                typeof input.nicheInstructions === "string"
                    ? input.nicheInstructions
                    : current.nicheInstructions,
            updatedAtMs: Date.now()
        };

        const { error } = await this.supabase
            .from("prompt_preferences")
            .upsert({
                user_id: userId,
                biography_instructions: next.biographyInstructions,
                niche_instructions: next.nicheInstructions,
                updated_at: now
            });

        if (error) throw error;
        return next;
    }

    async listAllPrefillPosts(userId: string): Promise<StoredPost[]> {
        const { data, error } = await this.supabase
            .from("user_prefill_chunks")
            .select("*")
            .eq("user_id", userId)
            .order("chunk_index", { ascending: true });

        if (error) throw error;

        const posts: StoredPost[] = [];
        for (const row of data ?? []) {
            const chunkPosts = Array.isArray(row.posts) ? row.posts : [];
            for (const raw of chunkPosts) {
                const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
                const mode = parseFeedMode(value.mode);
                if (!mode) continue;

                posts.push({
                    id: String(value.id ?? `${row.id}-${posts.length + 1}`),
                    userId,
                    mode,
                    profile: String(value.profile ?? DEFAULT_PROFILE_BY_MODE[mode]),
                    profileKey: String(
                        value.profileKey ??
                        normalizeProfileKey(String(value.profile ?? DEFAULT_PROFILE_BY_MODE[mode]))
                    ),
                    length: value.length === "medium" ? "medium" : "short",
                    title: String(value.title ?? ""),
                    body: String(value.body ?? ""),
                    post_type: String(value.post_type ?? "micro_essay"),
                    tags: Array.isArray(value.tags) ? value.tags.map((tag) => String(tag)) : [],
                    confidence: value.confidence === "high" || value.confidence === "low" ? value.confidence : "medium",
                    uncertainty_note: value.uncertainty_note == null ? null : String(value.uncertainty_note),
                    createdAtMs:
                        typeof value.createdAtMs === "number" && Number.isFinite(value.createdAtMs)
                            ? value.createdAtMs
                            : Date.now()
                });
            }
        }

        return posts.sort((a, b) => b.createdAtMs - a.createdAtMs);
    }

    private mapUserRow(row: Record<string, unknown>): AppUser {
        const authUid = typeof row.auth_uid === "string" && row.auth_uid ? row.auth_uid : String(row.id);
        return {
            id: authUid,
            email: typeof row.email === "string" ? row.email : null,
            profile: {
                displayName: typeof row.display_name === "string" ? row.display_name : null,
                photoURL: typeof row.photo_url === "string" ? row.photo_url : null
            },
            prefillStatus: parseUserPrefillStatus(row.prefill_status),
            prefillPostCount: typeof row.prefill_post_count === "number" ? row.prefill_post_count : 0,
            prefillChunkCount: typeof row.prefill_chunk_count === "number" ? row.prefill_chunk_count : 0,
            prefillBytes: typeof row.prefill_bytes === "number" ? row.prefill_bytes : 0,
            createdAtMs: toMs(row.created_at as string),
            updatedAtMs: toMs(row.updated_at as string),
            prefillUpdatedAtMs: row.prefill_updated_at ? toMs(row.prefill_updated_at as string) : undefined
        };
    }

    private mapAnalyticsRow(event: AnalyticsEventInput, userId: string | null): Record<string, unknown> {
        const occurredAtMs = Math.max(1, Math.floor(Number(event.occurredAtMs) || Date.now()));
        return {
            event_id: event.eventId,
            event_name: event.eventName,
            platform: event.platform,
            surface: event.surface ?? null,
            user_id: userId,
            anonymous_id: event.anonymousId ?? null,
            session_id: event.sessionId ?? null,
            device_id: event.deviceId ?? null,
            app_version: event.appVersion ?? null,
            route_name: event.routeName ?? null,
            request_id: event.requestId ?? null,
            properties: event.properties ?? {},
            occurred_at: new Date(occurredAtMs).toISOString()
        };
    }

    private chunkPostsByDocumentSize(
        userId: string,
        posts: StoredPost[]
    ): Array<{ posts: StoredPost[]; sizeBytes: number }> {
        const chunks: Array<{ posts: StoredPost[]; sizeBytes: number }> = [];
        let current: StoredPost[] = [];

        const estimate = (value: StoredPost[]): number =>
            Buffer.byteLength(
                JSON.stringify({ userId, chunkIndex: 0, posts: value }),
                "utf8"
            );

        for (const post of posts) {
            const singleSize = estimate([post]);
            if (singleSize > PREFILL_DOC_TARGET_BYTES) {
                throw new ApiError(400, "prefill_post_too_large", "Single prefill post is larger than 900KB document target.");
            }

            const tentative = [...current, post];
            const tentativeBytes = estimate(tentative);
            if (tentativeBytes <= PREFILL_DOC_TARGET_BYTES) {
                current = tentative;
                continue;
            }

            chunks.push({ posts: current, sizeBytes: estimate(current) });
            current = [post];
        }

        if (current.length) {
            chunks.push({ posts: current, sizeBytes: estimate(current) });
        }

        return chunks;
    }

    private filterPostsWithFallback(posts: StoredPost[], mode: FeedMode, profileKey: string): StoredPost[] {
        const exact = posts.filter((post) => post.mode === mode && post.profileKey === profileKey);
        if (exact.length) {
            return exact;
        }
        const fallbackProfileKey = normalizeProfileKey(DEFAULT_PROFILE_BY_MODE[mode]);
        return posts.filter((post) => post.mode === mode && post.profileKey === fallbackProfileKey);
    }
}
