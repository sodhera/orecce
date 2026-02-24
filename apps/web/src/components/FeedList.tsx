"use client";

import PostCard from "@/components/PostCard";
import { useFeed, type FeedMode } from "@/hooks/useFeed";

interface FeedListProps {
    title: string;
    feedMode: FeedMode;
}

export default function FeedList({ title, feedMode }: FeedListProps) {
    const {
        items,
        loading,
        loadingMore,
        error,
        hasMore,
        loadMore,
        toggleLike,
        toggleSave,
        markAsRead,
    } = useFeed(null, feedMode);

    return (
        <main className="feed">
            <div className="feed-header">
                <div
                    className="feed-header-top"
                    style={{
                        paddingBottom: 12,
                    }}
                >
                    <h1>{title}</h1>
                </div>
            </div>

            <div className="feed-posts-container">
                {error && (
                    <div style={{ padding: 20, color: "var(--danger)", textAlign: "center" }}>
                        {error}
                        <div style={{ fontSize: 13, marginTop: 4 }}>
                            (Note: Make sure `supabase_feed_additions.sql` has been executed on the backend to create the `{feedMode}` RPC)
                        </div>
                    </div>
                )}

                {loading ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        Loading {title.toLowerCase()} posts…
                    </div>
                ) : items.length === 0 && !error ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        You have no {title.toLowerCase()} posts yet.
                    </div>
                ) : (
                    <div className="feed-posts-slides">
                        {items.map(({ post, isLiked, isSaved, authorName, authorAvatar }) => (
                            <div key={post.id} className="feed-slide-shell">
                                <PostCard
                                    post={post}
                                    isLiked={isLiked}
                                    isSaved={isSaved}
                                    authorName={authorName}
                                    authorAvatar={authorAvatar}
                                    onLikeToggle={() => toggleLike(post.id)}
                                    onSaveToggle={() => toggleSave(post.id)}
                                    // Let marking as read happen naturally since it's a feed context
                                    onInteraction={({ type }) => {
                                        if (type === "flip" || type === "source") {
                                            markAsRead(post.id);
                                        }
                                    }}
                                    variant={post.post_type === "carousel" ? "slide" : "default"}
                                />
                            </div>
                        ))}

                        {hasMore && items.length > 0 && !error && (
                            <button
                                type="button"
                                className="feed-recces-load-more"
                                onClick={loadMore}
                                disabled={loadingMore}
                                style={{
                                    width: "100%",
                                    background: "transparent",
                                    border: "none",
                                    cursor: loadingMore ? "not-allowed" : "pointer"
                                }}
                            >
                                {loadingMore ? "Loading more..." : "Load more"}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
