"use client";

export interface Post {
    id: number;
    topic: string;
    text_content: string;
    date: string;
}

export default function PostCard({ post }: { post: Post }) {
    // Pick a color based on topic for the badge
    const topicColors: Record<string, string> = {
        "AI": "#7856ff",
        "Frontend": "#1d9bf0",
        "Startups": "#ff6b35",
        "Design": "#f91880",
        "Backend": "#00ba7c",
        "DevOps": "#ffcc00",
        "Open Source": "#e44d26",
        "Career": "#3ecf8e",
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
                <div className="post-content">{post.text_content}</div>
            </div>
        </article>
    );
}
