"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import PostCard from "./PostCard";
import PostCardSkeleton from "./PostCardSkeleton";
import { useFeed } from "@/hooks/useFeed";
import { useCollections } from "@/hooks/useCollections";
import { useRecces } from "@/hooks/useRecces";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { isPaulGrahamRecce, type Recce } from "@/lib/recces";

interface FeedProps {
    mode: string;
    profile: string;
    onModeChange?: (mode: string) => void;
}

const RECOMMENDED_COUNT = 3;
const SEEN_VISIBILITY_RATIO = 0.7;
const SEEN_IMPRESSION_MS = 2500;

function recceSubtitle(recce: Recce): string | null {
    if (recce.bio?.trim()) {
        return recce.bio.trim();
    }
    return recce.kind === "topic" ? "Topic Recce" : null;
}

export default function Feed({ mode, onModeChange }: FeedProps) {
    const { recces, followedKeys, loading: reccesLoading, toggleFollow } = useRecces();
    const followedRecces = useMemo(
        () => recces.filter((recce) => followedKeys.has(recce.key)),
        [followedKeys, recces]
    );
    const followedAuthorNames = useMemo(() => {
        if (reccesLoading) {
            return undefined;
        }

        return new Set(
            recces
                .filter((recce) => recce.kind === "author" && followedKeys.has(recce.key))
                .map((recce) => recce.name),
        );
    }, [followedKeys, recces, reccesLoading]);
    const selectedRecce = useMemo(
        () => recces.find((recce) => recce.key === mode) ?? null,
        [mode, recces]
    );

    const recommendedRecces = useMemo(
        () => recces.filter((recce) => !followedKeys.has(recce.key)).slice(0, RECOMMENDED_COUNT),
        [followedKeys, recces]
    );

    const feed = useFeed(mode === "ALL" ? null : selectedRecce, "feed", null, followedAuthorNames);
    const { refresh: refreshFeed } = feed;
    const { collections } = useCollections();
    const collectionsList = useMemo(
        () => collections.map((c) => ({ id: c.id, name: c.name })),
        [collections],
    );

    useEffect(() => {
        const handleFollowSuccess = (e: Event) => {
            const customEvent = e as CustomEvent<{ recceKey: string; isFollowing: boolean }>;
            if (mode === "ALL") {
                refreshFeed();
                return;
            }
            if (!customEvent.detail.isFollowing && customEvent.detail.recceKey === mode) {
                onModeChange?.("ALL");
            }
        };

        window.addEventListener("orecce:follow:success", handleFollowSuccess);
        return () => window.removeEventListener("orecce:follow:success", handleFollowSuccess);
    }, [mode, onModeChange, refreshFeed]);

    useEffect(() => {
        if (mode === "ALL" || reccesLoading) {
            return;
        }
        if (!followedKeys.has(mode)) {
            onModeChange?.("ALL");
        }
    }, [followedKeys, mode, onModeChange, reccesLoading]);

    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const seenInSessionRef = useRef(new Set<string>());
    const impressedInSessionRef = useRef(new Set<string>());
    const visibilityTimersRef = useRef(new Map<string, number>());

    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || feed.loading || feed.loadingMore || !feed.hasMore) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        trackAnalyticsEvent({
                            eventName: "feed_load_more_requested",
                            surface: "feed",
                            properties: {
                                current_count: feed.items.length,
                            },
                        });
                        void feed.loadMore();
                        break;
                    }
                }
            },
            { threshold: 1 },
        );

        observer.observe(node);
        return () => {
            observer.disconnect();
        };
    }, [feed.loading, feed.loadingMore, feed.hasMore, feed.loadMore]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const element = entry.target as HTMLElement;
                    const postId = String(element.dataset.postId ?? "").trim();
                    if (!postId) {
                        continue;
                    }

                    if (
                        entry.isIntersecting &&
                        entry.intersectionRatio > SEEN_VISIBILITY_RATIO &&
                        !impressedInSessionRef.current.has(postId)
                    ) {
                        impressedInSessionRef.current.add(postId);
                        const matchingItem = feed.items.find((item) => item.post.id === postId);
                        trackAnalyticsEvent({
                            eventName: "feed_post_impression",
                            surface: "feed",
                            properties: {
                                post_id: postId,
                                author_name: matchingItem?.authorName ?? null,
                                topic: matchingItem?.post.topic ?? null,
                                match_reason: matchingItem?.matchReason ?? null,
                                feed_position: feed.items.findIndex((item) => item.post.id === postId),
                                visible_ratio: entry.intersectionRatio,
                            },
                        });
                    }

                    if (seenInSessionRef.current.has(postId)) {
                        continue;
                    }

                    if (entry.isIntersecting && entry.intersectionRatio > SEEN_VISIBILITY_RATIO) {
                        if (visibilityTimersRef.current.has(postId)) {
                            continue;
                        }

                        const timerId = window.setTimeout(() => {
                            seenInSessionRef.current.add(postId);
                            visibilityTimersRef.current.delete(postId);
                            feed.markAsSeen(postId);
                            const matchingItem = feed.items.find((item) => item.post.id === postId);
                            trackAnalyticsEvent({
                                eventName: "feed_post_seen",
                                surface: "feed",
                                properties: {
                                    post_id: postId,
                                    author_name: matchingItem?.authorName ?? null,
                                    topic: matchingItem?.post.topic ?? null,
                                    match_reason: matchingItem?.matchReason ?? null,
                                    feed_position: feed.items.findIndex((item) => item.post.id === postId),
                                    dwell_ms: SEEN_IMPRESSION_MS,
                                    visible_ratio: entry.intersectionRatio,
                                },
                            });
                        }, SEEN_IMPRESSION_MS);
                        visibilityTimersRef.current.set(postId, timerId);
                        continue;
                    }

                    const existingTimer = visibilityTimersRef.current.get(postId);
                    if (existingTimer) {
                        window.clearTimeout(existingTimer);
                        visibilityTimersRef.current.delete(postId);
                    }
                }
            },
            { threshold: [SEEN_VISIBILITY_RATIO] },
        );

        const nodes = document.querySelectorAll<HTMLElement>(".feed-slide-shell[data-post-id]");
        nodes.forEach((node) => observer.observe(node));

        return () => {
            observer.disconnect();
            for (const timerId of visibilityTimersRef.current.values()) {
                window.clearTimeout(timerId);
            }
            visibilityTimersRef.current.clear();
        };
    }, [feed.items, feed.markAsSeen]);

    useEffect(() => {
        if (!feed.loading && !feed.error && feed.items.length === 0) {
            trackAnalyticsEvent({
                eventName: "feed_empty_state_viewed",
                surface: "feed",
            });
        }
    }, [feed.error, feed.items.length, feed.loading]);

    useEffect(() => {
        if (feed.loading || feed.items.length > 0 || recommendedRecces.length === 0) {
            return;
        }
        for (const recce of recommendedRecces) {
            trackAnalyticsEvent({
                eventName: "discover_recce_impression",
                surface: "feed",
                properties: {
                    recce_id: recce.id,
                    recce_key: recce.key,
                    recce_name: recce.name,
                    recce_type: recce.kind,
                },
            });
        }
    }, [feed.items.length, feed.loading, recommendedRecces]);

    return (
        <main className="feed">
            <div className="feed-header">
                <div className="feed-header-top">
                    <h1>Home</h1>
                </div>
            </div>

            {/* Category pills — horizontally scrollable */}
            <div className="feed-categories">
                <button
                    className={`feed-category-pill ${mode === "ALL" ? "active" : ""}`}
                    onClick={() => onModeChange?.("ALL")}
                >
                    All
                </button>
                {followedRecces.map((recce) => (
                    <button
                        key={recce.key}
                        className={`feed-category-pill ${mode === recce.key ? "active" : ""}`}
                        onClick={() => onModeChange?.(recce.key)}
                    >
                        {recce.name}
                    </button>
                ))}
            </div>

            <div className="feed-posts-container feed-posts-slides feed-posts-slides-center">
                {feed.loading ? (
                    <>
                        <PostCardSkeleton />
                        <PostCardSkeleton />
                        <PostCardSkeleton />
                    </>
                ) : feed.items.length === 0 ? (
                    feed.error ? (
                        <div
                            style={{
                                padding: 40,
                                textAlign: "center",
                                color: "var(--text-secondary)",
                            }}
                        >
                            {`Error: ${feed.error}`}
                        </div>
                    ) : (
                        <div className="feed-empty-state">
                            <div className="feed-empty-icon">✦</div>
                            <h2 className="feed-empty-title">Welcome to your feed</h2>
                            <p className="feed-empty-subtitle">
                                Follow recces to see their posts here. Here are a few to get you started:
                            </p>

                            {recommendedRecces.length > 0 && (
                                <div className="feed-recommended-authors">
                                    {recommendedRecces.map((recce) => (
                                        <div
                                            key={recce.key}
                                            className={`feed-rec-author-card ${isPaulGrahamRecce(recce) ? "recce-card--paul-graham" : ""}`}
                                        >
                                            <div className="feed-rec-author-avatar">
                                                {recce.name?.charAt(0).toUpperCase() || "?"}
                                            </div>
                                            <div className="feed-rec-author-info">
                                                <span className="feed-rec-author-name">{recce.name}</span>
                                                {recceSubtitle(recce) && (
                                                    <span className="feed-rec-author-bio">{recceSubtitle(recce)}</span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className="feed-rec-follow-btn"
                                                onClick={() => toggleFollow(recce)}
                                            >
                                                Follow
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <Link href="/discover" className="feed-empty-discover-link">
                                Browse all recces →
                            </Link>
                        </div>
                    )
                ) : (
                    feed.items.map((item) => (
                        <div
                            key={item.post.id}
                            className={`feed-slide-shell ${item.post.post_type === "carousel" ? "feed-slide-shell-carousel" : ""}`}
                            data-post-id={item.post.id}
                        >
                            <PostCard
                                post={item.post}
                                variant="slide"
                                isLiked={item.isLiked}
                                isSaved={item.isSaved}
                                authorName={item.authorName}
                                authorAvatar={item.authorAvatar}
                                collections={collectionsList}
                                onLikeToggle={() => feed.toggleLike(item.post.id)}
                                onSaveToggle={() => feed.toggleSave(item.post.id)}
                                onSaveToCollection={(postId, collectionId) => feed.saveToCollection(postId, collectionId)}
                                onLastSlide={() => feed.markAsRead(item.post.id)}
                            />
                        </div>
                    ))
                )}

                {feed.hasMore && feed.items.length > 0 && (
                    <div
                        ref={loadMoreRef}
                        className="sports-load-more-trigger"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                            trackAnalyticsEvent({
                                eventName: "feed_load_more_requested",
                                surface: "feed",
                                properties: {
                                    current_count: feed.items.length,
                                },
                            });
                            void feed.loadMore();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                trackAnalyticsEvent({
                                    eventName: "feed_load_more_requested",
                                    surface: "feed",
                                    properties: {
                                        current_count: feed.items.length,
                                    },
                                });
                                void feed.loadMore();
                            }
                        }}
                        style={{ display: "flex", justifyContent: "center", alignItems: "center", borderBottom: feed.loadingMore ? "none" : undefined }}
                    >
                        {feed.loadingMore ? (
                            <span className="fb-submit-spinner" style={{ borderColor: 'var(--text-secondary)', borderTopColor: 'transparent', width: '20px', height: '20px', borderWidth: '2px' }} />
                        ) : (
                            "Scroll to load more posts..."
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
