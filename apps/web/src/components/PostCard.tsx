"use client";

export interface Post {
    id: string;
    topic: string;
    title?: string;
    text_content: string;
    date: string;
}

export default function PostCard({ post }: { post: Post }) {
    const topicColors: Record<string, string> = {
        BIOGRAPHY: "#7856ff",
        TRIVIA: "#1d9bf0",
        NICHE: "#ff6b35",
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
            </div>
        </article>
    );
}
