"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
    BsBookmark,
    BsBookmarkFill,
    BsHeart,
    BsHeartFill,
    BsChevronLeft,
    BsChevronRight,
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
    createdAtMs?: number;
    date: string;
    sourceUrl?: string;
}

interface PostCardProps {
    post: Post;
    onLikeToggle?: (liked: boolean) => void;
    onSlideFlip?: (payload: {
        flipDelta: number;
        currentSlideIndex: number;
        slideCount: number;
    }) => void;
}

export default function PostCard({
    post,
    onLikeToggle,
    onSlideFlip,
}: PostCardProps) {
    const [liked, setLiked] = useState(false);
    const [saved, setSaved] = useState(false);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

    const slideCount = Math.max(1, post.slides.length);
    const currentSlide = useMemo(
        () => post.slides[currentSlideIndex] ?? post.slides[0],
        [currentSlideIndex, post.slides],
    );
    const canSlide = post.post_type === "carousel" && slideCount > 1;

    const flipSlide = (nextIndex: number) => {
        if (nextIndex < 0 || nextIndex >= slideCount || nextIndex === currentSlideIndex) {
            return;
        }
        setCurrentSlideIndex(nextIndex);
        onSlideFlip?.({
            flipDelta: 1,
            currentSlideIndex: nextIndex,
            slideCount,
        });
    };

    return (
        <article className="post-card">
            <div className="post-body">
                <div className="post-header">
                    <span className="post-topic-badge">{post.topic}</span>
                    <span className="post-dot">·</span>
                    <span className="post-time">{post.date}</span>
                </div>

                {post.title && <div className="post-title">{post.title}</div>}

                <div className="post-content post-markdown">
                    <ReactMarkdown>{currentSlide?.text ?? ""}</ReactMarkdown>
                </div>

                {canSlide && (
                    <div className="post-carousel-controls">
                        <button
                            type="button"
                            className="post-carousel-button"
                            onClick={() => flipSlide(currentSlideIndex - 1)}
                            disabled={currentSlideIndex <= 0}
                            aria-label="Previous slide"
                        >
                            <BsChevronLeft aria-hidden="true" />
                        </button>
                        <span className="post-carousel-progress">
                            Slide {currentSlideIndex + 1} / {slideCount}
                        </span>
                        <button
                            type="button"
                            className="post-carousel-button"
                            onClick={() => flipSlide(currentSlideIndex + 1)}
                            disabled={currentSlideIndex >= slideCount - 1}
                            aria-label="Next slide"
                        >
                            <BsChevronRight aria-hidden="true" />
                        </button>
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
                            onClick={() =>
                                setLiked((current) => {
                                    const next = !current;
                                    onLikeToggle?.(next);
                                    return next;
                                })
                            }
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
