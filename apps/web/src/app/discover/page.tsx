"use client";

import Sidebar from "@/components/Sidebar";
import { useAuthors } from "@/hooks/useAuthors";
import { useAuth } from "@/context/AuthContext";

export default function DiscoverPage() {
    const { isAuthenticated } = useAuth();
    const { authors, followedIds, loading, error, toggleFollow } = useAuthors();

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
                        ) : authors.length === 0 ? (
                            <div className="authors-empty">
                                No recces available yet.
                            </div>
                        ) : (
                            <div className="authors-grid">
                                {authors.map((author) => {
                                    const isFollowed = followedIds.has(
                                        author.id,
                                    );
                                    return (
                                        <article
                                            key={author.id}
                                            className="author-card"
                                        >
                                            <div className="author-card-info">
                                                <h3 className="author-card-name">
                                                    {author.name}
                                                </h3>
                                                {author.bio && (
                                                    <p className="author-card-bio">
                                                        {author.bio}
                                                    </p>
                                                )}
                                            </div>
                                            {isAuthenticated && (
                                                <button
                                                    type="button"
                                                    className={`author-follow-btn ${isFollowed ? "following" : ""}`}
                                                    onClick={() =>
                                                        toggleFollow(author.id)
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
