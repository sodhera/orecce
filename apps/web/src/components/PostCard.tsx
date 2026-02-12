"use client";

import { useState } from "react";

export interface Post {
    id: string;
    topic: string;
    title?: string;
    text_content: string;
    date: string;
    sourceUrl?: string;
}

export default function PostCard({ post }: { post: Post }) {
    const [vote, setVote] = useState<"up" | "down" | null>(null);
    const [saved, setSaved] = useState(false);

    const topicColors: Record<string, string> = {
        BIOGRAPHY: "#7856ff",
        TRIVIA: "#1d9bf0",
        NICHE: "#ff6b35",
        NEWS: "#17bf63",
        AI: "#7856ff",
        Frontend: "#1d9bf0",
        Startups: "#ff6b35",
        Design: "#f91880",
        Backend: "#00ba7c",
        DevOps: "#ffcc00",
        "Open Source": "#e44d26",
        Career: "#3ecf8e",
    };
    const badgeColor = topicColors[post.topic] || "#1d9bf0";

    const toggleVote = (type: "up" | "down") => {
        setVote((current) => (current === type ? null : type));
    };

    return (
        <article className="post-card">
            <div className="post-body" style={{ flex: 1 }}>
                <div className="post-header">
                    <span
                        className="post-topic-badge"
                        style={{
                            background: badgeColor,
                            color: "#fff",
                            padding: "2px 10px",
                            borderRadius: 9999,
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: "0.3px",
                        }}
                    >
                        {post.topic}
                    </span>
                    <span className="post-dot">·</span>
                    <span className="post-time">{post.date}</span>
                </div>
                {post.title && (
                    <div
                        className="post-title"
                        style={{
                            fontWeight: 700,
                            fontSize: 16,
                            marginTop: 6,
                            color: "#e7e9ea",
                        }}
                    >
                        {post.title}
                    </div>
                )}
                <div className="post-content">{post.text_content}</div>
                {post.sourceUrl && (
                    <a
                        className="post-source-link"
                        href={post.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Read original source
                    </a>
                )}

                <div className="post-actions">
                    <div className="post-vote-group">
                        <button
                            type="button"
                            className={`post-action post-vote-up ${vote === "up" ? "active" : ""}`}
                            onClick={() => toggleVote("up")}
                            aria-label="Upvote post"
                            title="Upvote"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 4l7 8h-4v8H9v-8H5l7-8z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className={`post-action post-vote-down ${vote === "down" ? "active" : ""}`}
                            onClick={() => toggleVote("down")}
                            aria-label="Downvote post"
                            title="Downvote"
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M12 20l-7-8h4V4h6v8h4l-7 8z" />
                            </svg>
                        </button>
                    </div>

                    <button
                        type="button"
                        className={`post-action post-save ${saved ? "active" : ""}`}
                        onClick={() => setSaved((current) => !current)}
                        aria-label={saved ? "Unsave post" : "Save post"}
                        title={saved ? "Unsave" : "Save"}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 3h12a2 2 0 0 1 2 2v16l-8-5.6L4 21V5a2 2 0 0 1 2-2zm0 2v12.15l6-4.2 6 4.2V5H6z" />
                        </svg>
                    </button>
                </div>
            </div>
        </article>
    );
}
