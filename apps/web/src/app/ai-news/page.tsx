"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";

interface AiNewsSource {
    id: string;
    tag: string;
    feedUrl: string;
}

interface AiNewsArticle {
    id: string;
    sourceId: string;
    sourceTag: string;
    title: string;
    summary: string;
    content: string;
    link: string;
    publishedAtMs?: number;
}

interface CachedAiRssFeed {
    savedAtMs: number;
    items: AiNewsArticle[];
}

interface ArticleTextSuccess {
    ok: true;
    data: {
        url: string;
        title: string;
        text: string;
        textLength: number;
    };
}

interface ArticleTextFailure {
    ok: false;
    error?: string;
}

type ArticleTextResponse = ArticleTextSuccess | ArticleTextFailure;

const AI_RSS_FEEDS: AiNewsSource[] = [
    {
        id: "openai-news",
        tag: "OpenAI",
        feedUrl: "https://openai.com/news/rss.xml",
    },
    {
        id: "deepmind-blog",
        tag: "DeepMind",
        feedUrl: "https://deepmind.com/blog/feed/basic",
    },
    {
        id: "google-research-blog",
        tag: "Google",
        feedUrl: "https://blog.research.google/atom.xml",
    },
    {
        id: "stanford-ai-lab-blog",
        tag: "Stanford",
        feedUrl: "https://ai.stanford.edu/blog/feed.xml",
    },
    {
        id: "huggingface-blog",
        tag: "HuggingFace",
        feedUrl: "https://huggingface.co/blog/feed.xml",
    },
    {
        id: "mit-ai-news",
        tag: "MIT",
        feedUrl: "https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml",
    },
    {
        id: "techcrunch-ai",
        tag: "TechCrunch AI",
        feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/",
    },
    {
        id: "techcrunch",
        tag: "TechCrunch",
        feedUrl: "https://techcrunch.com/feed/",
    },
];

const SOURCE_IDS = AI_RSS_FEEDS.map((source) => source.id);
const CACHE_KEY = "ai-news:rss:cache:v1";
const CACHE_FRESH_MS = 10 * 60 * 1000;
const CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 20;
const MAX_SUMMARY_CHARS = 600;
const MAX_CONTENT_CHARS = 12_000;
const FEED_TIMEOUT_MS = 15_000;

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
        return value;
    }
    return `${value.slice(0, maxChars).trim()}...`;
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

function toggleSourceSelection(current: string[], sourceId: string): string[] {
    if (current.includes(sourceId)) {
        return current.filter((value) => value !== sourceId);
    }
    const selected = new Set(current);
    selected.add(sourceId);
    return SOURCE_IDS.filter((id) => selected.has(id));
}

function readCachedAiFeed(): { items: AiNewsArticle[]; isFresh: boolean } | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(CACHE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as Partial<CachedAiRssFeed>;
        if (typeof parsed.savedAtMs !== "number" || !Array.isArray(parsed.items)) {
            return null;
        }

        const ageMs = Date.now() - parsed.savedAtMs;
        if (ageMs > CACHE_MAX_STALE_MS) {
            return null;
        }

        return {
            items: parsed.items as AiNewsArticle[],
            isFresh: ageMs <= CACHE_FRESH_MS,
        };
    } catch {
        return null;
    }
}

function writeCachedAiFeed(items: AiNewsArticle[]): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const payload: CachedAiRssFeed = {
            savedAtMs: Date.now(),
            items,
        };
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore cache write failures.
    }
}

function stripHtml(value: string): string {
    const raw = String(value ?? "").trim();
    if (!raw) {
        return "";
    }
    if (typeof window === "undefined") {
        return normalizeWhitespace(raw.replace(/<[^>]+>/g, " "));
    }
    const doc = new DOMParser().parseFromString(raw, "text/html");
    return normalizeWhitespace(doc.body.textContent ?? "");
}

function firstTagText(parent: Element, tagNames: string[]): string {
    for (const tagName of tagNames) {
        const node = parent.getElementsByTagName(tagName)[0];
        if (!node) {
            continue;
        }
        const text = normalizeWhitespace(node.textContent ?? "");
        if (text) {
            return text;
        }
    }
    return "";
}

function parsePublishedAtMs(raw: string): number | undefined {
    const normalized = String(raw ?? "").trim();
    if (!normalized) {
        return undefined;
    }
    const parsed = Date.parse(normalized);
    if (!Number.isFinite(parsed)) {
        return undefined;
    }
    return parsed;
}

function resolveSourceLink(rawLink: string, feedUrl: string): string {
    const normalized = String(rawLink ?? "").trim();
    if (!normalized) {
        return "";
    }
    try {
        return new URL(normalized, feedUrl).toString();
    } catch {
        return normalized;
    }
}

function isLikelyContentLink(link: string): boolean {
    const normalized = String(link ?? "").toLowerCase().trim();
    if (!normalized) {
        return false;
    }
    if (normalized.includes("/comments/default")) {
        return false;
    }
    return true;
}

function parseRssItems(doc: Document, source: AiNewsSource): AiNewsArticle[] {
    const nodes = Array.from(doc.getElementsByTagName("item"));
    return nodes
        .flatMap((node) => {
            const title = firstTagText(node, ["title"]);
            const link = resolveSourceLink(
                firstTagText(node, ["feedburner:origLink", "origLink", "link"]),
                source.feedUrl,
            );
            const summary = clipText(
                stripHtml(firstTagText(node, ["description", "summary"])),
                MAX_SUMMARY_CHARS,
            );
            const content = clipText(
                stripHtml(
                    firstTagText(node, ["content:encoded", "content", "description", "summary"]),
                ),
                MAX_CONTENT_CHARS,
            );
            const publishedAtMs = parsePublishedAtMs(
                firstTagText(node, ["pubDate", "dc:date", "published", "updated"]),
            );
            const guid = firstTagText(node, ["guid"]);
            const articleIdBase = guid || link || `${source.id}:${title}:${publishedAtMs ?? 0}`;
            const id = `${source.id}:${articleIdBase}`;
            if (!isLikelyContentLink(link)) {
                return [];
            }

            return [{
                id,
                sourceId: source.id,
                sourceTag: source.tag,
                title: title || "Untitled",
                summary,
                content,
                link,
                publishedAtMs,
            } satisfies AiNewsArticle];
        })
        .filter((item) => Boolean(item.title));
}

function parseAtomItems(doc: Document, source: AiNewsSource): AiNewsArticle[] {
    const nodes = Array.from(doc.getElementsByTagName("entry"));
    return nodes
        .flatMap((node) => {
            const title = firstTagText(node, ["title"]);
            const idRaw = firstTagText(node, ["id"]);
            const linkNodes = Array.from(node.getElementsByTagName("link"));
            const alternateLink =
                linkNodes.find((linkNode) => {
                    const rel = String(linkNode.getAttribute("rel") ?? "").trim();
                    return !rel || rel.toLowerCase() === "alternate";
                }) ?? linkNodes[0];
            const href = normalizeWhitespace(alternateLink?.getAttribute("href") ?? "");
            const linkText = normalizeWhitespace(alternateLink?.textContent ?? "");
            const link = resolveSourceLink(href || linkText, source.feedUrl);
            const summary = clipText(
                stripHtml(firstTagText(node, ["summary"])),
                MAX_SUMMARY_CHARS,
            );
            const content = clipText(
                stripHtml(firstTagText(node, ["content", "summary"])),
                MAX_CONTENT_CHARS,
            );
            const publishedAtMs = parsePublishedAtMs(
                firstTagText(node, ["published", "updated"]),
            );
            const articleIdBase = idRaw || link || `${source.id}:${title}:${publishedAtMs ?? 0}`;
            const id = `${source.id}:${articleIdBase}`;
            if (!isLikelyContentLink(link)) {
                return [];
            }

            return [{
                id,
                sourceId: source.id,
                sourceTag: source.tag,
                title: title || "Untitled",
                summary,
                content,
                link,
                publishedAtMs,
            } satisfies AiNewsArticle];
        })
        .filter((item) => Boolean(item.title));
}

function parseFeedXml(xml: string, source: AiNewsSource): AiNewsArticle[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    const parseErrors = doc.getElementsByTagName("parsererror");
    if (parseErrors.length > 0) {
        return [];
    }

    const rssItems = parseRssItems(doc, source);
    if (rssItems.length > 0) {
        return rssItems;
    }

    return parseAtomItems(doc, source);
}

async function fetchFeedXml(feedUrl: string, signal: AbortSignal): Promise<string> {
    // Proxy-only path avoids browser CORS failures + duplicate fetch attempts.
    const proxied = await fetch(`/api/rss-proxy?url=${encodeURIComponent(feedUrl)}`, {
        method: "GET",
        cache: "force-cache",
        signal,
    });
    if (!proxied.ok) {
        throw new Error(`Feed request failed (${proxied.status}).`);
    }
    return proxied.text();
}

function mergeAndSortArticles(items: AiNewsArticle[]): AiNewsArticle[] {
    const dedupedByKey = new Map<string, AiNewsArticle>();
    for (const item of items) {
        const dedupeKey = (item.link || item.title).toLowerCase().trim();
        if (!dedupeKey || dedupedByKey.has(dedupeKey)) {
            continue;
        }
        dedupedByKey.set(dedupeKey, item);
    }

    return Array.from(dedupedByKey.values()).sort(
        (a, b) => (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0),
    );
}

export default function AiNewsPage() {
    const { isAuthenticated, loading, setShowAuthModal } = useAuth();
    const [articles, setArticles] = useState<AiNewsArticle[]>([]);
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [failedFeedCount, setFailedFeedCount] = useState(0);
    const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([...SOURCE_IDS]);
    const [selectedArticle, setSelectedArticle] = useState<AiNewsArticle | null>(null);
    const [selectedArticleText, setSelectedArticleText] = useState<string>("");
    const [selectedArticleTextLoading, setSelectedArticleTextLoading] = useState(false);
    const [selectedArticleTextError, setSelectedArticleTextError] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const fullTextCacheRef = useRef<Map<string, string>>(new Map());

    useEffect(() => {
        if (!selectedArticle) {
            return;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setSelectedArticle(null);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [selectedArticle]);

    useEffect(() => {
        if (!selectedArticle) {
            setSelectedArticleText("");
            setSelectedArticleTextError(null);
            setSelectedArticleTextLoading(false);
            return;
        }

        const cached = fullTextCacheRef.current.get(selectedArticle.id);
        if (cached) {
            setSelectedArticleText(cached);
            setSelectedArticleTextError(null);
            setSelectedArticleTextLoading(false);
            return;
        }

        if (!selectedArticle.link) {
            setSelectedArticleText("");
            setSelectedArticleTextError("No source URL available for this article.");
            setSelectedArticleTextLoading(false);
            return;
        }

        const controller = new AbortController();
        setSelectedArticleText("");
        setSelectedArticleTextError(null);
        setSelectedArticleTextLoading(true);

        (async () => {
            try {
                const response = await fetch(
                    `/api/article-text?url=${encodeURIComponent(selectedArticle.link)}`,
                    {
                        method: "GET",
                        cache: "force-cache",
                        signal: controller.signal,
                    },
                );
                const payload = (await response.json()) as ArticleTextResponse;
                if (!response.ok || !payload.ok) {
                    throw new Error(
                        payload && "error" in payload && payload.error
                            ? payload.error
                            : `Failed with status ${response.status}`,
                    );
                }

                const fullText = String(payload.data.text ?? "").trim();
                if (!fullText) {
                    throw new Error("Source article returned empty text.");
                }

                fullTextCacheRef.current.set(selectedArticle.id, fullText);
                if (!controller.signal.aborted) {
                    setSelectedArticleText(fullText);
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    setSelectedArticleTextError(
                        err instanceof Error
                            ? err.message
                            : "Failed to load full article from source.",
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setSelectedArticleTextLoading(false);
                }
            }
        })();

        return () => {
            controller.abort();
        };
    }, [selectedArticle]);

    useEffect(() => {
        if (!isAuthenticated || loading) {
            return;
        }

        const cached = readCachedAiFeed();
        if (cached) {
            setArticles(cached.items);
            setVisibleCount((current) => Math.max(current, PAGE_SIZE));
            if (cached.isFresh) {
                setFetching(false);
                setError(null);
                setFailedFeedCount(0);
            }
        }

        const controller = new AbortController();
        let cancelled = false;

        (async () => {
            try {
                if (!cached) {
                    setFetching(true);
                }
                setError(null);
                const settled = await Promise.allSettled(
                    AI_RSS_FEEDS.map(async (source) => {
                        const perFeedSignal = AbortSignal.any([
                            controller.signal,
                            AbortSignal.timeout(FEED_TIMEOUT_MS),
                        ]);
                        const xml = await fetchFeedXml(source.feedUrl, perFeedSignal);
                        return parseFeedXml(xml, source);
                    }),
                );

                if (cancelled || controller.signal.aborted) {
                    return;
                }

                const merged = mergeAndSortArticles(
                    settled
                        .filter(
                            (
                                result,
                            ): result is PromiseFulfilledResult<AiNewsArticle[]> =>
                                result.status === "fulfilled",
                        )
                        .flatMap((result) => result.value),
                );

                const failures = settled.filter((result) => result.status === "rejected").length;
                setFailedFeedCount(failures);
                setArticles(merged);
                setVisibleCount(PAGE_SIZE);
                writeCachedAiFeed(merged);

                if (merged.length === 0 && failures > 0) {
                    setError("Unable to load AI feeds right now.");
                }
            } catch (err) {
                if (!cancelled && !controller.signal.aborted) {
                    setError(err instanceof Error ? err.message : "Failed to load AI news.");
                }
            } finally {
                if (!cancelled && !controller.signal.aborted) {
                    setFetching(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [isAuthenticated, loading]);

    const filteredArticles = useMemo(() => {
        if (selectedSourceIds.length === 0) {
            return [];
        }
        const allowed = new Set(selectedSourceIds);
        return articles.filter((article) => allowed.has(article.sourceId));
    }, [articles, selectedSourceIds]);

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [selectedSourceIds]);

    const visibleArticles = useMemo(
        () => filteredArticles.slice(0, visibleCount),
        [filteredArticles, visibleCount],
    );

    const hasMore = visibleCount < filteredArticles.length;
    const fallbackSelectedText =
        selectedArticle?.content || selectedArticle?.summary || "No article text available.";

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="feed">
                <div className="feed-header">
                    <div className="feed-header-top">
                        <h1>AI News</h1>
                        <p className="utility-page-intro">
                            Live AI RSS feed loaded client-side from OpenAI, DeepMind, Google
                            Research, Stanford, Hugging Face, and MIT.
                        </p>
                    </div>
                </div>

                {!isAuthenticated && !loading ? (
                    <div className="sports-login-panel">
                        <p className="sports-login-title">Sign in to view AI news</p>
                        <button
                            type="button"
                            className="sports-login-btn"
                            onClick={() => setShowAuthModal(true)}
                        >
                            Log in / Sign up
                        </button>
                    </div>
                ) : null}

                {isAuthenticated ? (
                    <div className="sports-feed">
                        {fetching ? (
                            <div className="sports-feed-state">Loading AI articles...</div>
                        ) : null}

                        {error ? (
                            <div className="sports-feed-state sports-state-error">{error}</div>
                        ) : null}

                        {!fetching && failedFeedCount > 0 ? (
                            <div className="sports-feed-state">
                                {failedFeedCount} of {AI_RSS_FEEDS.length} feeds failed to load.
                            </div>
                        ) : null}

                        {!fetching && !error && selectedSourceIds.length === 0 ? (
                            <div className="sports-feed-state">
                                Select at least one source to view articles.
                            </div>
                        ) : null}

                        {!fetching && !error && selectedSourceIds.length > 0 && filteredArticles.length === 0 ? (
                            <div className="sports-feed-state">
                                No AI articles available for the selected sources.
                            </div>
                        ) : null}

                        {visibleArticles.map((article) => (
                            <article
                                key={article.id}
                                className="post-card sports-post"
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedArticle(article)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setSelectedArticle(article);
                                    }
                                }}
                            >
                                <div className="post-body">
                                    <div className="sports-post-meta">
                                        <span className="post-topic-badge">{article.sourceTag}</span>
                                        <span className="post-dot">·</span>
                                        <span className="post-time">
                                            {formatDateFromMs(article.publishedAtMs)}
                                        </span>
                                    </div>
                                    <h2 className="sports-story-title">{article.title}</h2>
                                    <p className="sports-story-preview">
                                        {article.summary || "No summary available."}
                                    </p>
                                </div>
                            </article>
                        ))}

                        {hasMore ? (
                            <div
                                className="sports-load-more-trigger"
                                role="button"
                                tabIndex={0}
                                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setVisibleCount((current) => current + PAGE_SIZE);
                                    }
                                }}
                            >
                                Load more articles
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </main>

            {selectedArticle ? (
                <div
                    className="sports-story-modal-overlay"
                    onClick={() => setSelectedArticle(null)}
                    role="presentation"
                >
                    <div
                        className="sports-story-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={selectedArticle.title}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="sports-story-modal-header">
                            <h2>{selectedArticle.title}</h2>
                            <button
                                type="button"
                                className="sports-story-modal-close"
                                onClick={() => setSelectedArticle(null)}
                                aria-label="Close AI article"
                            >
                                ×
                            </button>
                        </div>
                        <div className="sports-story-modal-meta">
                            <span className="post-topic-badge">{selectedArticle.sourceTag}</span>
                            <span className="post-dot">·</span>
                            <span>{formatDateFromMs(selectedArticle.publishedAtMs)}</span>
                        </div>
                        {selectedArticleTextLoading ? (
                            <p className="sports-story-modal-article">
                                Loading full article text from source...
                            </p>
                        ) : null}
                        {selectedArticleTextError ? (
                            <p className="sports-story-modal-article sports-state-error">
                                {selectedArticleTextError}
                            </p>
                        ) : null}
                        {!selectedArticleTextLoading ? (
                            <div className="sports-story-modal-article">
                                {selectedArticleText || fallbackSelectedText}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <aside className="right-sidebar">
                <div className="right-card right-new-section page-side-note">
                    <h2 className="page-side-note-title">Filter Sources</h2>
                    <p className="page-side-note-text">
                        Choose which AI publishers you want in this feed.
                    </p>
                    <div className="sports-filter-actions">
                        <button
                            type="button"
                            className="sports-filter-action"
                            onClick={() => setSelectedSourceIds([...SOURCE_IDS])}
                        >
                            Select all
                        </button>
                        <button
                            type="button"
                            className="sports-filter-action"
                            onClick={() => setSelectedSourceIds([])}
                        >
                            Clear all
                        </button>
                        <button
                            type="button"
                            className="sports-filter-action"
                            onClick={() => {
                                window.localStorage.removeItem(CACHE_KEY);
                                window.location.reload();
                            }}
                        >
                            Refresh now
                        </button>
                    </div>
                    <div className="sports-filter-list">
                        {AI_RSS_FEEDS.map((source) => {
                            const active = selectedSourceIds.includes(source.id);
                            return (
                                <button
                                    key={source.id}
                                    type="button"
                                    className={`sports-filter-pill ${active ? "active" : ""}`}
                                    onClick={() =>
                                        setSelectedSourceIds((current) =>
                                            toggleSourceSelection(current, source.id),
                                        )
                                    }
                                >
                                    {source.tag}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </aside>
        </div>
    );
}
