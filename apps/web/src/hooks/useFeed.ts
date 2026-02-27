"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Post, Slide } from "@/components/PostCard";
import { sendPostFeedback } from "@/lib/api";

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
    markAsSeen: (postId: string) => void;
    markAsRead: (postId: string) => void;
    refresh: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const MAX_SCAN_PAGES = 8;
const SEEN_CACHE_LIMIT = 800;
const FEED_SEEN_STORAGE_PREFIX = "orecce:feed:seen";

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

// ── Hook ─────────────────────────────────────────────────────────

export type FeedMode = "feed" | "liked" | "saved";

export function useFeed(authorId?: string | null, feedMode: FeedMode = "feed"): UseFeedReturn {
    const [items, setItems] = useState<FeedPostState[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const offsetRef = useRef(0);
    const fetchIdRef = useRef(0);
    const userIdRef = useRef<string | null>(null);
    const seenStorageKeyRef = useRef<string | null>(null);
    const seenOrderRef = useRef<string[]>([]);
    const seenIdSetRef = useRef(new Set<string>());

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
        const scope = authorId ?? "all";
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
    }, [authorId, feedMode, getUserId, resetSeenCache]);

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

    const fetchPage = useCallback(async (offset: number, fetchId: number) => {
        let rpcName: "get_personalized_feed" | "get_user_liked_posts" | "get_user_saved_posts" = "get_personalized_feed";
        let rpcParams: Record<string, unknown> = { p_limit: PAGE_SIZE, p_offset: offset };

        if (feedMode === "liked") {
            rpcName = "get_user_liked_posts";
        } else if (feedMode === "saved") {
            rpcName = "get_user_saved_posts";
        } else {
            // "feed" mode (Home)
            rpcParams = { ...rpcParams, p_author_id: authorId ?? null };
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
    }, [authorId, feedMode]);

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
    const loadInitial = useCallback(async () => {
        const id = ++fetchIdRef.current;
        setLoading(true);
        setError(null);
        offsetRef.current = 0;
        resetSeenCache();

        try {
            await hydrateSeenCache();
            const result = await fetchNovelPage(0, id, new Set<string>());
            if (!result) return;

            setItems(result.items);
            setHasMore(!result.reachedEnd);
            offsetRef.current = result.nextOffset;
        } catch (err) {
            if (id === fetchIdRef.current) {
                setError(err instanceof Error ? err.message : "Failed to load feed.");
            }
        } finally {
            if (id === fetchIdRef.current) setLoading(false);
        }
    }, [fetchNovelPage, hydrateSeenCache, resetSeenCache]);

    useEffect(() => {
        void loadInitial();
    }, [loadInitial, authorId, feedMode]);

    // ── Load more (infinite scroll) ──
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        const id = fetchIdRef.current;
        setLoadingMore(true);

        try {
            const existingIds = new Set(items.map((item) => item.post.id));
            const result = await fetchNovelPage(offsetRef.current, id, existingIds);
            if (!result) return;

            if (result.items.length > 0) {
                setItems((prev) => [...prev, ...result.items]);
            }

            setHasMore(!result.reachedEnd);
            offsetRef.current = result.nextOffset;
        } catch (err) {
            if (id === fetchIdRef.current) {
                setError(err instanceof Error ? err.message : "Failed to load more.");
            }
        } finally {
            if (id === fetchIdRef.current) setLoadingMore(false);
        }
    }, [fetchNovelPage, hasMore, items, loadingMore]);

    // ── Toggle like (optimistic) ──
    const toggleLike = useCallback((postId: string) => {
        const target = items.find((item) => item.post.id === postId);
        if (!target) return;

        const optimisticLiked = !target.isLiked;
        setItems((prev) =>
            prev.map((item) =>
                item.post.id === postId ? { ...item, isLiked: optimisticLiked } : item,
            ),
        );
        setError(null);

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
            } catch (error) {
                setItems((prev) =>
                    prev.map((item) => {
                        if (item.post.id !== postId || item.isLiked !== optimisticLiked) {
                            return item;
                        }
                        return { ...item, isLiked: target.isLiked };
                    }),
                );
                setError(error instanceof Error ? error.message : "Failed to update like.");
            }
        })();
    }, [items]);

    // ── Toggle save (optimistic) ──
    const toggleSave = useCallback((postId: string) => {
        const target = items.find((item) => item.post.id === postId);
        if (!target) return;

        const optimisticSaved = !target.isSaved;
        setItems((prev) =>
            prev.map((item) =>
                item.post.id === postId ? { ...item, isSaved: optimisticSaved } : item,
            ),
        );
        setError(null);

        void (async () => {
            try {
                const userId = await requireUserId();
                if (optimisticSaved) {
                    const { error: insertError } = await supabase
                        .from("user_saves")
                        .insert({ user_id: userId, post_id: postId });
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
            } catch (error) {
                setItems((prev) =>
                    prev.map((item) => {
                        if (item.post.id !== postId || item.isSaved !== optimisticSaved) {
                            return item;
                        }
                        return { ...item, isSaved: target.isSaved };
                    }),
                );
                setError(error instanceof Error ? error.message : "Failed to update saved state.");
            }
        })();
    }, [items]);

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
        setItems((prev) =>
            prev.map((item) =>
                item.post.id === postId ? { ...item, isRead: optimisticRead } : item,
            ),
        );
        setError(null);

        void (async () => {
            try {
                const userId = await requireUserId();
                const { error } = await supabase
                    .from("user_history")
                    .upsert({ user_id: userId, post_id: postId, status: "read" }, { onConflict: "user_id,post_id" });
                if (error) {
                    throw new Error(error.message);
                }
            } catch (error) {
                setItems((prev) =>
                    prev.map((item) => {
                        if (item.post.id !== postId || item.isRead !== optimisticRead) {
                            return item;
                        }
                        return { ...item, isRead: target.isRead };
                    }),
                );
                setError(error instanceof Error ? error.message : "Failed to mark post as read.");
            }
        })();
    }, [items, markAsSeen]);

    return {
        items,
        loading,
        loadingMore,
        error,
        hasMore,
        loadMore,
        toggleLike,
        toggleSave,
        markAsSeen,
        markAsRead,
        refresh: loadInitial,
    };
}
