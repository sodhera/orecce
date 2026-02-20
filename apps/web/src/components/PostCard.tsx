"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
    BsBookmark,
    BsBookmarkFill,
    BsHeart,
    BsHeartFill,
    BsChevronDown,
    BsChevronUp,
} from "react-icons/bs";

export interface Slide {
    slide_number: number;
    type: "hook" | "body" | "closer" | "standalone";
    text: string;
}

export interface Post {
    id: string;
    post_type: "carousel" | "single";
    topic: string;
    title: string;
    slides: Slide[];
    date: string;
    sourceUrl?: string;
}

export default function PostCard({ post }: { post: Post }) {
    const [liked, setLiked] = useState(false);
    const [saved, setSaved] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const threadRef = useRef<HTMLDivElement>(null);
    const [threadHeight, setThreadHeight] = useState(0);

    const hasThread = post.slides.length > 1;

    useEffect(() => {
        if (threadRef.current) {
            setThreadHeight(threadRef.current.scrollHeight);
        }
    }, [expanded, post.slides]);

    return (
        <article className="post-card">
            <div className="post-body">
                <div className="post-header">
                    <span className="post-topic-badge">{post.topic}</span>
                    <span className="post-dot">·</span>
                    <span className="post-time">{post.date}</span>
                </div>

                {post.title && (
                    <div className="post-title">{post.title}</div>
                )}

                {/* First slide — always visible */}
                <div className="post-content post-markdown">
                    <ReactMarkdown>{post.slides[0]?.text ?? ""}</ReactMarkdown>
                </div>

                {/* Thread indicator */}
                {hasThread && !expanded && (
                    <button
                        type="button"
                        className="post-thread-indicator"
                        onClick={() => setExpanded(true)}
                    >
                        <BsChevronDown aria-hidden="true" />
                        Show thread · {post.slides.length - 1} more
                    </button>
                )}

                {/* Expanded thread slides */}
                {hasThread && (
                    <div
                        className={`post-thread-slides ${expanded ? "open" : ""}`}
                        style={{
                            maxHeight: expanded ? threadHeight : 0,
                        }}
                    >
                        <div ref={threadRef}>
                            {post.slides.slice(1).map((slide) => (
                                <div
                                    key={slide.slide_number}
                                    className="post-thread-slide"
                                >
                                    <div className="post-thread-line" />
                                    <div className="post-thread-slide-content post-markdown">
                                        <ReactMarkdown>
                                            {slide.text}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ))}

                            <button
                                type="button"
                                className="post-thread-collapse"
                                onClick={() => setExpanded(false)}
                            >
                                <BsChevronUp aria-hidden="true" />
                                Hide thread
                            </button>
                        </div>
                    </div>
                )}

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
                            onClick={() => setLiked((c) => !c)}
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
                        onClick={() => setSaved((c) => !c)}
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
