"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import PostCard from "./PostCard";
import { useFeed } from "@/hooks/useFeed";
import { useAuthors } from "@/hooks/useAuthors";

interface FeedProps {
    mode: string;
    profile: string;
    onModeChange?: (mode: string) => void;
}

const RECOMMENDED_COUNT = 3;
const SEEN_VISIBILITY_RATIO = 0.7;
const SEEN_IMPRESSION_MS = 2500;

export default function Feed({ mode, onModeChange }: FeedProps) {
    const { authors, followedIds, toggleFollow } = useAuthors();
    const followedAuthors = useMemo(
        () => authors.filter((a) => followedIds.has(a.id)),
        [authors, followedIds]
    );

    // Pick a few unfollowed authors to recommend
    const recommendedAuthors = useMemo(
        () => authors.filter((a) => !followedIds.has(a.id)).slice(0, RECOMMENDED_COUNT),
        [authors, followedIds]
    );

    const feed = useFeed(mode === "ALL" ? null : mode);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const seenInSessionRef = useRef(new Set<string>());
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
                    if (!postId || seenInSessionRef.current.has(postId)) {
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
                {followedAuthors.map((author) => (
                    <button
                        key={author.id}
                        className={`feed-category-pill ${mode === author.id ? "active" : ""}`}
                        onClick={() => onModeChange?.(author.id)}
                    >
                        {author.name}
                    </button>
                ))}
            </div>

            <div className="feed-posts-container feed-posts-slides feed-posts-slides-center">
                {feed.loading ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        Loading posts…
                    </div>
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

                            {recommendedAuthors.length > 0 && (
                                <div className="feed-recommended-authors">
                                    {recommendedAuthors.map((author) => (
                                        <div key={author.id} className="feed-rec-author-card">
                                            <div className="feed-rec-author-avatar">
                                                {author.name?.charAt(0).toUpperCase() || "?"}
                                            </div>
                                            <div className="feed-rec-author-info">
                                                <span className="feed-rec-author-name">{author.name}</span>
                                                {author.bio && (
                                                    <span className="feed-rec-author-bio">{author.bio}</span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className="feed-rec-follow-btn"
                                                onClick={() => toggleFollow(author.id)}
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
                                onLikeToggle={() => feed.toggleLike(item.post.id)}
                                onSaveToggle={() => feed.toggleSave(item.post.id)}
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
                        onClick={() => void feed.loadMore()}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                void feed.loadMore();
                            }
                        }}
                    >
                        {feed.loadingMore
                            ? "Loading more posts..."
                            : "Scroll to load more posts..."}
                    </div>
                )}
            </div>
        </main>
    );
}
