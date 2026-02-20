"use client";

import { useEffect, useState } from "react";
import PostCard, { type Post } from "./PostCard";
import { fetchPublicPosts } from "@/lib/firestorePosts";

export default function SavedFeed() {
    const [savedPosts, setSavedPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchPublicPosts(3)
            .then((posts) => {
                if (!cancelled) {
                    setSavedPosts(
                        posts.map((post, index) => ({
                            ...post,
                            id: `saved-${index + 1}`,
                        })),
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

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
                {loading ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        Loading saved posts…
                    </div>
                ) : savedPosts.length === 0 ? (
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
                    savedPosts.map((post) => (
                        <PostCard key={post.id} post={post} />
                    ))
                )}
            </div>
        </main>
    );
}
