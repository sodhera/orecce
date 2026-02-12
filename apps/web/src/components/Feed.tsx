"use client";

import { useEffect, useRef, useState } from "react";
import PostCard, { type Post } from "./PostCard";
import {
    getNewsArticle,
    listNewsArticles,
    listNewsSources,
    listPosts,
    type ApiPost,
    type NewsArticleDetail,
    type NewsArticleListItem,
    type NewsSource,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MOCK_POSTS } from "@/lib/mockPosts";

// ── Config ──────────────────────────────────────────────────────
const VISIBLE_GUEST_POSTS = 3; // posts shown before the gate

const CATEGORIES = [
    { value: "ALL", label: "All" },
    { value: "BIOGRAPHY", label: "Biographies" },
    { value: "TRIVIA", label: "Trivia" },
    { value: "NICHE", label: "Niche" },
    { value: "NEWS", label: "News" },
];

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

function formatDateFromMs(value?: number): string {
    if (!value) {
        return "Unknown date";
    }
    return new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

type NewsArticleWithText = NewsArticleListItem & { fullText?: string };

function newsArticleToPost(article: NewsArticleWithText): Post {
    return {
        id: article.id,
        topic: article.sourceName || "NEWS",
        title: article.title,
        text_content:
            article.fullText?.trim() ||
            article.summary ||
            "No article text available.",
        date: formatDateFromMs(article.publishedAtMs),
        sourceUrl: article.canonicalUrl || undefined,
    };
}

// ── Component ───────────────────────────────────────────────────

interface FeedProps {
    mode: string;
    profile: string;
    onModeChange?: (mode: string) => void;
}

export default function Feed({ mode, profile, onModeChange }: FeedProps) {
    const { isAuthenticated, setShowAuthModal } = useAuth();

    const [activeTab, setActiveTab] = useState<"for-you" | "following">(
        "for-you",
    );
    const [posts, setPosts] = useState<Post[]>([]);
    const [newsSources, setNewsSources] = useState<NewsSource[]>([]);
    const [newsSourceId, setNewsSourceId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showGate, setShowGate] = useState(false);

    const gateRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (mode !== "NEWS") {
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const result = await listNewsSources();
                if (cancelled) {
                    return;
                }
                setNewsSources(result.sources);
                setNewsSourceId((currentSourceId) => {
                    if (
                        currentSourceId &&
                        result.sources.some(
                            (source) => source.id === currentSourceId,
                        )
                    ) {
                        return currentSourceId;
                    }
                    return result.sources[0]?.id ?? "";
                });
            } catch (err) {
                if (!cancelled) {
                    setError((err as Error).message);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mode]);

    // ── Fetch posts (authenticated) or use mock posts ───────────
    useEffect(() => {
        if (!isAuthenticated && mode !== "NEWS") {
            setPosts(MOCK_POSTS);
            setLoading(false);
            setShowGate(false);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                setPosts([]);
                if (mode === "NEWS") {
                    if (!newsSourceId) {
                        setPosts([]);
                        return;
                    }
                    const result = await listNewsArticles(newsSourceId, 20);
                    if (cancelled) {
                        return;
                    }

                    const articlesWithText: NewsArticleWithText[] =
                        await Promise.all(
                            result.items.map(
                                async (item): Promise<NewsArticleWithText> => {
                                    if (item.fullTextStatus !== "ready") {
                                        return item;
                                    }
                                    try {
                                        const detail = await getNewsArticle(
                                            item.id,
                                        );
                                        return detail.article as NewsArticleDetail;
                                    } catch {
                                        return item;
                                    }
                                },
                            ),
                        );

                    if (!cancelled) {
                        setPosts(articlesWithText.map(newsArticleToPost));
                    }
                    return;
                }

                const result = await listPosts(mode, profile, 20);
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
    }, [mode, profile, isAuthenticated, newsSourceId]);

    // ── Scroll gate observer (guest only) ───────────────────────
    useEffect(() => {
        if (isAuthenticated) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShowGate(true);
                }
            },
            { threshold: 0.5 },
        );

        const el = gateRef.current;
        if (el) observer.observe(el);

        return () => {
            if (el) observer.unobserve(el);
        };
    }, [isAuthenticated, posts]);

    // ── Determine which posts to render ─────────────────────────
    const visiblePosts = isAuthenticated
        ? posts
        : posts.slice(0, VISIBLE_GUEST_POSTS + 2); // show a few extra (partially hidden)

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

            {/* Category pills — horizontally scrollable */}
            <div className="feed-categories">
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.value}
                        className={`feed-category-pill ${mode === cat.value || (cat.value === "ALL" && mode === "ALL") ? "active" : ""}`}
                        onClick={() => onModeChange?.(cat.value)}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>
            {mode === "NEWS" && (
                <div className="feed-news-toolbar">
                    <label htmlFor="news-source-select">Source</label>
                    <select
                        id="news-source-select"
                        className="feed-news-select"
                        value={newsSourceId}
                        onChange={(e) => setNewsSourceId(e.target.value)}
                    >
                        {newsSources.map((source) => (
                            <option key={source.id} value={source.id}>
                                {source.name} ({source.articleCount})
                            </option>
                        ))}
                    </select>
                </div>
            )}
            {mode === "NEWS" && !loading && newsSources.length === 0 && (
                    <div className="feed-news-empty">
                        No ingested news sources found in the emulator database
                        yet.
                    </div>
                )}

            {/* Posts */}
            <div className="feed-posts-container">
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
                ) : visiblePosts.length === 0 ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        {error ? `Error: ${error}` : "No posts yet."}
                    </div>
                ) : (
                    visiblePosts.map((post, index) => (
                        <div
                            key={post.id}
                            ref={
                                !isAuthenticated &&
                                    index === VISIBLE_GUEST_POSTS - 1
                                    ? gateRef
                                    : undefined
                            }
                        >
                            <PostCard post={post} />
                        </div>
                    ))
                )}

                {/* Scroll gate overlay for guests */}
                {!isAuthenticated && showGate && (
                    <div className="scroll-gate">
                        <div className="scroll-gate-content">
                            <h2 className="scroll-gate-title">
                                See what&apos;s happening
                            </h2>
                            <p className="scroll-gate-subtitle">
                                Join Orecce today to get personalized posts,
                                follow topics you love, and more.
                            </p>
                            <button
                                className="scroll-gate-cta"
                                onClick={() => setShowAuthModal(true)}
                            >
                                Create account
                            </button>
                            <button
                                className="scroll-gate-login"
                                onClick={() => setShowAuthModal(true)}
                            >
                                Sign in
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
