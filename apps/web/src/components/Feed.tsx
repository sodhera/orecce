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
const FEED_MODES = ["BIOGRAPHY", "TRIVIA", "NICHE"] as const;

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

    const [posts, setPosts] = useState<Post[]>([]);
    const [newsSources, setNewsSources] = useState<NewsSource[]>([]);
    const [newsSourceId, setNewsSourceId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showGate, setShowGate] = useState(false);

    const gateRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (mode !== "NEWS" || !isAuthenticated) {
            setNewsSources([]);
            setNewsSourceId("");
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
    }, [mode, isAuthenticated]);

    // ── Fetch posts (authenticated) or use mock posts ───────────
    useEffect(() => {
        if (!isAuthenticated) {
            if (mode === "NEWS") {
                setPosts([]);
                setLoading(false);
                setShowGate(false);
                setError(null);
                return;
            }

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

                const items =
                    mode === "ALL"
                        ? await (async () => {
                              const settled = await Promise.allSettled(
                                  FEED_MODES.map((m) =>
                                      listPosts(m, profile, 20),
                                  ),
                              );

                              const successful = settled
                                  .filter(
                                      (
                                          result,
                                      ): result is PromiseFulfilledResult<{
                                          items: ApiPost[];
                                          nextCursor: string | null;
                                      }> => result.status === "fulfilled",
                                  )
                                  .flatMap((result) => result.value.items);

                              if (successful.length === 0) {
                                  const firstError = settled.find(
                                      (
                                          result,
                                      ): result is PromiseRejectedResult =>
                                          result.status === "rejected",
                                  );
                                  throw (
                                      firstError?.reason ??
                                      new Error("Failed to fetch posts.")
                                  );
                              }

                              const deduped = new Map<string, ApiPost>();
                              successful
                                  .sort((a, b) => b.createdAtMs - a.createdAtMs)
                                  .forEach((item) => {
                                      if (!deduped.has(item.id)) {
                                          deduped.set(item.id, item);
                                      }
                                  });

                              return Array.from(deduped.values()).slice(0, 20);
                          })()
                        : (await listPosts(mode, profile, 20)).items;

                if (!cancelled) {
                    setPosts(items.map(apiPostToPost));
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
                        No news sources available right now.
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
                ) : mode === "NEWS" && !isAuthenticated ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        <p style={{ marginBottom: 14 }}>
                            Sign in to view the live News feed.
                        </p>
                        <button
                            className="right-new-btn"
                            onClick={() => setShowAuthModal(true)}
                        >
                            Sign in
                        </button>
                    </div>
                ) : visiblePosts.length === 0 ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        {error
                            ? `Error: ${error}`
                            : mode === "NEWS"
                              ? "No news articles yet for this source."
                              : "No posts yet."}
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
