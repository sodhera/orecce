"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSportsLatest, type SportsStory } from "@/lib/api";
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

    useEffect(() => {
        if (loading || !isAuthenticated) {
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                setFetching(true);
                setError(null);
                const result = await getSportsLatest("football", 12);
                if (!cancelled) {
                    setStories(result.stories);
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
                            Latest football stories reconstructed from live RSS articles.
                        </p>
                    </div>
                </div>

                {!isAuthenticated && !loading ? (
                    <div className="utility-page-body">
                        <section className="utility-card">
                            <div className="sports-login-block">
                                <p className="sports-login-title">Sign in to view sports stories</p>
                                <button
                                    type="button"
                                    className="sports-login-btn"
                                    onClick={() => setShowAuthModal(true)}
                                >
                                    Log in / Sign up
                                </button>
                            </div>
                        </section>
                    </div>
                ) : null}

                {isAuthenticated ? (
                    <div className="utility-page-body">
                        {fetching ? (
                            <section className="utility-card">
                                <div className="sports-state">Loading latest sports stories...</div>
                            </section>
                        ) : null}

                        {error ? (
                            <section className="utility-card">
                                <div className="sports-state sports-state-error">{error}</div>
                            </section>
                        ) : null}

                        {!fetching && !error && stories.length === 0 ? (
                            <section className="utility-card">
                                <div className="sports-state">No sports stories available right now.</div>
                            </section>
                        ) : null}

                        {stories.map((story) => (
                            <article key={story.id} className="utility-card sports-card">
                                <div className="sports-card-header">
                                    <div className="sports-card-meta">
                                        <span className="sports-badge">{story.sourceName}</span>
                                        <span className="sports-separator">·</span>
                                        <span>{formatDateFromMs(story.publishedAtMs)}</span>
                                    </div>
                                    <span className="sports-score">Score {story.importanceScore}</span>
                                </div>

                                <div className="sports-card-content">
                                    <h2 className="sports-title">{story.title}</h2>
                                    <ul className="sports-bullets">
                                        {story.bulletPoints.map((point, index) => (
                                            <li key={`${story.id}-point-${index}`}>{point}</li>
                                        ))}
                                    </ul>
                                    <p className="sports-article">{story.reconstructedArticle}</p>
                                    <div className="sports-card-footer">
                                        <span className="sports-footer-note">
                                            {story.summarySource === "llm"
                                                ? "Reconstructed with GPT-5-mini"
                                                : "Fallback summary"}
                                        </span>
                                        <a
                                            href={story.canonicalUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="utility-link"
                                        >
                                            Read original source
                                        </a>
                                    </div>
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
                        Ordered by importance first, then freshness, using BBC and ESPN football RSS.
                    </p>
                </div>
            </aside>
        </div>
    );
}
