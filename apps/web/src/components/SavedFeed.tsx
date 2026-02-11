"use client";

import PostCard, { type Post } from "./PostCard";
import { MOCK_POSTS } from "@/lib/mockPosts";

const SAVED_POSTS: Post[] = MOCK_POSTS.slice(0, 3).map((post, index) => ({
    ...post,
    id: `saved-${index + 1}`,
}));

export default function SavedFeed() {
    return (
        <main className="feed">
            <div className="feed-header">
                <div
                    className="feed-header-top"
                    style={{
                        paddingBottom: 12,
                    }}
                >
                    <h1>Saved</h1>
                </div>
            </div>

            <div className="feed-posts-container">
                {SAVED_POSTS.length === 0 ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        You have no saved posts yet.
                    </div>
                ) : (
                    SAVED_POSTS.map((post) => (
                        <PostCard key={post.id} post={post} />
                    ))
                )}
            </div>
        </main>
    );
}
