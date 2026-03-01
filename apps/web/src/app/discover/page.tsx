"use client";

import { useEffect, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import { useRecces } from "@/hooks/useRecces";
import { useTabState } from "@/hooks/useTabState";
import { useAuth } from "@/context/AuthContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
    getRecceCategoryKey,
    RECCE_CATEGORY_LABELS,
    RECCE_CATEGORY_ORDER,
    type Recce,
    type RecceCategoryKey,
} from "@/lib/recces";

interface RecceSection {
    key: RecceCategoryKey;
    label: string;
    items: Recce[];
}

export default function DiscoverPage() {
    const { isAuthenticated } = useAuth();
    const { recces, followedKeys, loading, error, toggleFollow } = useRecces();
    const [expandedCategory, setExpandedCategory] = useTabState<RecceCategoryKey | null>(
        "orecce:web:page:discover:expanded-category:v1",
        null,
    );

    const sections = useMemo<RecceSection[]>(() => {
        const grouped = new Map<RecceCategoryKey, Recce[]>();

        for (const recce of recces) {
            const categoryKey = getRecceCategoryKey(recce);
            const current = grouped.get(categoryKey) ?? [];
            current.push(recce);
            grouped.set(categoryKey, current);
        }

        return RECCE_CATEGORY_ORDER
            .map((categoryKey) => ({
                key: categoryKey,
                label: RECCE_CATEGORY_LABELS[categoryKey],
                items: (grouped.get(categoryKey) ?? []).sort((left, right) =>
                    left.name.localeCompare(right.name),
                ),
            }))
            .filter((section) => section.items.length > 0);
    }, [recces]);

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

    useEffect(() => {
        if (!expandedCategory) {
            return;
        }

        const categoryStillExists = sections.some((section) => section.key === expandedCategory);
        if (!categoryStillExists) {
            setExpandedCategory(null);
        }
    }, [expandedCategory, sections, setExpandedCategory]);

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
                            <div className="discover-recces-sections">
                                {sections.map((section) => {
                                    const isExpanded = expandedCategory === section.key;
                                    return (
                                    <section key={section.key} className="discover-recces-section">
                                        <button
                                            type="button"
                                            className={`discover-recces-section-toggle ${isExpanded ? "is-expanded" : ""}`}
                                            aria-expanded={isExpanded}
                                            onClick={() =>
                                                setExpandedCategory((current) =>
                                                    current === section.key ? null : section.key,
                                                )
                                            }
                                        >
                                            <span className="discover-recces-section-title">
                                                {section.label}
                                            </span>
                                            <span className="discover-recces-section-meta">
                                                <span className="discover-recces-section-chevron">
                                                    ↓
                                                </span>
                                            </span>
                                        </button>
                                        {isExpanded && (
                                            <div className="authors-grid">
                                                {section.items.map((recce) => {
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
                                                                        {recce.kind === "topic"
                                                                            ? "Topic Recce"
                                                                            : "Author Recce"}
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
