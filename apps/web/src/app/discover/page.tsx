import Link from "next/link";
import Sidebar from "@/components/Sidebar";

const TRENDING_TOPICS = [
    "AI biographies",
    "Tech origin stories",
    "Startup pivots",
    "Future of health",
    "Creator economics",
    "Space innovation",
];

const FEATURED_COLLECTIONS = [
    {
        title: "Underrated Inventors",
        summary: "12 short profiles of innovators who changed daily life.",
    },
    {
        title: "Product Lessons From Famous Failures",
        summary: "A look at big bets that missed and what teams learned.",
    },
    {
        title: "Founders Before Their First Win",
        summary: "Early setbacks and habits from well-known builders.",
    },
];

export default function DiscoverPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="feed">
                <div className="feed-header">
                    <div className="feed-header-top">
                        <h1>Discover</h1>
                        <p className="utility-page-intro">
                            Find new topics, people, and collections personalized
                            for your interests.
                        </p>
                    </div>
                </div>

                <div className="utility-page-body">
                    <section className="utility-card">
                        <h2 className="utility-card-title">Trending now</h2>
                        <div className="discover-chip-row">
                            {TRENDING_TOPICS.map((topic) => (
                                <button
                                    key={topic}
                                    type="button"
                                    className="discover-chip"
                                >
                                    {topic}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="utility-card">
                        <h2 className="utility-card-title">Featured collections</h2>
                        <div className="discover-list">
                            {FEATURED_COLLECTIONS.map((collection) => (
                                <article
                                    key={collection.title}
                                    className="discover-list-item"
                                >
                                    <div>
                                        <p className="discover-item-title">
                                            {collection.title}
                                        </p>
                                        <p className="discover-item-summary">
                                            {collection.summary}
                                        </p>
                                    </div>
                                    <Link href="/" className="utility-link">
                                        Open feed
                                    </Link>
                                </article>
                            ))}
                        </div>
                    </section>
                </div>
            </main>

            <aside className="right-sidebar">
                <div className="right-card right-new-section page-side-note">
                    <h2 className="page-side-note-title">Discovery tips</h2>
                    <p className="page-side-note-text">
                        Follow 3-5 topics to improve your feed quality and get
                        better recommendations faster.
                    </p>
                </div>
            </aside>
        </div>
    );
}
