"use client";

import { useEffect, useState } from "react";
import PostCard, { type Post } from "./PostCard";
import { listPosts, type ApiPost } from "@/lib/api";

const FEED_MODES = ["BIOGRAPHY", "TRIVIA", "NICHE"] as const;

function apiPostToPost(post: ApiPost): Post {
    return {
        id: post.id,
        post_type: "single",
        topic: post.mode,
        title: post.title,
        slides: [{ slide_number: 1, type: "standalone" as const, text: post.body }],
        createdAtMs: post.createdAtMs,
        date: new Date(post.createdAtMs).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        }),
    };
}

export default function SavedFeed() {
    const [savedPosts, setSavedPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const settled = await Promise.allSettled(
                FEED_MODES.map((mode) => listPosts(mode, "Steve Jobs", 5)),
            );
            const deduped = new Map<string, ApiPost>();
            settled
                .filter(
                    (
                        result,
                    ): result is PromiseFulfilledResult<{
                        items: ApiPost[];
                        nextCursor: string | null;
                    }> => result.status === "fulfilled",
                )
                .flatMap((result) => result.value.items)
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
                .forEach((post) => {
                    if (!deduped.has(post.id)) {
                        deduped.set(post.id, post);
                    }
                });

            const posts = Array.from(deduped.values()).slice(0, 8).map(apiPostToPost);
            if (!cancelled) {
                setSavedPosts(posts);
            }
        })()
            .catch(() => {
                if (!cancelled) {
                    setSavedPosts([]);
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
