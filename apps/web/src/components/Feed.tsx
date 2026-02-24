"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PostCard, { type Post } from "./PostCard";
import ReccesBlogFeed from "./ReccesBlogFeed";
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

// ── Config ──────────────────────────────────────────────────────
const POSTS_PAGE_SIZE = 20;

const CATEGORIES = [
    { value: "SPORTS", label: "Sports" },
    { value: "ALL", label: "All" },
    { value: "BLOGS", label: "Blogs" },
    { value: "BIOGRAPHY", label: "Biographies" },
    { value: "TRIVIA", label: "Trivia" },
    { value: "NICHE", label: "Niche" },
    { value: "NEWS", label: "News" },
];
const FEED_MODES = ["BIOGRAPHY", "TRIVIA", "NICHE"] as const;
type FeedMode = (typeof FEED_MODES)[number];
type ModeCursorMap = Record<FeedMode, string | null>;
const EMPTY_MODE_CURSORS: ModeCursorMap = {
    BIOGRAPHY: null,
    TRIVIA: null,
    NICHE: null,
};

// ── Helpers ─────────────────────────────────────────────────────

function apiPostToPost(p: ApiPost): Post {
    return {
        id: p.id,
        post_type: "single",
        topic: p.mode,
        title: p.title,
        slides: [
            { slide_number: 1, type: "standalone" as const, text: p.body },
        ],
        createdAtMs: p.createdAtMs,
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
        post_type: "single",
        topic: article.sourceName || "NEWS",
        title: article.title,
        slides: [
            {
                slide_number: 1,
                type: "standalone" as const,
                text:
                    article.fullText?.trim() ||
                    article.summary ||
                    "No article text available.",
            },
        ],
        createdAtMs: article.publishedAtMs,
        date: formatDateFromMs(article.publishedAtMs),
        sourceUrl: article.canonicalUrl || undefined,
    };
}

function mergeUniquePosts(
    current: Post[],
    incoming: Post[],
    sortByCreatedAt: boolean = false,
): Post[] {
    const deduped = new Map<string, Post>();
    current.forEach((post) => {
        deduped.set(post.id, post);
    });
    incoming.forEach((post) => {
        if (!deduped.has(post.id)) {
            deduped.set(post.id, post);
        }
    });

    const merged = Array.from(deduped.values());
    if (!sortByCreatedAt) {
        return merged;
    }

    return merged.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
}

// ── Component ───────────────────────────────────────────────────

interface FeedProps {
    mode: string;
    profile: string;
    onModeChange?: (mode: string) => void;
}

export default function Feed({ mode, profile, onModeChange }: FeedProps) {
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    const [posts, setPosts] = useState<Post[]>([]);
    const [newsSources, setNewsSources] = useState<NewsSource[]>([]);
    const [newsSourceId, setNewsSourceId] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [allModeCursors, setAllModeCursors] =
        useState<ModeCursorMap>(EMPTY_MODE_CURSORS);
    const [hasMore, setHasMore] = useState(false);
    const [fetchingMore, setFetchingMore] = useState(false);
    const [hasUserScrolled, setHasUserScrolled] = useState(false);

    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const activeContextRef = useRef("");

    const fetchAllModePage = useCallback(
        async (cursorMap?: ModeCursorMap): Promise<{
            items: ApiPost[];
            nextCursors: ModeCursorMap;
            hasMorePages: boolean;
        }> => {
            const requestedModes = FEED_MODES.filter((feedMode) =>
                cursorMap ? cursorMap[feedMode] !== null : true,
            );

            if (requestedModes.length === 0) {
                return {
                    items: [],
                    nextCursors: EMPTY_MODE_CURSORS,
                    hasMorePages: false,
                };
            }

            const nextCursors: ModeCursorMap = {
                BIOGRAPHY: cursorMap?.BIOGRAPHY ?? null,
                TRIVIA: cursorMap?.TRIVIA ?? null,
                NICHE: cursorMap?.NICHE ?? null,
            };

            const settled = await Promise.allSettled(
                requestedModes.map(async (feedMode) => ({
                    feedMode,
                    page: await listPosts(
                        feedMode,
                        profile,
                        POSTS_PAGE_SIZE,
                        cursorMap?.[feedMode] ?? undefined,
                    ),
                })),
            );

            const successful: Array<{
                feedMode: FeedMode;
                page: { items: ApiPost[]; nextCursor: string | null };
            }> = [];
            let firstError: unknown;

            settled.forEach((result) => {
                if (result.status === "fulfilled") {
                    successful.push(result.value);
                    return;
                }
                if (firstError === undefined) {
                    firstError = result.reason;
                }
            });

            if (successful.length === 0) {
                throw firstError ?? new Error("Failed to fetch posts.");
            }

            successful.forEach(({ feedMode, page }) => {
                nextCursors[feedMode] = page.nextCursor;
            });

            const deduped = new Map<string, ApiPost>();
            successful
                .flatMap(({ page }) => page.items)
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
                .forEach((item) => {
                    if (!deduped.has(item.id)) {
                        deduped.set(item.id, item);
                    }
                });

            return {
                items: Array.from(deduped.values()),
                nextCursors,
                hasMorePages: FEED_MODES.some((feedMode) =>
                    Boolean(nextCursors[feedMode]),
                ),
            };
        },
        [profile],
    );

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

    // ── Fetch posts ──────────────────────────────────────────────
    useEffect(() => {
        const contextKey = `${isAuthenticated}:${mode}:${profile}:${newsSourceId}`;
        activeContextRef.current = contextKey;
        setError(null);
        setHasMore(false);
        setNextCursor(null);
        setAllModeCursors(EMPTY_MODE_CURSORS);
        setHasUserScrolled(false);
        setFetchingMore(false);

        if (!isAuthenticated) {
            setPosts([]);
            setLoading(false);
            setError("Authentication required.");
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setPosts([]);
                if (mode === "BLOGS") {
                    setHasMore(false);
                    return;
                }
                if (mode === "NEWS") {
                    if (!newsSourceId) {
                        setPosts([]);
                        setHasMore(false);
                        return;
                    }
                    const result = await listNewsArticles(
                        newsSourceId,
                        POSTS_PAGE_SIZE,
                    );
                    if (
                        cancelled ||
                        activeContextRef.current !== contextKey
                    ) {
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

                    if (
                        !cancelled &&
                        activeContextRef.current === contextKey
                    ) {
                        setPosts(articlesWithText.map(newsArticleToPost));
                        setHasMore(false);
                    }
                    return;
                }

                if (mode === "ALL") {
                    const firstPage = await fetchAllModePage();
                    if (
                        cancelled ||
                        activeContextRef.current !== contextKey
                    ) {
                        return;
                    }
                    setPosts(firstPage.items.map(apiPostToPost));
                    setAllModeCursors(firstPage.nextCursors);
                    setHasMore(firstPage.hasMorePages);
                    return;
                }

                const firstPage = await listPosts(
                    mode,
                    profile,
                    POSTS_PAGE_SIZE,
                );
                if (
                    cancelled ||
                    activeContextRef.current !== contextKey
                ) {
                    return;
                }
                setPosts(firstPage.items.map(apiPostToPost));
                setNextCursor(firstPage.nextCursor);
                setHasMore(Boolean(firstPage.nextCursor));
            } catch (err) {
                if (
                    !cancelled &&
                    activeContextRef.current === contextKey
                ) {
                    setError((err as Error).message);
                }
            } finally {
                if (
                    !cancelled &&
                    activeContextRef.current === contextKey
                ) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [
        mode,
        profile,
        isAuthenticated,
        newsSourceId,
        fetchAllModePage,
    ]);

    const loadMorePosts = useCallback(async () => {
        if (
            !isAuthenticated ||
            mode === "NEWS" ||
            mode === "BLOGS" ||
            loading ||
            fetchingMore ||
            !hasMore
        ) {
            return;
        }

        const contextKey = `${isAuthenticated}:${mode}:${profile}:${newsSourceId}`;
        if (activeContextRef.current !== contextKey) {
            return;
        }

        try {
            setFetchingMore(true);
            if (mode === "ALL") {
                const page = await fetchAllModePage(allModeCursors);
                if (activeContextRef.current !== contextKey) {
                    return;
                }

                setPosts((current) =>
                    mergeUniquePosts(
                        current,
                        page.items.map(apiPostToPost),
                        true,
                    ),
                );
                setAllModeCursors(page.nextCursors);
                setHasMore(page.hasMorePages);
                return;
            }

            if (!nextCursor) {
                setHasMore(false);
                return;
            }

            const page = await listPosts(
                mode,
                profile,
                POSTS_PAGE_SIZE,
                nextCursor,
            );
            if (activeContextRef.current !== contextKey) {
                return;
            }

            setPosts((current) =>
                mergeUniquePosts(current, page.items.map(apiPostToPost)),
            );
            setNextCursor(page.nextCursor);
            setHasMore(Boolean(page.nextCursor));
        } catch (err) {
            if (activeContextRef.current === contextKey) {
                setError((err as Error).message);
            }
        } finally {
            if (activeContextRef.current === contextKey) {
                setFetchingMore(false);
            }
        }
    }, [
        allModeCursors,
        fetchAllModePage,
        fetchingMore,
        hasMore,
        isAuthenticated,
        loading,
        mode,
        newsSourceId,
        nextCursor,
        profile,
    ]);

    // ── Infinite scroll observer (authenticated, non-news) ──────
    useEffect(() => {
        if (
            !isAuthenticated ||
            mode === "NEWS" ||
            mode === "BLOGS" ||
            !hasMore ||
            loading ||
            fetchingMore ||
            !hasUserScrolled
        ) {
            return;
        }

        const node = loadMoreRef.current;
        if (!node) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) {
                        continue;
                    }
                    void loadMorePosts();
                    break;
                }
            },
            { threshold: 1 },
        );

        observer.observe(node);
        return () => {
            observer.disconnect();
        };
    }, [
        isAuthenticated,
        mode,
        hasMore,
        loading,
        fetchingMore,
        hasUserScrolled,
        loadMorePosts,
    ]);

    useEffect(() => {
        if (!isAuthenticated || mode === "NEWS" || mode === "BLOGS" || loading) {
            return;
        }

        const onScroll = () => {
            if (window.scrollY > 0) {
                setHasUserScrolled(true);
            }
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
        };
    }, [isAuthenticated, mode, loading]);

    // ── Determine which posts to render ─────────────────────────
    const visiblePosts = posts;

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
                        onClick={() => {
                            if (cat.value === "SPORTS") {
                                router.push("/sports");
                                return;
                            }
                            onModeChange?.(cat.value);
                        }}
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
            {mode === "BLOGS" ? (
                <ReccesBlogFeed />
            ) : (
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
                        {error
                            ? `Error: ${error}`
                            : mode === "NEWS"
                                ? "No news articles yet for this source."
                                : "No posts yet."}
                    </div>
                ) : (
                    visiblePosts.map((post) => (
                        <div key={post.id}>
                            <PostCard post={post} />
                        </div>
                    ))
                )}

                {isAuthenticated &&
                    mode !== "NEWS" &&
                    mode !== "BLOGS" &&
                    hasMore &&
                    visiblePosts.length > 0 && (
                        <div
                            ref={loadMoreRef}
                            className="sports-load-more-trigger"
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                                void loadMorePosts();
                            }}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                ) {
                                    event.preventDefault();
                                    void loadMorePosts();
                                }
                            }}
                        >
                            {fetchingMore
                                ? "Loading more posts..."
                                : "Scroll to load more posts..."}
                        </div>
                    )}

            </div>
            )}
        </main>
    );
}
