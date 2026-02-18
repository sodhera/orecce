"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import {
    getSportsLatest,
    getSportsStatus,
    requestSportsRefresh,
    type SportsStory,
    type SportsSyncState,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

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

export default function SportsPage() {
    const { isAuthenticated, loading, setShowAuthModal } = useAuth();
    const [stories, setStories] = useState<SportsStory[]>([]);
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [syncState, setSyncState] = useState<SportsSyncState | null>(null);

    useEffect(() => {
        if (loading || !isAuthenticated) {
            return;
        }

        let cancelled = false;
        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                setTimeout(resolve, ms);
            });
        (async () => {
            try {
                setFetching(true);
                setError(null);
                setStories([]);

                const pollState = async () => {
                    try {
                        const status = await getSportsStatus("football");
                        if (!cancelled) {
                            setSyncState(status.state);
                        }
                        return status.state;
                    } catch {
                        // Ignore transient polling failures during refresh.
                        return null;
                    }
                };

                await requestSportsRefresh("football");
                await pollState();

                const startedAt = Date.now();
                while (!cancelled) {
                    await sleep(1500);
                    const state = await pollState();
                    const timedOut = Date.now() - startedAt > 8 * 60 * 1000;
                    const finished =
                        state?.status === "complete" ||
                        state?.status === "error";
                    if (finished || timedOut) {
                        break;
                    }
                }

                const latest = await getSportsLatest("football", 12, false);
                if (!cancelled) {
                    setStories(latest.stories);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load sports news.");
                }
            } finally {
                if (!cancelled) {
                    setFetching(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, loading]);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="feed">
                <div className="feed-header">
                    <div className="feed-header-top">
                        <h1>Sports</h1>
                        <p className="utility-page-intro">
                            Latest football match news synthesized from source reporting.
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
                        {syncState?.status === "running" ? (
                            <div className="sports-feed-state sports-progress">
                                <p>{syncState.message}</p>
                                {syncState.totalGames > 0 ? (
                                    <p>
                                        Preparing articles: {syncState.processedGames}/{syncState.totalGames}
                                    </p>
                                ) : null}
                            </div>
                        ) : null}

                        {fetching ? (
                            <div className="sports-feed-state">Loading latest sports stories...</div>
                        ) : null}

                        {error ? (
                            <div className="sports-feed-state sports-state-error">{error}</div>
                        ) : null}

                        {!fetching && !error && stories.length === 0 ? (
                            <div className="sports-feed-state">No sports stories available right now.</div>
                        ) : null}

                        {stories.map((story) => (
                            <article key={story.id} className="post-card sports-post">
                                <div className="post-body">
                                    <div className="post-header">
                                        <span className="post-topic-badge">{story.sourceName}</span>
                                        <span className="post-dot">·</span>
                                        <span className="post-time">{formatDateFromMs(story.publishedAtMs)}</span>
                                        <span className="post-dot">·</span>
                                        <span className="post-time">Score {story.importanceScore}</span>
                                    </div>
                                    <h2 className="post-title">{story.title}</h2>
                                    <ul className="sports-inline-bullets">
                                        {story.bulletPoints.map((point, index) => (
                                            <li key={`${story.id}-point-${index}`}>{point}</li>
                                        ))}
                                    </ul>
                                    <p className="post-content">{story.reconstructedArticle}</p>
                                    <a
                                        href={story.canonicalUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="post-source-link"
                                    >
                                        Read original source
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : null}
            </main>

            <aside className="right-sidebar">
                <div className="right-card right-new-section page-side-note">
                    <h2 className="page-side-note-title">Sports Feed</h2>
                    <p className="page-side-note-text">
                        Ordered by importance first, then freshness, using multi-source football coverage.
                    </p>
                </div>
            </aside>
        </div>
    );
}
