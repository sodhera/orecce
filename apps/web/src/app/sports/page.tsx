"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import {
    getSportsFeed,
    getSportsStory,
    SPORT_DISPLAY_NAMES,
    SPORT_IDS,
    type SportId,
    type SportsFeedItem,
    type SportsStory,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STORIES_BATCH_SIZE = 5;
const FEED_CACHE_FRESH_MS = 10 * 60 * 1000;
const FEED_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000;

interface CachedSportsFeedPage {
    savedAtMs: number;
    stories: SportsFeedItem[];
    nextCursor: string | null;
}

interface CachedSportsFeedResult extends CachedSportsFeedPage {
    isFresh: boolean;
}

function readCachedSportsFeed(cacheKey: string): CachedSportsFeedResult | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const raw = window.localStorage.getItem(cacheKey);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as Partial<CachedSportsFeedPage>;
        if (typeof parsed.savedAtMs !== "number" || !Array.isArray(parsed.stories)) {
            return null;
        }
        const ageMs = Date.now() - parsed.savedAtMs;
        if (ageMs > FEED_CACHE_MAX_STALE_MS) {
            return null;
        }
        return {
            savedAtMs: parsed.savedAtMs,
            stories: parsed.stories as SportsFeedItem[],
            nextCursor: typeof parsed.nextCursor === "string" ? parsed.nextCursor : null,
            isFresh: ageMs <= FEED_CACHE_FRESH_MS,
        };
    } catch {
        return null;
    }
}

function writeCachedSportsFeed(
    cacheKey: string,
    stories: SportsFeedItem[],
    nextCursor: string | null,
): void {
    if (typeof window === "undefined") {
        return;
    }
    try {
        const payload: CachedSportsFeedPage = {
            savedAtMs: Date.now(),
            stories,
            nextCursor,
        };
        window.localStorage.setItem(cacheKey, JSON.stringify(payload));
    } catch {
        // Ignore cache write failures.
    }
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

function normalizeGameName(rawTitle: string): string {
    const trimmed = String(rawTitle ?? "").trim();
    if (!trimmed) {
        return "";
    }
    return trimmed.replace(/\s+-\s+\d{4}-\d{2}-\d{2}\s*$/i, "").trim();
}

function sanitizeTeamName(raw: string): string {
    return raw
        .replace(/\s+in\s+.+$/i, "")
        .replace(/\s+\(.*\)\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extractTeamsFromGameName(gameName: string): { home: string; away: string } | null {
    const match = gameName.match(/^(.+?)\s+(?:vs|v|versus)\s+(.+?)$/i);
    if (!match) {
        return null;
    }

    const home = sanitizeTeamName(match[1]);
    const away = sanitizeTeamName(match[2]);
    if (!home || !away) {
        return null;
    }
    return { home, away };
}

function buildMatchTitleFromTitle(rawTitle: string): string {
    const gameName = normalizeGameName(rawTitle);
    const teams = extractTeamsFromGameName(gameName);
    if (!teams) {
        return gameName || "Match update";
    }
    return `${teams.home} vs ${teams.away}`;
}

function toggleSportSelection(current: SportId[], sport: SportId): SportId[] {
    if (current.includes(sport)) {
        return current.filter((item) => item !== sport);
    }
    const selected = new Set(current);
    selected.add(sport);
    return SPORT_IDS.filter((item) => selected.has(item));
}

export default function SportsPage() {
    const { isAuthenticated, loading, setShowAuthModal } = useAuth();
    const [stories, setStories] = useState<SportsFeedItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [fetching, setFetching] = useState(false);
    const [fetchingMore, setFetchingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedStoryItem, setSelectedStoryItem] = useState<SportsFeedItem | null>(null);
    const [selectedStoryDetail, setSelectedStoryDetail] = useState<SportsStory | null>(null);
    const [selectedStoryLoading, setSelectedStoryLoading] = useState(false);
    const [selectedStoryError, setSelectedStoryError] = useState<string | null>(null);
    const [hasUserScrolled, setHasUserScrolled] = useState(false);
    const [selectedSports, setSelectedSports] = useState<SportId[]>([...SPORT_IDS]);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const activeFilterKeyRef = useRef<string>("");
    const hasMoreStories = nextCursor !== null;
    const loadMoreAbortRef = useRef<AbortController | null>(null);
    const detailCacheRef = useRef<Map<string, SportsStory>>(new Map());

    useEffect(() => {
        if (!selectedStoryItem) {
            return;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setSelectedStoryItem(null);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [selectedStoryItem]);

    useEffect(() => {
        if (!selectedStoryItem) {
            setSelectedStoryDetail(null);
            setSelectedStoryError(null);
            setSelectedStoryLoading(false);
            return;
        }
        const cached = detailCacheRef.current.get(selectedStoryItem.id);
        if (cached) {
            setSelectedStoryDetail(cached);
            setSelectedStoryError(null);
            setSelectedStoryLoading(false);
            return;
        }

        const controller = new AbortController();
        setSelectedStoryLoading(true);
        setSelectedStoryError(null);
        setSelectedStoryDetail(null);

        (async () => {
            try {
                const response = await getSportsStory(selectedStoryItem.id, {
                    signal: controller.signal,
                });
                detailCacheRef.current.set(selectedStoryItem.id, response.story);
                if (!controller.signal.aborted) {
                    setSelectedStoryDetail(response.story);
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    setSelectedStoryError(
                        err instanceof Error ? err.message : "Failed to load full story.",
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setSelectedStoryLoading(false);
                }
            }
        })();

        return () => {
            controller.abort();
        };
    }, [selectedStoryItem]);

    const selectedStoryTitle = useMemo(
        () =>
            buildMatchTitleFromTitle(
                selectedStoryDetail?.title ?? selectedStoryItem?.title ?? "",
            ),
        [selectedStoryDetail, selectedStoryItem],
    );

    const selectedSportsKey = useMemo(() => selectedSports.join(","), [selectedSports]);
    const effectiveSports = useMemo(
        () => (selectedSports.length === SPORT_IDS.length ? undefined : selectedSports),
        [selectedSports],
    );
    const feedCacheKey = useMemo(
        () => `sports-feed-cache:${selectedSportsKey || "all"}`,
        [selectedSportsKey],
    );

    useEffect(() => {
        activeFilterKeyRef.current = selectedSportsKey;
    }, [selectedSportsKey]);

    useEffect(() => {
        if (loading || !isAuthenticated) {
            return;
        }

        const controller = new AbortController();
        let cancelled = false;
        (async () => {
            try {
                const cached = readCachedSportsFeed(feedCacheKey);
                const hasCachedStories = Boolean(cached?.stories.length);
                setFetching(!hasCachedStories);
                setFetchingMore(false);
                setError(null);
                setSelectedStoryItem(null);
                setHasUserScrolled(false);
                if (cached) {
                    setStories(cached.stories);
                    setNextCursor(cached.nextCursor);
                    if (cached.isFresh && selectedSports.length > 0) {
                        setFetching(false);
                    }
                } else {
                    setStories([]);
                    setNextCursor(null);
                }

                if (selectedSports.length === 0) {
                    return;
                }

                const page = await getSportsFeed(
                    STORIES_BATCH_SIZE,
                    undefined,
                    effectiveSports,
                    { signal: controller.signal },
                );
                if (cancelled || controller.signal.aborted) {
                    return;
                }

                setStories(page.items);
                setNextCursor(page.nextCursor);
                writeCachedSportsFeed(feedCacheKey, page.items, page.nextCursor);
            } catch (err) {
                if (!cancelled && !controller.signal.aborted) {
                    setError(err instanceof Error ? err.message : "Failed to load sports news.");
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
    }, [isAuthenticated, loading, selectedSportsKey, selectedSports, effectiveSports, feedCacheKey]);

    const loadMoreStories = useCallback(async () => {
        if (!nextCursor || fetching || fetchingMore || selectedSports.length === 0) {
            return;
        }

        try {
            loadMoreAbortRef.current?.abort();
            const controller = new AbortController();
            loadMoreAbortRef.current = controller;
            setFetchingMore(true);
            const requestFilterKey = selectedSportsKey;
            const page = await getSportsFeed(
                STORIES_BATCH_SIZE,
                nextCursor,
                effectiveSports,
                { signal: controller.signal },
            );
            if (
                controller.signal.aborted ||
                activeFilterKeyRef.current !== requestFilterKey
            ) {
                return;
            }
            setStories((current) => {
                const seen = new Set(current.map((item) => item.id));
                const appended = page.items.filter((item) => !seen.has(item.id));
                const merged = [...current, ...appended];
                writeCachedSportsFeed(feedCacheKey, merged, page.nextCursor);
                return merged;
            });
            setNextCursor(page.nextCursor);
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                return;
            }
            setError(err instanceof Error ? err.message : "Failed to load more sports stories.");
        } finally {
            setFetchingMore(false);
        }
    }, [nextCursor, fetching, fetchingMore, selectedSports, selectedSportsKey, effectiveSports, feedCacheKey]);

    useEffect(() => {
        if (!hasMoreStories || fetching || fetchingMore || !hasUserScrolled) {
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
                    void loadMoreStories();
                    break;
                }
            },
            { rootMargin: "0px", threshold: 1 },
        );

        observer.observe(node);
        return () => {
            observer.disconnect();
        };
    }, [hasMoreStories, fetching, fetchingMore, hasUserScrolled, loadMoreStories]);

    useEffect(() => {
        if (!isAuthenticated || loading) {
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
    }, [isAuthenticated, loading]);

    useEffect(() => {
        return () => {
            loadMoreAbortRef.current?.abort();
        };
    }, []);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="feed">
                <div className="feed-header">
                    <div className="feed-header-top">
                        <h1>Sports</h1>
                        <p className="utility-page-intro">
                            Latest sports stories from your selected categories, refreshed every 12
                            hours.
                        </p>
                    </div>
                </div>

                {!isAuthenticated && !loading ? (
                    <div className="sports-login-panel">
                        <p className="sports-login-title">Sign in to view sports stories</p>
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
                            <div className="sports-feed-state">Loading latest sports stories...</div>
                        ) : null}

                        {error ? (
                            <div className="sports-feed-state sports-state-error">{error}</div>
                        ) : null}

                        {!fetching && !error && selectedSports.length === 0 ? (
                            <div className="sports-feed-state">
                                Select at least one sport to view stories.
                            </div>
                        ) : null}

                        {!fetching && !error && selectedSports.length > 0 && stories.length === 0 ? (
                            <div className="sports-feed-state">No sports stories available right now.</div>
                        ) : null}

                        {stories.map((story) => (
                            <article
                                key={story.id}
                                className="post-card sports-post"
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedStoryItem(story)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        setSelectedStoryItem(story);
                                    }
                                }}
                            >
                                <div className="post-body">
                                    <div className="sports-post-meta">
                                        <span className="post-topic-badge">
                                            {SPORT_DISPLAY_NAMES[story.sport]}
                                        </span>
                                        <span className="post-dot">·</span>
                                        <span className="post-time">
                                            {formatDateFromMs(story.publishedAtMs)}
                                        </span>
                                    </div>
                                    <h2 className="sports-story-title">
                                        {buildMatchTitleFromTitle(story.title)}
                                    </h2>
                                    <p className="sports-story-preview">{story.preview}</p>
                                </div>
                            </article>
                        ))}

                        {hasMoreStories ? (
                            <div
                                ref={loadMoreRef}
                                className="sports-load-more-trigger"
                                aria-label="Load more sports stories"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    void loadMoreStories();
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        void loadMoreStories();
                                    }
                                }}
                            >
                                {fetchingMore ? "Loading more stories..." : "Scroll to load more stories..."}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </main>

            {selectedStoryItem ? (
                <div
                    className="sports-story-modal-overlay"
                    onClick={() => setSelectedStoryItem(null)}
                    role="presentation"
                >
                    <div
                        className="sports-story-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={selectedStoryTitle}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="sports-story-modal-header">
                            <h2>{selectedStoryTitle}</h2>
                            <button
                                type="button"
                                className="sports-story-modal-close"
                                onClick={() => setSelectedStoryItem(null)}
                                aria-label="Close sports story"
                            >
                                ×
                            </button>
                        </div>
                        <div className="sports-story-modal-meta">
                            <span className="post-topic-badge">
                                {SPORT_DISPLAY_NAMES[selectedStoryItem.sport]}
                            </span>
                            <span className="post-dot">·</span>
                            <span>
                                {formatDateFromMs(
                                    selectedStoryDetail?.publishedAtMs ?? selectedStoryItem.publishedAtMs,
                                )}
                            </span>
                            {selectedStoryDetail ? (
                                <>
                                    <span className="post-dot">·</span>
                                    <span>Relevance {selectedStoryDetail.importanceScore}</span>
                                </>
                            ) : null}
                        </div>
                        {selectedStoryLoading ? (
                            <p className="sports-story-modal-article">Loading full article...</p>
                        ) : null}
                        {selectedStoryError ? (
                            <p className="sports-story-modal-article">{selectedStoryError}</p>
                        ) : null}
                        {!selectedStoryLoading && !selectedStoryError && selectedStoryDetail ? (
                            <p className="sports-story-modal-article">
                                {selectedStoryDetail.story || selectedStoryDetail.reconstructedArticle}
                            </p>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <aside className="right-sidebar">
                <div className="right-card right-new-section page-side-note">
                    <h2 className="page-side-note-title">Filter Sports</h2>
                    <p className="page-side-note-text">
                        Pick the sports you want. Your feed will only show those categories.
                    </p>
                    <div className="sports-filter-actions">
                        <button
                            type="button"
                            className="sports-filter-action"
                            onClick={() => setSelectedSports([...SPORT_IDS])}
                        >
                            Select all
                        </button>
                        <button
                            type="button"
                            className="sports-filter-action"
                            onClick={() => setSelectedSports([])}
                        >
                            Clear all
                        </button>
                    </div>
                    <div className="sports-filter-list">
                        {SPORT_IDS.map((sportId) => {
                            const active = selectedSports.includes(sportId);
                            return (
                                <button
                                    key={sportId}
                                    type="button"
                                    className={`sports-filter-pill ${active ? "active" : ""}`}
                                    onClick={() =>
                                        setSelectedSports((current) =>
                                            toggleSportSelection(current, sportId),
                                        )
                                    }
                                >
                                    {SPORT_DISPLAY_NAMES[sportId]}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </aside>
        </div>
    );
}
