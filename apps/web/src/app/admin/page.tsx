"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/context/AuthContext";
import {
    getAdminUserAnalytics,
    type AdminUserAnalyticsResult,
} from "@/lib/api";

function formatNumber(value: number): string {
    return new Intl.NumberFormat("en-US").format(value);
}

function formatShortDate(value: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    }).format(new Date(`${value}T00:00:00Z`));
}

function formatGeneratedAt(value: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(value));
}

function shortActorId(actorId: string): string {
    if (actorId === "unknown" || actorId.length <= 18) {
        return actorId;
    }
    return `${actorId.slice(0, 8)}...${actorId.slice(-6)}`;
}

export default function AdminPage() {
    const { adminLoading, isAdmin } = useAuth();
    const [analytics, setAnalytics] = useState<AdminUserAnalyticsResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (adminLoading) {
            return () => {
                cancelled = true;
            };
        }

        if (!isAdmin) {
            setAnalytics(null);
            setError(null);
            setLoading(false);
            return () => {
                cancelled = true;
            };
        }

        setLoading(true);
        setError(null);

        void (async () => {
            try {
                const result = await getAdminUserAnalytics();
                if (cancelled) {
                    return;
                }
                setAnalytics(result);
            } catch (nextError) {
                if (cancelled) {
                    return;
                }
                setAnalytics(null);
                setError(
                    nextError instanceof Error
                        ? nextError.message
                        : "Could not load admin analytics.",
                );
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [adminLoading, isAdmin]);

    const statCards = useMemo(() => {
        if (!analytics) {
            return [];
        }

        return [
            {
                label: `Tracked actors (${analytics.windowDays}d)`,
                value: analytics.summary.trackedActors,
                meta: "Signed-in users and anonymous visitors combined",
            },
            {
                label: `Sessions (${analytics.windowDays}d)`,
                value: analytics.summary.totalSessions,
                meta: "Summed from daily session facts",
            },
            {
                label: `Events (${analytics.windowDays}d)`,
                value: analytics.summary.totalEvents,
                meta: "All raw analytics events in the reporting window",
            },
            {
                label: `Reads (${analytics.windowDays}d)`,
                value: analytics.summary.postReads,
                meta: "Post reads and detail views",
            },
            {
                label: `Saves (${analytics.windowDays}d)`,
                value: analytics.summary.saves,
                meta: "Post saves and save-to-collection actions",
            },
            {
                label: `Upvotes (${analytics.windowDays}d)`,
                value: analytics.summary.upvotes,
                meta: "Explicit positive feedback events",
            },
        ];
    }, [analytics]);

    return (
        <div className="app-layout">
            <Sidebar />

            <main className="feed">
                <div className="feed-header">
                    <div className="feed-header-top">
                        <h1>Admin</h1>
                        <p className="utility-page-intro">
                            User analytics lives here for now. Additional admin tools can
                            be added on this route later.
                        </p>
                    </div>
                </div>

                <div className="utility-page-body admin-page-body">
                    {adminLoading ? (
                        <section className="utility-card admin-state-card">
                            <div className="admin-state-copy">Checking admin access...</div>
                        </section>
                    ) : !isAdmin ? (
                        <section className="utility-card admin-state-card">
                            <div className="admin-state-copy">
                                You do not have access to this page.
                            </div>
                        </section>
                    ) : loading ? (
                        <section className="utility-card admin-state-card">
                            <div className="admin-state-copy">Loading analytics...</div>
                        </section>
                    ) : error ? (
                        <section className="utility-card admin-state-card">
                            <div className="admin-state-copy admin-state-error">{error}</div>
                        </section>
                    ) : analytics ? (
                        <>
                            <section className="admin-stat-grid">
                                {statCards.map((card) => (
                                    <article key={card.label} className="utility-card admin-stat-card">
                                        <div className="admin-stat-label">{card.label}</div>
                                        <div className="admin-stat-value">
                                            {formatNumber(card.value)}
                                        </div>
                                        <div className="admin-stat-meta">{card.meta}</div>
                                    </article>
                                ))}
                            </section>

                            <section className="utility-card">
                                <div className="utility-card-header">
                                    <h2 className="utility-card-title">Platform breakdown</h2>
                                </div>
                                <div className="admin-table-wrap">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>Platform</th>
                                                <th>Actors</th>
                                                <th>Sessions</th>
                                                <th>Events</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analytics.platformBreakdown.map((row) => (
                                                <tr key={row.platform}>
                                                    <td className="admin-table-label">
                                                        {row.platform}
                                                    </td>
                                                    <td>{formatNumber(row.trackedActors)}</td>
                                                    <td>{formatNumber(row.totalSessions)}</td>
                                                    <td>{formatNumber(row.totalEvents)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="utility-card">
                                <div className="utility-card-header">
                                    <h2 className="utility-card-title">
                                        Funnel trend ({analytics.trendDays}d)
                                    </h2>
                                </div>
                                <div className="admin-table-wrap">
                                    <table className="admin-table admin-table-wide">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Landing</th>
                                                <th>Signup start</th>
                                                <th>Signup complete</th>
                                                <th>Login complete</th>
                                                <th>Feed viewers</th>
                                                <th>Engaged feed</th>
                                                <th>Activated</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analytics.funnelTrend.map((row) => (
                                                <tr key={row.date}>
                                                    <td className="admin-table-label">
                                                        {formatShortDate(row.date)}
                                                    </td>
                                                    <td>{formatNumber(row.landingViewers)}</td>
                                                    <td>{formatNumber(row.signupStarters)}</td>
                                                    <td>{formatNumber(row.signupCompleters)}</td>
                                                    <td>{formatNumber(row.loginCompleters)}</td>
                                                    <td>{formatNumber(row.feedViewers)}</td>
                                                    <td>{formatNumber(row.engagedFeedUsers)}</td>
                                                    <td>{formatNumber(row.activatedUsers)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="utility-card">
                                <div className="utility-card-header">
                                    <h2 className="utility-card-title">
                                        Most active actors ({analytics.windowDays}d)
                                    </h2>
                                </div>
                                <div className="admin-table-wrap">
                                    <table className="admin-table admin-table-wide">
                                        <thead>
                                            <tr>
                                                <th>Actor</th>
                                                <th>Events</th>
                                                <th>Sessions</th>
                                                <th>Reads</th>
                                                <th>Saves</th>
                                                <th>Upvotes</th>
                                                <th>Follows</th>
                                                <th>Feedback</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analytics.topActors.map((row) => (
                                                <tr key={row.actorId}>
                                                    <td className="admin-table-label admin-actor-id">
                                                        {shortActorId(row.actorId)}
                                                    </td>
                                                    <td>{formatNumber(row.totalEvents)}</td>
                                                    <td>{formatNumber(row.totalSessions)}</td>
                                                    <td>{formatNumber(row.postReads)}</td>
                                                    <td>{formatNumber(row.saves)}</td>
                                                    <td>{formatNumber(row.upvotes)}</td>
                                                    <td>{formatNumber(row.follows)}</td>
                                                    <td>
                                                        {formatNumber(row.feedbackSubmissions)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </>
                    ) : null}
                </div>
            </main>

            <aside className="right-sidebar">
                <div className="right-card right-new-section page-side-note admin-side-note">
                    <h2 className="page-side-note-title">Admin surface</h2>
                    <p className="page-side-note-text">
                        The left-nav Admin button only appears for allowlisted users.
                    </p>
                    <p className="page-side-note-text">
                        Admin access currently includes the repo allowlist, and you can
                        extend it with <code>ADMIN_USER_EMAILS</code> or{" "}
                        <code>ADMIN_USER_IDS</code> on the server.
                    </p>
                    {analytics && (
                        <p className="page-side-note-text">
                            Last refreshed: {formatGeneratedAt(analytics.generatedAt)}
                        </p>
                    )}
                </div>
            </aside>
        </div>
    );
}
