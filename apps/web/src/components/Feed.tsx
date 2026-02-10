"use client";

import { useEffect, useState, useCallback } from "react";
import PostCard, { type Post } from "./PostCard";
import { generatePost, listPosts, type ApiPost } from "@/lib/api";

// ── Config ──────────────────────────────────────────────────────
const USER_ID = "web-user-1";

// ── Helpers ─────────────────────────────────────────────────────

function apiPostToPost(p: ApiPost): Post {
    return {
        id: p.id,
        topic: p.mode,
        title: p.title,
        text_content: p.body,
        date: new Date(p.createdAtMs).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        }),
    };
}

// ── Component ───────────────────────────────────────────────────

interface FeedProps {
    mode: string;
    profile: string;
}

export default function Feed({ mode, profile }: FeedProps) {
    const [activeTab, setActiveTab] = useState<"for-you" | "following">(
        "for-you"
    );
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Re-fetch posts when mode or profile changes
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                setPosts([]);
                const result = await listPosts(USER_ID, mode, profile, 20);
                if (!cancelled) {
                    setPosts(result.items.map(apiPostToPost));
                }
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mode, profile]);

    // Generate a new post
    const handleGenerate = useCallback(async () => {
        try {
            setGenerating(true);
            setError(null);
            const newPost = await generatePost(USER_ID, mode, profile, "short");
            setPosts((prev) => [apiPostToPost(newPost), ...prev]);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setGenerating(false);
        }
    }, [mode, profile]);

    return (
        <main className="feed">
            <div className="feed-header">
                <div className="feed-header-top">
                    <h1>Home</h1>
                </div>
                <div className="feed-tabs">
                    <button
                        className={`feed-tab ${activeTab === "for-you" ? "active" : ""}`}
                        onClick={() => setActiveTab("for-you")}
                    >
                        For you
                    </button>
                    <button
                        className={`feed-tab ${activeTab === "following" ? "active" : ""}`}
                        onClick={() => setActiveTab("following")}
                    >
                        Following
                    </button>
                </div>
            </div>

            {/* Generate button */}
            <div
                style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                }}
            >
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    style={{
                        background: generating ? "#1a5c8a" : "#1d9bf0",
                        color: "#fff",
                        border: "none",
                        borderRadius: 9999,
                        padding: "8px 20px",
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: generating ? "not-allowed" : "pointer",
                        opacity: generating ? 0.7 : 1,
                        transition: "all 0.2s",
                    }}
                >
                    {generating ? "Generating…" : "✨ Generate new post"}
                </button>
                {error && (
                    <span style={{ color: "#f4212e", fontSize: 13 }}>{error}</span>
                )}
            </div>

            {/* Posts */}
            {loading ? (
                <div
                    style={{
                        padding: 40,
                        textAlign: "center",
                        color: "var(--text-secondary)",
                    }}
                >
                    Loading posts…
                </div>
            ) : posts.length === 0 ? (
                <div
                    style={{
                        padding: 40,
                        textAlign: "center",
                        color: "var(--text-secondary)",
                    }}
                >
                    No posts yet. Click &quot;Generate new post&quot; to create one!
                </div>
            ) : (
                posts.map((post) => <PostCard key={post.id} post={post} />)
            )}
        </main>
    );
}
