"use client";

import { useState, useRef, useCallback } from "react";
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
    date: string;
    sourceUrl?: string;
}

/* ── slide colour palette (cycles) ── */
const SLIDE_COLORS = [
    { bg: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)", fg: "#e7e9ea" },
    { bg: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", fg: "#e7e9ea" },
    { bg: "linear-gradient(135deg, #141e30 0%, #243b55 100%)", fg: "#e7e9ea" },
    { bg: "linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #415a77 100%)", fg: "#e7e9ea" },
    { bg: "linear-gradient(135deg, #1c1c3c 0%, #2d2d5e 50%, #3d3d7e 100%)", fg: "#e7e9ea" },
];

function slideColor(index: number) {
    return SLIDE_COLORS[index % SLIDE_COLORS.length];
}

export default function PostCard({ post }: { post: Post }) {
    const [liked, setLiked] = useState(false);
    const [saved, setSaved] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const touchStartX = useRef(0);
    const touchDelta = useRef(0);
    const trackRef = useRef<HTMLDivElement>(null);

    const total = post.slides.length;
    const hasMultiple = total > 1;

    const goto = useCallback(
        (idx: number) => {
            setCurrentSlide(Math.max(0, Math.min(total - 1, idx)));
        },
        [total],
    );

    /* ── touch / swipe handlers ── */
    const onTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchDelta.current = 0;
    };

    const onTouchMove = (e: React.TouchEvent) => {
        touchDelta.current = e.touches[0].clientX - touchStartX.current;
    };

    const onTouchEnd = () => {
        const threshold = 50;
        if (touchDelta.current < -threshold) goto(currentSlide + 1);
        else if (touchDelta.current > threshold) goto(currentSlide - 1);
        touchDelta.current = 0;
    };

    return (
        <article className="post-card">
            {/* ── Header ── */}
            <div className="post-card-header">
                <span className="post-topic-badge">{post.topic}</span>
                {post.date && (
                    <>
                        <span className="post-dot">·</span>
                        <span className="post-time">{post.date}</span>
                    </>
                )}
            </div>

            {post.title && <div className="post-card-title">{post.title}</div>}

            {/* ── Carousel viewport ── */}
            <div
                className="carousel-viewport"
                onTouchStart={hasMultiple ? onTouchStart : undefined}
                onTouchMove={hasMultiple ? onTouchMove : undefined}
                onTouchEnd={hasMultiple ? onTouchEnd : undefined}
            >
                {/* slide counter */}
                {hasMultiple && (
                    <div className="carousel-counter">
                        {currentSlide + 1} / {total}
                    </div>
                )}

                {/* prev / next arrows */}
                {hasMultiple && currentSlide > 0 && (
                    <button
                        type="button"
                        className="carousel-arrow carousel-arrow-left"
                        onClick={() => goto(currentSlide - 1)}
                        aria-label="Previous slide"
                    >
                        <BsChevronLeft />
                    </button>
                )}
                {hasMultiple && currentSlide < total - 1 && (
                    <button
                        type="button"
                        className="carousel-arrow carousel-arrow-right"
                        onClick={() => goto(currentSlide + 1)}
                        aria-label="Next slide"
                    >
                        <BsChevronRight />
                    </button>
                )}

                {/* track */}
                <div
                    ref={trackRef}
                    className="carousel-track"
                    style={{
                        transform: `translateX(-${currentSlide * 100}%)`,
                    }}
                >
                    {post.slides.map((slide, idx) => {
                        const color = slideColor(idx);
                        return (
                            <div
                                key={slide.slide_number}
                                className="carousel-slide"
                                style={{
                                    background: color.bg,
                                    color: color.fg,
                                }}
                            >
                                <div className="carousel-slide-inner">
                                    <div className="carousel-slide-text post-markdown">
                                        <ReactMarkdown>{slide.text}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Dots ── */}
            {hasMultiple && (
                <div className="carousel-dots">
                    {post.slides.map((_, idx) => (
                        <button
                            key={idx}
                            type="button"
                            className={`carousel-dot ${idx === currentSlide ? "active" : ""}`}
                            onClick={() => goto(idx)}
                            aria-label={`Go to slide ${idx + 1}`}
                        />
                    ))}
                </div>
            )}

            {/* ── Source link ── */}
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

            {/* ── Actions ── */}
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
        </article>
    );
}
