"use client";

import { useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { useRecces } from "@/hooks/useRecces";
import { useAuth } from "@/context/AuthContext";
import { trackAnalyticsEvent } from "@/lib/analytics";

export default function DiscoverPage() {
    const { isAuthenticated } = useAuth();
    const { recces, followedKeys, loading, error, toggleFollow } = useRecces();

    useEffect(() => {
        if (loading || error || recces.length === 0) {
            return;
        }
        for (const recce of recces) {
            trackAnalyticsEvent({
                eventName: "discover_recce_impression",
                surface: "discover",
                properties: {
                    recce_id: recce.id,
                    recce_key: recce.key,
                    recce_name: recce.name,
                    recce_type: recce.kind,
                },
            });
        }
    }, [error, loading, recces]);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="feed">
                <div className="feed-header">
                    <div className="feed-header-top">
                        <h1>Discover</h1>
                        <p className="utility-page-intro">
                            Browse recces and follow them to see their posts in
                            your feed.
                        </p>
                    </div>
                </div>

                <div className="utility-page-body">
                    <section className="utility-card">
                        <h2 className="utility-card-title">Recces</h2>

                        {loading ? (
                            <div className="authors-loading">
                                Loading recces…
                            </div>
                        ) : error ? (
                            <div className="authors-error">Error: {error}</div>
                        ) : recces.length === 0 ? (
                            <div className="authors-empty">
                                No recces available yet.
                            </div>
                        ) : (
                            <div className="authors-grid">
                                {recces.map((recce) => {
                                    const isFollowed = followedKeys.has(
                                        recce.key,
                                    );
                                    return (
                                        <article
                                            key={recce.key}
                                            className="author-card"
                                        >
                                            <div className="author-card-info">
                                                <h3 className="author-card-name">
                                                    {recce.name}
                                                </h3>
                                                {recce.bio && (
                                                    <p className="author-card-bio">
                                                        {recce.bio}
                                                    </p>
                                                )}
                                                {!recce.bio && (
                                                    <p className="author-card-bio">
                                                        {recce.kind === "topic" ? "Topic Recce" : "Author Recce"}
                                                    </p>
                                                )}
                                            </div>
                                            {isAuthenticated && (
                                                <button
                                                    type="button"
                                                    className={`author-follow-btn ${isFollowed ? "following" : ""}`}
                                                    onClick={() =>
                                                        toggleFollow(recce)
                                                    }
                                                >
                                                    {isFollowed
                                                        ? "Following"
                                                        : "Follow"}
                                                </button>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
            </main>

            <aside className="right-sidebar">
                <div className="right-card right-new-section page-side-note">
                    <h2 className="page-side-note-title">How it works</h2>
                    <p className="page-side-note-text">
                        Follow recces to see their posts in your "All" feed.
                        Posts you&apos;ve already read are automatically hidden
                        so you always see fresh content.
                    </p>
                </div>
            </aside>
        </div>
    );
}
