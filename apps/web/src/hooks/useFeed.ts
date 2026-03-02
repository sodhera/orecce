"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Post, Slide } from "@/components/PostCard";
import { sendPostFeedback } from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { Recce } from "@/lib/recces";
import { readTabCache, writeTabCache } from "@/lib/tabCache";

// ── Types ────────────────────────────────────────────────────────

interface RpcRow {
    feed_post_id: string;
    theme: string | null;
    author_name: string | null;
    author_avatar: string | null;
    source_url?: string | null;
    source_title?: string | null;
    source_domain?: string | null;
    source?: string | null;
    slides: unknown;
    post_type: string | null;
    tags: string[] | null;
    global_popularity_score: number | null;
    match_reason: string | null;
    has_liked: boolean;
    has_saved: boolean;
}

interface SourceRow {
    id: string;
    source_url: string | null;
    source_title: string | null;
}

interface TopicScopedRow {
    id: string;
    theme: string | null;
    source_url: string | null;
    source_title: string | null;
    slides: unknown;
    post_type: string | null;
    topics: string[] | null;
    authors: Array<{ name: string | null; avatar_url: string | null }> | null;
}

interface FeedPostState {
    post: Post;
    isLiked: boolean;
    isSaved: boolean;
    isRead: boolean;
    matchReason: string;
    authorName: string;
    authorAvatar: string | null;
}

interface UseFeedReturn {
    items: FeedPostState[];
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    hasMore: boolean;
    loadMore: () => void;
    toggleLike: (postId: string) => void;
    toggleSave: (postId: string) => void;
    saveToCollection: (postId: string, collectionId: string) => void;
    markAsSeen: (postId: string) => void;
    markAsRead: (postId: string) => void;
    refresh: () => void;
}

interface PersistedFeedSnapshot {
    userId: string | null;
    scopeKey: string;
    items: FeedPostState[];
    hasMore: boolean;
    nextOffset: number;
}

// ── Helpers ──────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const MAX_SCAN_PAGES = 8;
const SEEN_CACHE_LIMIT = 800;
const FEED_SEEN_STORAGE_PREFIX = "orecce:feed:seen";
const FEED_VIEW_CACHE_PREFIX = "orecce:web:feed:view:v1";
const FEED_VIEW_CACHE_TTL_MS = 10 * 60 * 1000;

async function requireUserId(): Promise<string> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
        throw new Error(error.message);
    }
    if (!user) {
        throw new Error("Authentication required.");
    }
    return user.id;
}

async function getSessionUserId(): Promise<string | null> {
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();

    if (error) {
        throw new Error(error.message);
    }

    return session?.user?.id ?? null;
}

function getFeedScopeKey(
    feedMode: FeedMode,
    selectedRecceKey: string | null | undefined,
    collectionId: string | null | undefined,
): string {
    return [
        feedMode,
        selectedRecceKey ?? "all",
        collectionId ?? "none",
    ]
        .map((part) => encodeURIComponent(part))
        .join(":");
}

function parseSlides(raw: unknown): Slide[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((s: Record<string, unknown>, i: number) => ({
        slide_number: typeof s.slide_number === "number" ? s.slide_number : i + 1,
        type: (s.type as Slide["type"]) ?? "body",
        text: typeof s.text === "string" ? s.text : "",
    }));
}

function normalizeMatchReason(matchReason: string | null): string {
    const normalized = String(matchReason ?? "").trim();
    if (!normalized) {
        return "Recommended";
    }
    if (normalized.toLowerCase() === "following author") {
        return "Following";
    }
    return normalized;
}

function deriveSourceTitle(row: RpcRow): string | undefined {
    const candidate = row.source_title ?? row.source_domain ?? row.source;
    const normalized = String(candidate ?? "").trim();
    return normalized || undefined;
}

function rpcRowToState(row: RpcRow): FeedPostState {
    const slides = parseSlides(row.slides);
    const topic = normalizeMatchReason(row.match_reason);
    return {
        post: {
            id: row.feed_post_id,
            post_type: (row.post_type as Post["post_type"]) ?? "carousel",
            topic,
            title: row.theme ?? "Untitled",
            sourceUrl: row.source_url ?? undefined,
            sourceTitle: deriveSourceTitle(row),
            slides,
            date: "",
        },
        isLiked: row.has_liked,
        isSaved: row.has_saved,
        isRead: false,
        matchReason: topic,
        authorName: row.author_name ?? "Unknown",
        authorAvatar: row.author_avatar ?? null,
    };
}

function topicRowToState(
    row: TopicScopedRow,
    selectedTopic: string,
    likedIds: Set<string>,
    savedIds: Set<string>,
): FeedPostState {
    const slides = parseSlides(row.slides);
    const author = Array.isArray(row.authors) ? row.authors[0] : row.authors;
    return {
        post: {
            id: row.id,
            post_type: (row.post_type as Post["post_type"]) ?? "carousel",
            topic: selectedTopic,
            title: row.theme ?? "Untitled",
            sourceUrl: row.source_url ?? undefined,
            sourceTitle: row.source_title ?? undefined,
            slides,
            date: "",
        },
        isLiked: likedIds.has(row.id),
        isSaved: savedIds.has(row.id),
        isRead: false,
        matchReason: selectedTopic,
        authorName: author?.name ?? "Unknown",
        authorAvatar: author?.avatar_url ?? null,
    };
}

// ── Hook ─────────────────────────────────────────────────────────

export type FeedMode = "feed" | "liked" | "saved";

export function useFeed(
    selectedRecce?: Pick<Recce, "id" | "key" | "kind" | "name"> | null,
    feedMode: FeedMode = "feed",
    collectionId?: string | null,
): UseFeedReturn {
    const [items, setItems] = useState<FeedPostState[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const scopeKey = getFeedScopeKey(feedMode, selectedRecce?.key, collectionId);
    const offsetRef = useRef(0);
    const fetchIdRef = useRef(0);
    const userIdRef = useRef<string | null>(null);
    const seenStorageKeyRef = useRef<string | null>(null);
    const seenOrderRef = useRef<string[]>([]);
    const seenIdSetRef = useRef(new Set<string>());
    const readPostIdsRef = useRef(new Set<string>());

    const persistFeedSnapshot = useCallback((snapshot: {
        items: FeedPostState[];
        hasMore: boolean;
        nextOffset: number;
    }) => {
        void (async () => {
            try {
                const userId = userIdRef.current ?? await getSessionUserId();
                if (!userId) {
                    return;
                }

                userIdRef.current = userId;
                writeTabCache<PersistedFeedSnapshot>(
                    `${FEED_VIEW_CACHE_PREFIX}:${scopeKey}`,
                    {
                        userId,
                        scopeKey,
                        items: snapshot.items,
                        hasMore: snapshot.hasMore,
                        nextOffset: snapshot.nextOffset,
                    },
                );
            } catch {
                // Ignore cache persistence failures.
            }
        })();
    }, [scopeKey]);

    const hydratePersistedFeed = useCallback(async (): Promise<{
        hydrated: boolean;
        isFresh: boolean;
    }> => {
        const sessionUserId = userIdRef.current ?? await getSessionUserId();
        if (!sessionUserId) {
            return { hydrated: false, isFresh: false };
        }

        const snapshot = readTabCache<PersistedFeedSnapshot>(
            `${FEED_VIEW_CACHE_PREFIX}:${scopeKey}`,
            FEED_VIEW_CACHE_TTL_MS,
        );

        if (
            !snapshot ||
            snapshot.value.userId !== sessionUserId ||
            snapshot.value.scopeKey !== scopeKey
        ) {
            return { hydrated: false, isFresh: false };
        }

        userIdRef.current = sessionUserId;
        setItems(snapshot.value.items);
        setHasMore(snapshot.value.hasMore);
        setLoading(false);
        setError(null);
        offsetRef.current = snapshot.value.nextOffset;

        return { hydrated: true, isFresh: snapshot.isFresh };
    }, [scopeKey]);

    const getUserId = useCallback(async () => {
        if (userIdRef.current) {
            return userIdRef.current;
        }
        const userId = await requireUserId();
        userIdRef.current = userId;
        return userId;
    }, []);

    const resetSeenCache = useCallback(() => {
        seenStorageKeyRef.current = null;
        seenOrderRef.current = [];
        seenIdSetRef.current = new Set<string>();
    }, []);

    const hydrateSeenCache = useCallback(async () => {
        if (feedMode !== "feed" || typeof window === "undefined") {
            resetSeenCache();
            return;
        }

        const userId = await getUserId();
        const scope = selectedRecce?.key ?? "all";
        const key = `${FEED_SEEN_STORAGE_PREFIX}:${userId}:${scope}`;
        seenStorageKeyRef.current = key;

        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) {
                seenOrderRef.current = [];
                seenIdSetRef.current = new Set<string>();
                return;
            }

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                seenOrderRef.current = [];
                seenIdSetRef.current = new Set<string>();
                return;
            }

            const normalized = parsed
                .map((item) => String(item ?? "").trim())
                .filter(Boolean)
                .slice(-SEEN_CACHE_LIMIT);

            seenOrderRef.current = normalized;
            seenIdSetRef.current = new Set<string>(normalized);
        } catch {
            seenOrderRef.current = [];
            seenIdSetRef.current = new Set<string>();
        }
    }, [feedMode, getUserId, resetSeenCache, selectedRecce?.key]);

    const hydrateReadCache = useCallback(async () => {
        readPostIdsRef.current = new Set<string>();
        if (feedMode !== "feed") {
            return;
        }

        const userId = await getUserId();
        const { data, error } = await supabase
            .from("user_history")
            .select("post_id")
            .eq("user_id", userId)
            .in("status", ["read", "skipped"]);

        if (error) {
            throw new Error(error.message);
        }

        readPostIdsRef.current = new Set(
            (data ?? []).map((row) => String(row.post_id ?? "").trim()).filter(Boolean),
        );
    }, [feedMode, getUserId]);

    const rememberSeenPosts = useCallback((postIds: string[]) => {
        if (feedMode !== "feed" || typeof window === "undefined") {
            return;
        }

        const key = seenStorageKeyRef.current;
        if (!key) {
            return;
        }

        for (const postId of postIds) {
            const normalized = String(postId ?? "").trim();
            if (!normalized || seenIdSetRef.current.has(normalized)) {
                continue;
            }
            seenIdSetRef.current.add(normalized);
            seenOrderRef.current.push(normalized);
        }

        if (seenOrderRef.current.length > SEEN_CACHE_LIMIT) {
            const overflow = seenOrderRef.current.length - SEEN_CACHE_LIMIT;
            const trimmed = seenOrderRef.current.splice(0, overflow);
            for (const postId of trimmed) {
                seenIdSetRef.current.delete(postId);
            }
        }

        try {
            window.localStorage.setItem(key, JSON.stringify(seenOrderRef.current));
        } catch {
            // Ignore localStorage failures; feed can continue without persisted novelty memory.
        }
    }, [feedMode]);

    const fetchTopicPage = useCallback(async (offset: number, fetchId: number) => {
        if (selectedRecce?.kind !== "topic") {
            return [];
        }

        const userId = await getUserId();
        const { data, error: postsError } = await supabase
            .from("posts")
            .select("id, theme, source_url, source_title, slides, post_type, topics, authors(name, avatar_url)")
            .contains("topics", [selectedRecce.name])
            .order("global_popularity_score", { ascending: false })
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

        if (fetchId !== fetchIdRef.current) return null;
        if (postsError) throw new Error(postsError.message);

        const rows = (data ?? []) as TopicScopedRow[];
        if (!rows.length) {
            return [];
        }

        const postIds = rows.map((row) => row.id);
        const [
            { data: likeRows, error: likesError },
            { data: saveRows, error: savesError },
        ] = await Promise.all([
            supabase
                .from("user_likes")
                .select("post_id")
                .eq("user_id", userId)
                .in("post_id", postIds),
            supabase
                .from("user_saves")
                .select("post_id")
                .eq("user_id", userId)
                .in("post_id", postIds),
        ]);

        if (fetchId !== fetchIdRef.current) return null;
        if (likesError) throw new Error(likesError.message);
        if (savesError) throw new Error(savesError.message);

        const likedIds = new Set((likeRows ?? []).map((row) => String(row.post_id)));
        const savedIds = new Set((saveRows ?? []).map((row) => String(row.post_id)));
        return rows.map((row) => topicRowToState(row, selectedRecce.name, likedIds, savedIds));
    }, [getUserId, selectedRecce]);

    const fetchPage = useCallback(async (offset: number, fetchId: number) => {
        if (feedMode === "feed" && selectedRecce?.kind === "topic") {
            return fetchTopicPage(offset, fetchId);
        }

        let rpcName: "get_personalized_feed" | "get_user_liked_posts" | "get_user_saved_posts" | "get_collection_posts" = "get_personalized_feed";
        let rpcParams: Record<string, unknown> = { p_limit: PAGE_SIZE, p_offset: offset };

        if (feedMode === "liked") {
            rpcName = "get_user_liked_posts";
        } else if (feedMode === "saved" && collectionId) {
            rpcName = "get_collection_posts";
            rpcParams = { ...rpcParams, p_collection_id: collectionId };
        } else if (feedMode === "saved") {
            rpcName = "get_user_saved_posts";
        } else {
            // "feed" mode (Home)
            rpcParams = {
                ...rpcParams,
                p_author_id: selectedRecce?.kind === "author" ? selectedRecce.id : null,
            };
        }

        const { data, error: rpcError } = await supabase.rpc(
            rpcName as any,
            rpcParams as any
        );

        // Bail if a newer fetch has started
        if (fetchId !== fetchIdRef.current) return null;

        if (rpcError) throw new Error(rpcError.message);
        const rows = (data ?? []) as RpcRow[];
        if (!rows.length) {
            return [];
        }

        const missingSourceIds = rows
            .filter((row) => !row.source_url || !row.source_title)
            .map((row) => row.feed_post_id);

        if (missingSourceIds.length > 0) {
            const { data: sources } = await supabase
                .from("posts")
                .select("id,source_url,source_title")
                .in("id", missingSourceIds);

            const sourceMap = new Map<string, SourceRow>(
                ((sources ?? []) as SourceRow[]).map((source) => [source.id, source]),
            );

            for (const row of rows) {
                const source = sourceMap.get(row.feed_post_id);
                if (!source) {
                    continue;
                }
                row.source_url = row.source_url ?? source.source_url;
                row.source_title = row.source_title ?? source.source_title;
            }
        }

        return rows.map(rpcRowToState);
    }, [collectionId, feedMode, fetchTopicPage, selectedRecce]);

    const fetchNovelPage = useCallback(async (
        startOffset: number,
        fetchId: number,
        existingIds: Set<string>,
    ) => {
        let offset = startOffset;
        let reachedEnd = false;
        const collected: FeedPostState[] = [];

        for (let scanIndex = 0; scanIndex < MAX_SCAN_PAGES && collected.length < PAGE_SIZE; scanIndex += 1) {
            const page = await fetchPage(offset, fetchId);
            if (!page) {
                return null;
            }

            offset += page.length;

            for (const item of page) {
                const postId = item.post.id;
                if (existingIds.has(postId)) {
                    continue;
                }
                if (feedMode === "feed" && readPostIdsRef.current.has(postId)) {
                    continue;
                }
                if (feedMode === "feed" && seenIdSetRef.current.has(postId)) {
                    continue;
                }
                existingIds.add(postId);
                collected.push(item);
                if (collected.length >= PAGE_SIZE) {
                    break;
                }
            }

            if (page.length < PAGE_SIZE) {
                reachedEnd = true;
                break;
            }

            if (feedMode !== "feed") {
                break;
            }
        }

        return {
            items: collected,
            nextOffset: offset,
            reachedEnd,
        };
    }, [feedMode, fetchPage]);

    // ── Initial load ──
    const loadInitial = useCallback(async (force = false) => {
        const id = ++fetchIdRef.current;
        let hydrated = false;
        let isFresh = false;

        if (!force) {
            try {
                const hydration = await hydratePersistedFeed();
                hydrated = hydration.hydrated;
                isFresh = hydration.isFresh;
            } catch {
                hydrated = false;
                isFresh = false;
            }
        }

        if (!hydrated) {
            setLoading(true);
            offsetRef.current = 0;
        } else {
            setLoading(false);
        }

        setError(null);
        resetSeenCache();

        try {
            await hydrateSeenCache();

            if (hydrated && isFresh && !force) {
                void hydrateReadCache().catch(() => { });
                return;
            }

            await hydrateReadCache();
            const result = await fetchNovelPage(0, id, new Set<string>());
            if (!result) return;

            setItems(result.items);
            const nextHasMore = !result.reachedEnd;
            setHasMore(nextHasMore);
            offsetRef.current = result.nextOffset;
            persistFeedSnapshot({
                items: result.items,
                hasMore: nextHasMore,
                nextOffset: result.nextOffset,
            });
        } catch (err) {
            if (id === fetchIdRef.current) {
                setError(err instanceof Error ? err.message : "Failed to load feed.");
            }
        } finally {
            if (id === fetchIdRef.current) setLoading(false);
        }
    }, [
        fetchNovelPage,
        hydratePersistedFeed,
        hydrateReadCache,
        hydrateSeenCache,
        persistFeedSnapshot,
        resetSeenCache,
    ]);

    useEffect(() => {
        void loadInitial();
    }, [collectionId, feedMode, loadInitial, selectedRecce?.key]);

    // ── Load more (infinite scroll) ──
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        const id = fetchIdRef.current;
        setLoadingMore(true);

        try {
            const existingIds = new Set(items.map((item) => item.post.id));
            const result = await fetchNovelPage(offsetRef.current, id, existingIds);
            if (!result) return;

            const nextHasMore = !result.reachedEnd;
            const nextItems =
                result.items.length > 0
                    ? [...items, ...result.items]
                    : items;

            if (result.items.length > 0) {
                setItems(nextItems);
            }

            setHasMore(nextHasMore);
            offsetRef.current = result.nextOffset;
            persistFeedSnapshot({
                items: nextItems,
                hasMore: nextHasMore,
                nextOffset: result.nextOffset,
            });
        } catch (err) {
            if (id === fetchIdRef.current) {
                setError(err instanceof Error ? err.message : "Failed to load more.");
            }
        } finally {
            if (id === fetchIdRef.current) setLoadingMore(false);
        }
    }, [fetchNovelPage, hasMore, items, loadingMore, persistFeedSnapshot]);

    // ── Toggle like (optimistic) ──
    const toggleLike = useCallback((postId: string) => {
        const target = items.find((item) => item.post.id === postId);
        if (!target) return;

        const optimisticLiked = !target.isLiked;
        const optimisticItems = items.map((item) =>
            item.post.id === postId ? { ...item, isLiked: optimisticLiked } : item,
        );
        setItems(optimisticItems);
        setError(null);
        persistFeedSnapshot({
            items: optimisticItems,
            hasMore,
            nextOffset: offsetRef.current,
        });

        void (async () => {
            try {
                const userId = await requireUserId();
                if (optimisticLiked) {
                    const { error: insertError } = await supabase
                        .from("user_likes")
                        .insert({ user_id: userId, post_id: postId });
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                } else {
                    const { error: deleteError } = await supabase
                        .from("user_likes")
                        .delete()
                        .match({ user_id: userId, post_id: postId });
                    if (deleteError) {
                        throw new Error(deleteError.message);
                    }
                }
                await sendPostFeedback(postId, optimisticLiked ? "upvote" : "skip");
                trackAnalyticsEvent({
                    eventName: optimisticLiked ? "post_upvoted" : "post_vote_cleared",
                    surface: feedMode,
                    properties: {
                        post_id: postId,
                        topic: target.post.topic,
                        author_name: target.authorName,
                    },
                });
            } catch (error) {
                const revertedItems = optimisticItems.map((item) => {
                    if (item.post.id !== postId || item.isLiked !== optimisticLiked) {
                        return item;
                    }
                    return { ...item, isLiked: target.isLiked };
                });
                setItems(revertedItems);
                setError(error instanceof Error ? error.message : "Failed to update like.");
                persistFeedSnapshot({
                    items: revertedItems,
                    hasMore,
                    nextOffset: offsetRef.current,
                });
            }
        })();
    }, [hasMore, items, persistFeedSnapshot]);

    // ── Toggle save (optimistic) ──
    const toggleSave = useCallback((postId: string) => {
        const target = items.find((item) => item.post.id === postId);
        if (!target) return;

        const optimisticSaved = !target.isSaved;
        const optimisticItems = items.map((item) =>
            item.post.id === postId ? { ...item, isSaved: optimisticSaved } : item,
        );
        setItems(optimisticItems);
        setError(null);
        persistFeedSnapshot({
            items: optimisticItems,
            hasMore,
            nextOffset: offsetRef.current,
        });

        void (async () => {
            try {
                const userId = await requireUserId();
                if (optimisticSaved) {
                    // Ensure user has a default collection and save into it
                    const { data: defaultColId, error: rpcError } = await supabase.rpc(
                        "ensure_default_collection" as any,
                        { p_user_id: userId } as any,
                    );
                    if (rpcError) throw new Error(rpcError.message);
                    const { error: insertError } = await supabase
                        .from("user_saves")
                        .insert({ user_id: userId, post_id: postId, collection_id: defaultColId });
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                } else {
                    const { error: deleteError } = await supabase
                        .from("user_saves")
                        .delete()
                        .match({ user_id: userId, post_id: postId });
                    if (deleteError) {
                        throw new Error(deleteError.message);
                    }
                }
                await sendPostFeedback(postId, optimisticSaved ? "save" : "unsave");
                trackAnalyticsEvent({
                    eventName: optimisticSaved ? "post_saved" : "post_unsaved",
                    surface: feedMode,
                    properties: {
                        post_id: postId,
                        topic: target.post.topic,
                        author_name: target.authorName,
                    },
                });
            } catch (error) {
                const revertedItems = optimisticItems.map((item) => {
                    if (item.post.id !== postId || item.isSaved !== optimisticSaved) {
                        return item;
                    }
                    return { ...item, isSaved: target.isSaved };
                });
                setItems(revertedItems);
                setError(error instanceof Error ? error.message : "Failed to update saved state.");
                persistFeedSnapshot({
                    items: revertedItems,
                    hasMore,
                    nextOffset: offsetRef.current,
                });
            }
        })();
    }, [hasMore, items, persistFeedSnapshot]);

    // ── Save to specific collection ──
    const saveToCollection = useCallback((postId: string, collectionId: string) => {
        const target = items.find((item) => item.post.id === postId);
        if (!target) return;

        const optimisticItems = items.map((item) =>
            item.post.id === postId ? { ...item, isSaved: true } : item,
        );
        setItems(optimisticItems);
        setError(null);
        persistFeedSnapshot({
            items: optimisticItems,
            hasMore,
            nextOffset: offsetRef.current,
        });

        void (async () => {
            try {
                const userId = await requireUserId();
                const { error: insertError } = await supabase
                    .from("user_saves")
                    .insert({ user_id: userId, post_id: postId, collection_id: collectionId });
                if (insertError) {
                    throw new Error(insertError.message);
                }
                await sendPostFeedback(postId, "save");
                trackAnalyticsEvent({
                    eventName: "post_saved_to_collection",
                    surface: feedMode,
                    properties: {
                        post_id: postId,
                        collection_id: collectionId,
                        topic: target.post.topic,
                        author_name: target.authorName,
                    },
                });
            } catch (error) {
                const revertedItems = optimisticItems.map((item) => {
                    if (item.post.id !== postId || !item.isSaved) {
                        return item;
                    }
                    return { ...item, isSaved: target.isSaved };
                });
                setItems(revertedItems);
                setError(error instanceof Error ? error.message : "Failed to save to collection.");
                persistFeedSnapshot({
                    items: revertedItems,
                    hasMore,
                    nextOffset: offsetRef.current,
                });
            }
        })();
    }, [hasMore, items, persistFeedSnapshot]);

    // ── Mark as read (fire-and-forget) ──
    const markAsSeen = useCallback((postId: string) => {
        const normalized = String(postId ?? "").trim();
        if (!normalized || feedMode !== "feed" || seenIdSetRef.current.has(normalized)) {
            return;
        }
        rememberSeenPosts([normalized]);
    }, [feedMode, rememberSeenPosts]);

    const markAsRead = useCallback((postId: string) => {
        const target = items.find((item) => item.post.id === postId);
        if (!target) return;

        markAsSeen(postId);

        const optimisticRead = true;
        const optimisticItems = items.map((item) =>
            item.post.id === postId ? { ...item, isRead: optimisticRead } : item,
        );
        setItems(optimisticItems);
        setError(null);
        persistFeedSnapshot({
            items: optimisticItems,
            hasMore,
            nextOffset: offsetRef.current,
        });

        void (async () => {
            try {
                const userId = await requireUserId();
                const { error } = await supabase
                    .from("user_history")
                    .upsert({ user_id: userId, post_id: postId, status: "read" }, { onConflict: "user_id,post_id" });
                if (error) {
                    throw new Error(error.message);
                }
                readPostIdsRef.current.add(postId);
                trackAnalyticsEvent({
                    eventName: "feed_post_read",
                    surface: feedMode,
                    properties: {
                        post_id: postId,
                        topic: target.post.topic,
                        author_name: target.authorName,
                    },
                });
            } catch (error) {
                const revertedItems = optimisticItems.map((item) => {
                    if (item.post.id !== postId || item.isRead !== optimisticRead) {
                        return item;
                    }
                    return { ...item, isRead: target.isRead };
                });
                setItems(revertedItems);
                setError(error instanceof Error ? error.message : "Failed to mark post as read.");
                persistFeedSnapshot({
                    items: revertedItems,
                    hasMore,
                    nextOffset: offsetRef.current,
                });
            }
        })();
    }, [hasMore, items, markAsSeen, persistFeedSnapshot]);

    return {
        items,
        loading,
        loadingMore,
        error,
        hasMore,
        loadMore,
        toggleLike,
        toggleSave,
        saveToCollection,
        markAsSeen,
        markAsRead,
        refresh: useCallback(() => {
            void loadInitial(true);
        }, [loadInitial]),
    };
}
