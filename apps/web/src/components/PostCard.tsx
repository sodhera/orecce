"use client";

import { useState } from "react";
import {
    BsBookmark,
    BsBookmarkFill,
    BsHeart,
    BsHeartFill,
} from "react-icons/bs";

export interface Post {
    id: string;
    topic: string;
    title?: string;
    text_content: string;
    date: string;
    sourceUrl?: string;
}

export default function PostCard({ post }: { post: Post }) {
    const [liked, setLiked] = useState(false);
    const [saved, setSaved] = useState(false);

    return (
        <article className="post-card">
            <div className="post-body" style={{ flex: 1 }}>
                <div className="post-header">
                    <span
                        className="post-topic-badge"
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
                            className={`post-action post-like ${liked ? "active" : ""}`}
                            onClick={() => setLiked((current) => !current)}
                            aria-label={liked ? "Unlike post" : "Like post"}
                            title={liked ? "Unlike" : "Like"}
                        >
                            {liked ? (
                                <BsHeartFill aria-hidden="true" />
                            ) : (
                                <BsHeart aria-hidden="true" />
                            )}
                        </button>
                    </div>

                    <button
                        type="button"
                        className={`post-action post-save ${saved ? "active" : ""}`}
                        onClick={() => setSaved((current) => !current)}
                        aria-label={saved ? "Unsave post" : "Save post"}
                        title={saved ? "Unsave" : "Save"}
                    >
                        {saved ? (
                            <BsBookmarkFill aria-hidden="true" />
                        ) : (
                            <BsBookmark aria-hidden="true" />
                        )}
                    </button>
                </div>
            </div>
        </article>
    );
}
