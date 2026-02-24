"use client";

import { type CSSProperties, useMemo, useState } from "react";
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
    onSaveToggle?: (saved: boolean) => void;
    onSlideFlip?: (payload: {
        flipDelta: number;
        currentSlideIndex: number;
        slideCount: number;
    }) => void;
    onInteraction?: (payload: {
        postId: string;
        topic: string;
        type: "like" | "save" | "flip" | "source";
    }) => void;
    variant?: "default" | "slide";
}

function hashSeed(seed: string): number {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) % 360;
    }
    return hash;
}

function buildSlidePalette(seed: string): CSSProperties {
    const hueBase = hashSeed(seed);
    const hueAccent = (hueBase + 34) % 360;
    const hueGlow = (hueBase + 78) % 360;
    return {
        "--slide-tone-a": `hsl(${hueBase} 76% 52%)`,
        "--slide-tone-b": `hsl(${hueAccent} 72% 38%)`,
        "--slide-tone-glow": `hsl(${hueGlow} 70% 58%)`,
    } as CSSProperties;
}

export default function PostCard({
    post,
    onLikeToggle,
    onSaveToggle,
    onSlideFlip,
    onInteraction,
    variant = "default",
}: PostCardProps) {
    const [liked, setLiked] = useState(false);
    const [saved, setSaved] = useState(false);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const isSlideVariant = variant === "slide";

    const slideCount = Math.max(1, post.slides.length);
    const currentSlide = useMemo(
        () => post.slides[currentSlideIndex] ?? post.slides[0],
        [currentSlideIndex, post.slides],
    );
    const slideStyle = useMemo(
        () => (isSlideVariant ? buildSlidePalette(`${post.id}:${post.topic}`) : undefined),
        [isSlideVariant, post.id, post.topic],
    );
    const canSlide = post.post_type === "carousel" && slideCount > 1;

    const emitInteraction = (type: "like" | "save" | "flip" | "source") => {
        onInteraction?.({
            postId: post.id,
            topic: post.topic,
            type,
        });
    };

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
        emitInteraction("flip");
    };

    const likeButton = (
        <button
            type="button"
            className={`post-action post-like ${liked ? "active" : ""}`}
            onClick={() =>
                setLiked((current) => {
                    const next = !current;
                    onLikeToggle?.(next);
                    emitInteraction("like");
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
    );

    const saveButton = (
        <button
            type="button"
            className={`post-action post-save ${saved ? "active" : ""}`}
            onClick={() =>
                setSaved((current) => {
                    const next = !current;
                    onSaveToggle?.(next);
                    emitInteraction("save");
                    return next;
                })
            }
            aria-label={saved ? "Unsave post" : "Save post"}
            title={saved ? "Unsave" : "Save"}
        >
            {saved ? (
                <BsBookmarkFill aria-hidden="true" />
            ) : (
                <BsBookmark aria-hidden="true" />
            )}
        </button>
    );

    if (isSlideVariant) {
        return (
            <article className="post-card post-card-slide" style={slideStyle}>
                <div className="post-slide-sheen" aria-hidden="true" />
                <div className="post-slide-header">
                    <span className="post-topic-badge post-topic-badge-slide">{post.topic}</span>
                    <span className="post-time post-time-slide">{post.date}</span>
                </div>
                <div className="post-slide-bottom">
                    <div className="post-slide-copy">
                        {post.title && <div className="post-title post-title-slide">{post.title}</div>}
                        <div className="post-content post-markdown post-slide-content">
                            <ReactMarkdown>{currentSlide?.text ?? ""}</ReactMarkdown>
                        </div>

                        {canSlide && (
                            <div className="post-carousel-controls post-carousel-controls-slide">
                                <button
                                    type="button"
                                    className="post-carousel-button post-carousel-button-slide"
                                    onClick={() => flipSlide(currentSlideIndex - 1)}
                                    disabled={currentSlideIndex <= 0}
                                    aria-label="Previous slide"
                                >
                                    <BsChevronLeft aria-hidden="true" />
                                </button>
                                <span className="post-carousel-progress post-carousel-progress-slide">
                                    {currentSlideIndex + 1} / {slideCount}
                                </span>
                                <button
                                    type="button"
                                    className="post-carousel-button post-carousel-button-slide"
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
                                className="post-source-link post-source-link-slide"
                                href={post.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => emitInteraction("source")}
                            >
                                Read original source
                            </a>
                        )}
                    </div>

                    <div className="post-slide-rail">
                        {likeButton}
                        {saveButton}
                    </div>
                </div>
            </article>
        );
    }

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
                        onClick={() => emitInteraction("source")}
                    >
                        Read original source
                    </a>
                )}

                <div className="post-actions">
                    <div className="post-vote-group">{likeButton}</div>
                    {saveButton}
                </div>
            </div>
        </article>
    );
}
