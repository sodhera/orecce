"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PostCard, { Post } from "./PostCard";
import {
    recommendRecces,
    recordReccesInteraction,
    sendPostFeedback,
    type ReccesRecommendationItem,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const RECCES_AUTHOR_ID = "paul_graham";
const RECOMMEND_PAGE_SIZE = 8;
const RECENT_WINDOW = 24;
const EXCLUDE_WINDOW = 100;
const INTERACTION_FLUSH_THRESHOLD = 3;

interface PendingInteraction {
    flipCount: number;
    maxSlideIndex: number;
    slideCount: number;
}

function toPost(item: ReccesRecommendationItem): Post {
    return {
        id: item.id,
        post_type: item.postType === "carousel" ? "carousel" : "single",
        topic: item.theme,
        title: item.sourceTitle,
        slides: item.slides.map((slide, index) => ({
            slide_number:
                Number.isFinite(slide.slideNumber) && slide.slideNumber > 0
                    ? slide.slideNumber
                    : index + 1,
            type:
                slide.type === "hook" || slide.type === "body" || slide.type === "closer"
                    ? slide.type
                    : "standalone",
            text: slide.text,
        })),
        date: item.theme,
    };
}

export default function ReccesBlogFeed() {
    const { isAuthenticated, loading } = useAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const loadedIdsRef = useRef(new Set<string>());
    const loadedOrderRef = useRef<string[]>([]);
    const recentIdsRef = useRef<string[]>([]);
    const pendingInteractionsRef = useRef(new Map<string, PendingInteraction>());

    const pushRecent = useCallback((postId: string) => {
        const next = recentIdsRef.current.filter((id) => id !== postId);
        next.push(postId);
        recentIdsRef.current = next.slice(-RECENT_WINDOW);
    }, []);

    const flushInteraction = useCallback(async (postId: string): Promise<void> => {
        const pending = pendingInteractionsRef.current.get(postId);
        if (!pending || pending.flipCount <= 0) {
            return;
        }
        try {
            await recordReccesInteraction({
                postId,
                slideFlipCount: pending.flipCount,
                maxSlideIndex: pending.maxSlideIndex,
                slideCount: pending.slideCount,
            });
            pendingInteractionsRef.current.delete(postId);
        } catch {
            // Keep pending data and retry on future flips.
        }
    }, []);

    const loadMore = useCallback(async () => {
        if (loading || !isAuthenticated) {
            return;
        }
        if (loadingMore || !hasMore) {
            return;
        }
        setLoadingMore(true);
        setError(null);
        try {
            const result = await recommendRecces({
                authorId: RECCES_AUTHOR_ID,
                limit: RECOMMEND_PAGE_SIZE,
                recentPostIds: recentIdsRef.current.slice(-RECENT_WINDOW),
                excludePostIds: loadedOrderRef.current.slice(-EXCLUDE_WINDOW),
            });
            const freshItems = result.items.filter(
                (item) => !loadedIdsRef.current.has(item.id),
            );
            if (!freshItems.length) {
                setHasMore(false);
                return;
            }

            for (const item of freshItems) {
                loadedIdsRef.current.add(item.id);
                loadedOrderRef.current.push(item.id);
            }
            setPosts((current) => [...current, ...freshItems.map(toPost)]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load blog recommendations.");
            setHasMore(false);
        } finally {
            setLoadingMore(false);
            setLoadingInitial(false);
        }
    }, [hasMore, isAuthenticated, loading, loadingMore]);

    useEffect(() => {
        void loadMore();
    }, [loadMore]);

    useEffect(() => {
        const target = loadMoreRef.current;
        if (!target || !hasMore) {
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    void loadMore();
                }
            },
            { rootMargin: "320px 0px" },
        );
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, loadMore]);

    useEffect(() => {
        return () => {
            for (const postId of pendingInteractionsRef.current.keys()) {
                void flushInteraction(postId);
            }
        };
    }, [flushInteraction]);

    const handleSlideFlip = useCallback(
        (postId: string, payload: { flipDelta: number; currentSlideIndex: number; slideCount: number }) => {
            pushRecent(postId);
            const existing = pendingInteractionsRef.current.get(postId) ?? {
                flipCount: 0,
                maxSlideIndex: 0,
                slideCount: Math.max(1, payload.slideCount),
            };

            existing.flipCount += Math.max(0, Math.floor(payload.flipDelta));
            existing.maxSlideIndex = Math.max(existing.maxSlideIndex, payload.currentSlideIndex);
            existing.slideCount = Math.max(existing.slideCount, payload.slideCount);
            pendingInteractionsRef.current.set(postId, existing);

            if (existing.flipCount >= INTERACTION_FLUSH_THRESHOLD) {
                void flushInteraction(postId);
            }
        },
        [flushInteraction, pushRecent],
    );

    const handleLikeToggle = useCallback(
        (postId: string, liked: boolean) => {
            pushRecent(postId);
            void sendPostFeedback(postId, liked ? "upvote" : "skip").catch(() => {
                // Non-blocking; keep feed interaction responsive.
            });
        },
        [pushRecent],
    );

    const footerText = useMemo(() => {
        if (loadingMore) {
            return "Loading more recommendations...";
        }
        if (!hasMore) {
            return "No more blog recommendations right now.";
        }
        return "Scroll for more.";
    }, [hasMore, loadingMore]);

    if (loading || (loadingInitial && posts.length === 0)) {
        return (
            <div className="feed-posts-container">
                <div className="feed-empty-state">Loading blog recommendations...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="feed-posts-container">
                <div className="feed-empty-state">Sign in required for blog recommendations.</div>
            </div>
        );
    }

    return (
        <div className="feed-posts-container">
            {error && <div className="feed-empty-state">{error}</div>}
            {posts.map((post) => (
                <PostCard
                    key={post.id}
                    post={post}
                    onSlideFlip={(payload) => handleSlideFlip(post.id, payload)}
                    onLikeToggle={(liked) => handleLikeToggle(post.id, liked)}
                />
            ))}
            <div ref={loadMoreRef} className="feed-recces-load-more">
                {footerText}
            </div>
        </div>
    );
}
