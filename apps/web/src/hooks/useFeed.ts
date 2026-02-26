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
    slides: unknown;
    post_type: string | null;
    tags: string[] | null;
    global_popularity_score: number | null;
    match_reason: string | null;
    has_liked: boolean;
    has_saved: boolean;
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
    markAsRead: (postId: string) => void;
    refresh: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

const PAGE_SIZE = 10;

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

function rpcRowToState(row: RpcRow): FeedPostState {
    const slides = parseSlides(row.slides);
    return {
        post: {
            id: row.feed_post_id,
            post_type: (row.post_type as Post["post_type"]) ?? "carousel",
            topic: row.match_reason ?? "Recommended",
            title: row.theme ?? "Untitled",
            slides,
            date: "",
        },
        isLiked: row.has_liked,
        isSaved: row.has_saved,
        isRead: false,
        matchReason: row.match_reason ?? "",
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
        return rows.map(rpcRowToState);
    }, [authorId, feedMode]);

    // ── Initial load ──
    const loadInitial = useCallback(async () => {
        const id = ++fetchIdRef.current;
        setLoading(true);
        setError(null);
        offsetRef.current = 0;

        try {
            const page = await fetchPage(0, id);
            if (!page) return;
            setItems(page);
            setHasMore(page.length >= PAGE_SIZE);
            offsetRef.current = page.length;
        } catch (err) {
            if (id === fetchIdRef.current) {
                setError(err instanceof Error ? err.message : "Failed to load feed.");
            }
        } finally {
            if (id === fetchIdRef.current) setLoading(false);
        }
    }, [fetchPage]);

    useEffect(() => {
        void loadInitial();
    }, [loadInitial, authorId, feedMode]);

    // ── Load more (infinite scroll) ──
    const loadMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        const id = fetchIdRef.current;
        setLoadingMore(true);

        try {
            const page = await fetchPage(offsetRef.current, id);
            if (!page) return;
            setItems((prev) => {
                const existing = new Set(prev.map((i) => i.post.id));
                const fresh = page.filter((i) => !existing.has(i.post.id));
                return [...prev, ...fresh];
            });
            setHasMore(page.length >= PAGE_SIZE);
            offsetRef.current += page.length;
        } catch (err) {
            if (id === fetchIdRef.current) {
                setError(err instanceof Error ? err.message : "Failed to load more.");
            }
        } finally {
            if (id === fetchIdRef.current) setLoadingMore(false);
        }
    }, [fetchPage, hasMore, loadingMore]);

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
    const markAsRead = useCallback((postId: string) => {
        const target = items.find((item) => item.post.id === postId);
        if (!target) return;

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
    }, [items]);

    return {
        items,
        loading,
        loadingMore,
        error,
        hasMore,
        loadMore,
        toggleLike,
        toggleSave,
        markAsRead,
        refresh: loadInitial,
    };
}
