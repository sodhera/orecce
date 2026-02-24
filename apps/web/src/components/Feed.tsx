"use client";

import { useEffect, useMemo, useRef } from "react";
import PostCard from "./PostCard";
import { useFeed } from "@/hooks/useFeed";
import { useAuthors } from "@/hooks/useAuthors";

interface FeedProps {
    mode: string;
    profile: string;
    onModeChange?: (mode: string) => void;
}

export default function Feed({ mode, onModeChange }: FeedProps) {
    const { authors, followedIds } = useAuthors();
    const followedAuthors = useMemo(
        () => authors.filter((a) => followedIds.has(a.id)),
        [authors, followedIds]
    );

    const feed = useFeed(mode === "ALL" ? null : mode);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

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

            <div className="feed-posts-container feed-posts-slides">
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
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        {feed.error
                            ? `Error: ${feed.error}`
                            : "No posts yet. Follow some authors to see content here."}
                    </div>
                ) : (
                    feed.items.map((item) => (
                        <div key={item.post.id} className="feed-slide-shell">
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
