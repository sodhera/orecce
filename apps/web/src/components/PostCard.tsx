"use client";

import {
    type CSSProperties,
    type MouseEvent,
    type PointerEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
} from "react";
import ReactMarkdown from "react-markdown";
import {
    BsBookmark,
    BsBookmarkFill,
    BsHeart,
    BsHeartFill,
    BsChevronLeft,
    BsChevronRight,
    BsBoxArrowUpRight,
    BsSend,
} from "react-icons/bs";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { isPaulGrahamAuthorName } from "@/lib/recces";

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
    sourceTitle?: string;
}

interface PostCardProps {
    post: Post;
    isLiked?: boolean;
    isSaved?: boolean;
    authorName?: string;
    authorAvatar?: string | null;
    onLikeToggle?: (liked: boolean) => void;
    onSaveToggle?: (saved: boolean) => void;
    onSaveToCollection?: (postId: string, collectionId: string) => void;
    collections?: Array<{ id: string; name: string }>;
    onSlideFlip?: (payload: {
        flipDelta: number;
        currentSlideIndex: number;
        slideCount: number;
    }) => void;
    onLastSlide?: (postId: string) => void;
    onInteraction?: (payload: {
        postId: string;
        topic: string;
        type: "like" | "save" | "flip" | "source";
    }) => void;
    variant?: "default" | "slide";
}

const DOUBLE_TAP_DELAY_MS = 300;
const DOUBLE_TAP_MAX_DISTANCE_PX = 28;

function normalizeAuthorLabel(authorName?: string): string {
    const trimmed = String(authorName ?? "").trim();
    if (!trimmed) {
        return "Unknown";
    }
    if (trimmed.toLowerCase() === "following author") {
        return "Following";
    }
    return trimmed;
}

function getSourceLabel(sourceUrl?: string): string | null {
    if (!sourceUrl) {
        return null;
    }

    try {
        const host = new URL(sourceUrl).hostname.replace(/^www\./i, "").trim();
        return host || "source";
    } catch {
        return "source";
    }
}

function buildSourceHref({
    sourceUrl,
    sourceTitle,
    postTitle,
    authorLabel,
}: {
    sourceUrl?: string;
    sourceTitle?: string;
    postTitle: string;
    authorLabel: string;
}): string {
    const trimmedUrl = String(sourceUrl ?? "").trim();
    if (trimmedUrl) {
        try {
            const normalized = /^https?:\/\//i.test(trimmedUrl)
                ? trimmedUrl
                : `https://${trimmedUrl}`;
            return new URL(normalized).toString();
        } catch {
            // Fall back to search URL below.
        }
    }

    const queryParts = [sourceTitle, postTitle, authorLabel]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
    const query = queryParts.join(" ");
    if (!query) {
        return "https://www.google.com";
    }
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function normalizeTopicLabel(topic: string): string {
    const trimmed = String(topic ?? "").trim();
    if (!trimmed) {
        return "Recommended";
    }
    if (trimmed.toLowerCase() === "following author") {
        return "Following";
    }
    return trimmed;
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
    isLiked: isLikedProp,
    isSaved: isSavedProp,
    authorName,
    authorAvatar,
    onLikeToggle,
    onSaveToggle,
    onSaveToCollection,
    collections,
    onSlideFlip,
    onLastSlide,
    onInteraction,
    variant = "default",
}: PostCardProps) {
    const [liked, setLiked] = useState(isLikedProp ?? false);
    const [saved, setSaved] = useState(isSavedProp ?? false);
    const [copied, setCopied] = useState(false);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const carouselRef = useRef<HTMLDivElement>(null);
    const lastSlideNotifiedRef = useRef(false);
    const lastTapAtRef = useRef(0);
    const lastTapPointRef = useRef<{ x: number; y: number } | null>(null);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showCollectionPicker, setShowCollectionPicker] = useState(false);
    const collectionPickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isSlideVariant = variant === "slide";
    const authorLabel = useMemo(() => normalizeAuthorLabel(authorName), [authorName]);
    const isPaulGrahamPost = useMemo(
        () => isPaulGrahamAuthorName(authorLabel),
        [authorLabel],
    );
    const topicLabel = useMemo(() => normalizeTopicLabel(post.topic), [post.topic]);
    const sourceLabel = useMemo(() => getSourceLabel(post.sourceUrl), [post.sourceUrl]);
    const captionSourceLabel = useMemo(() => {
        const explicitSourceTitle = String(post.sourceTitle ?? "").trim();
        if (explicitSourceTitle) {
            return explicitSourceTitle;
        }
        if (sourceLabel) {
            return sourceLabel;
        }
        return "Source";
    }, [post.sourceTitle, sourceLabel]);
    const sourceHref = useMemo(
        () => buildSourceHref({
            sourceUrl: post.sourceUrl,
            sourceTitle: post.sourceTitle,
            postTitle: post.title,
            authorLabel,
        }),
        [authorLabel, post.sourceTitle, post.sourceUrl, post.title],
    );

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

    // Clean up copied toast timer on unmount
    useEffect(() => {
        return () => {
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        };
    }, []);

    const handleShare = useCallback(() => {
        const shareUrl =
            typeof window !== "undefined"
                ? `${window.location.origin}/post/${post.id}`
                : `/post/${post.id}`;
        void navigator.clipboard.writeText(shareUrl).then(() => {
            setCopied(true);
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
            copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
        });
        trackAnalyticsEvent({
            eventName: "post_shared",
            surface: isSlideVariant ? "feed" : "post_detail",
            properties: {
                post_id: post.id,
                author_name: authorLabel,
                topic: post.topic,
                source_url: post.sourceUrl ?? null,
            },
        });
    }, [authorLabel, isSlideVariant, post.id, post.sourceUrl, post.topic]);

    const emitInteraction = useCallback((type: "like" | "save" | "flip" | "source") => {
        if (type === "source") {
            trackAnalyticsEvent({
                eventName: "post_source_opened",
                surface: isSlideVariant ? "feed" : "post_detail",
                properties: {
                    post_id: post.id,
                    author_name: authorLabel,
                    topic: post.topic,
                    source_url: sourceHref,
                    source_label: sourceLabel,
                },
            });
        }
        onInteraction?.({
            postId: post.id,
            topic: post.topic,
            type,
        });
    }, [authorLabel, isSlideVariant, onInteraction, post.id, post.topic, sourceHref, sourceLabel]);

    const flipSlide = useCallback((nextIndex: number) => {
        if (nextIndex < 0 || nextIndex >= slideCount || nextIndex === currentSlideIndex) {
            return;
        }
        setCurrentSlideIndex(nextIndex);
        onSlideFlip?.({
            flipDelta: 1,
            currentSlideIndex: nextIndex,
            slideCount,
        });
        trackAnalyticsEvent({
            eventName: "carousel_slide_advanced",
            surface: isSlideVariant ? "feed" : "post_detail",
            properties: {
                post_id: post.id,
                author_name: authorLabel,
                topic: post.topic,
                slide_index: nextIndex,
                slide_count: slideCount,
            },
        });
        emitInteraction("flip");

        // Fire onLastSlide once when user reaches the final slide
        if (nextIndex === slideCount - 1 && !lastSlideNotifiedRef.current) {
            lastSlideNotifiedRef.current = true;
            trackAnalyticsEvent({
                eventName: "carousel_completed",
                surface: isSlideVariant ? "feed" : "post_detail",
                properties: {
                    post_id: post.id,
                    author_name: authorLabel,
                    topic: post.topic,
                    slide_count: slideCount,
                },
            });
            onLastSlide?.(post.id);
        }
    }, [authorLabel, slideCount, currentSlideIndex, onSlideFlip, emitInteraction, onLastSlide, post.id, post.topic, isSlideVariant]);

    const scrollToSlide = useCallback((index: number) => {
        if (!carouselRef.current) return;
        const container = carouselRef.current;
        const width = container.clientWidth;
        container.scrollTo({
            left: index * width,
            behavior: "smooth"
        });
    }, [carouselRef]);

    const handleScroll = useCallback(() => {
        if (!carouselRef.current) return;
        const container = carouselRef.current;
        lastTapAtRef.current = 0;
        lastTapPointRef.current = null;
        const scrollPosition = container.scrollLeft;
        const slideWidth = container.clientWidth;
        // Calculate which slide constitutes the majority of the view
        const newIndex = Math.round(scrollPosition / slideWidth);

        if (newIndex !== currentSlideIndex && newIndex >= 0 && newIndex < slideCount) {
            flipSlide(newIndex);
        }
    }, [carouselRef, currentSlideIndex, slideCount, flipSlide]);

    const setLikeState = useCallback((nextLiked: boolean) => {
        setLiked((previousLiked) => {
            if (previousLiked === nextLiked) {
                return previousLiked;
            }

            onLikeToggle?.(nextLiked);
            emitInteraction("like");
            return nextLiked;
        });
    }, [emitInteraction, onLikeToggle]);

    const likeOnDoubleTap = useCallback(() => {
        setLikeState(true);
    }, [setLikeState]);

    const handleCarouselPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }

        const now = Date.now();
        const point = { x: event.clientX, y: event.clientY };
        const previousPoint = lastTapPointRef.current;

        const isWithinDelay = now - lastTapAtRef.current <= DOUBLE_TAP_DELAY_MS;
        const isWithinDistance = previousPoint
            ? Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) <= DOUBLE_TAP_MAX_DISTANCE_PX
            : true;

        if (isWithinDelay && isWithinDistance) {
            likeOnDoubleTap();
            lastTapAtRef.current = 0;
            lastTapPointRef.current = null;
            return;
        }

        lastTapAtRef.current = now;
        lastTapPointRef.current = point;
    }, [likeOnDoubleTap]);

    const handleCarouselDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        likeOnDoubleTap();
    }, [likeOnDoubleTap]);

    const likeButton = (
        <button
            type="button"
            className={`post-action post-like ${liked ? "active" : ""}`}
            onClick={() => {
                const next = !liked;
                setLikeState(next);
            }}
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

    const shareButton = (
        <button
            type="button"
            className="post-action post-share"
            onClick={handleShare}
            aria-label="Share post"
            title="Share"
        >
            <BsSend aria-hidden="true" />
        </button>
    );

    const saveButton = (
        <div
            className="save-btn-wrapper"
            onMouseEnter={() => {
                if (collectionPickerTimer.current) clearTimeout(collectionPickerTimer.current);
                if (collections && collections.length > 0) {
                    setShowCollectionPicker(true);
                }
            }}
            onMouseLeave={() => {
                collectionPickerTimer.current = setTimeout(() => {
                    setShowCollectionPicker(false);
                }, 200);
            }}
        >
            <button
                type="button"
                className={`post-action post-save ${saved ? "active" : ""}`}
                onClick={() => {
                    const next = !saved;
                    setSaved(next);
                    onSaveToggle?.(next);
                    emitInteraction("save");
                    setShowCollectionPicker(false);
                }}
                aria-label={saved ? "Unsave post" : "Save post"}
                title={saved ? "Unsave" : "Save"}
            >
                {saved ? (
                    <BsBookmarkFill aria-hidden="true" />
                ) : (
                    <BsBookmark aria-hidden="true" />
                )}
            </button>
            {showCollectionPicker && collections && collections.length > 0 && (
                <div className="save-collection-popup">
                    <div className="save-collection-popup-title">Save to collection</div>
                    {collections.map((col) => (
                        <button
                            key={col.id}
                            type="button"
                            className="save-collection-popup-item"
                            onClick={() => {
                                setSaved(true);
                                onSaveToCollection?.(post.id, col.id);
                                setShowCollectionPicker(false);
                            }}
                        >
                            {col.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );


    if (isSlideVariant) {
        return (
            <article className={`ig-post ${isPaulGrahamPost ? "ig-post--paul-graham" : ""}`}>
                {/* ── Author header (above the square) ── */}
                <div className="ig-post-header">
                    <div className="ig-post-author">
                        <div className="ig-post-author-info">
                            <span className="ig-post-author-name">{authorLabel}</span>
                            <span className="ig-post-author-dot">·</span>
                            <span className="ig-post-topic">{topicLabel}</span>
                        </div>
                    </div>
                    {post.sourceUrl && (
                        <a
                            href={post.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ig-post-source-btn"
                            onClick={() => emitInteraction("source")}
                            title="Go to source"
                            aria-label="Go to source"
                        >
                            <BsBoxArrowUpRight size={14} />
                        </a>
                    )}
                </div>

                {/* ── Square content card ── */}
                <div
                    className={`ig-post-square ${isPaulGrahamPost ? "ig-post-square--paul-graham" : ""}`}
                >
                    {/* Slide counter badge — top right */}
                    {canSlide && (
                        <span className="ig-post-counter">
                            {currentSlideIndex + 1}/{slideCount}
                        </span>
                    )}

                    {/* Scrollable Carousel Container */}
                    <div
                        className="ig-post-carousel"
                        ref={carouselRef}
                        onScroll={handleScroll}
                        onPointerUp={handleCarouselPointerUp}
                        onDoubleClick={handleCarouselDoubleClick}
                    >
                        {post.slides.map((slide, i) => (
                            <div key={`slide-${post.id}-${i}`} className="ig-post-slide">
                                <div className="ig-post-content">
                                    <div className="ig-post-text post-markdown">
                                        <ReactMarkdown>{slide.text}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right-edge chevron */}
                    {canSlide && currentSlideIndex < slideCount - 1 && (
                        <button
                            type="button"
                            className="ig-post-chevron ig-post-chevron-right"
                            onClick={() => scrollToSlide(currentSlideIndex + 1)}
                            aria-label="Next slide"
                        >
                            <BsChevronRight aria-hidden="true" />
                        </button>
                    )}

                    {/* Left-edge chevron */}
                    {canSlide && currentSlideIndex > 0 && (
                        <button
                            type="button"
                            className="ig-post-chevron ig-post-chevron-left"
                            onClick={() => scrollToSlide(currentSlideIndex - 1)}
                            aria-label="Previous slide"
                        >
                            <BsChevronLeft aria-hidden="true" />
                        </button>
                    )}

                    {/* Dot indicators at bottom center */}
                    {canSlide && (
                        <div className="ig-post-dots">
                            {post.slides.map((_, i) => (
                                <span
                                    key={`dot-${post.id}-${i}`}
                                    className={`ig-post-dot ${i === currentSlideIndex ? "active" : ""}`}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Actions row (below the square) ── */}
                <div className="ig-post-actions">
                    <div className="ig-post-actions-left">
                        {likeButton}
                    </div>
                    <div className="ig-post-actions-right">
                        {shareButton}
                        {saveButton}
                    </div>
                </div>

                {/* ── Caption (theme) below actions ── */}
                {post.title && (
                    <div className="ig-post-caption">
                        <span className="ig-post-caption-author">{authorLabel}</span>
                        {" "}
                        <span className="ig-post-caption-title">{post.title}</span>
                    </div>
                )}

                {/* Share toast */}
                {copied && (
                    <div className="share-toast">Link copied!</div>
                )}
            </article>
        );
    }

    return (
        <article className={`post-card ${isPaulGrahamPost ? "post-card--paul-graham" : ""}`}>
            <div className="post-body">
                <div className="post-header">
                    <span className="post-topic-badge">{post.topic}</span>
                    <span className="post-dot">·</span>
                    <span className="post-time">{post.date}</span>
                    {post.sourceUrl && (
                        <a
                            href={post.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="post-header-source-btn"
                            onClick={() => emitInteraction("source")}
                            title="Go to source"
                            aria-label="Go to source"
                        >
                            <BsBoxArrowUpRight size={14} />
                        </a>
                    )}
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
                    <div className="post-actions-right-group">
                        {saveButton}
                        {shareButton}
                    </div>
                </div>
            </div>
        </article>
    );
}
