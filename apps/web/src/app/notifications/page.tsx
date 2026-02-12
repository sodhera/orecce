import Sidebar from "@/components/Sidebar";

const NOTIFICATIONS = [
    {
        id: "n-1",
        title: "Your saved collection reached 100 reads",
        context: "Underrated Inventors",
        time: "2m ago",
        unread: true,
    },
    {
        id: "n-2",
        title: "New biography posts are available in Tech History",
        context: "Category update",
        time: "18m ago",
        unread: true,
    },
    {
        id: "n-3",
        title: "A profile you follow published a new trivia thread",
        context: "@ada",
        time: "1h ago",
        unread: false,
    },
    {
        id: "n-4",
        title: "Your draft was auto-saved successfully",
        context: "Post composer",
        time: "3h ago",
        unread: false,
    },
];

export default function NotificationsPage() {
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="feed">
                <div className="feed-header">
                    <div className="feed-header-top">
                        <h1>Notifications</h1>
                        <p className="utility-page-intro">
                            Keep track of activity from your feed, saves, and
                            followed profiles.
                        </p>
                    </div>
                </div>

                <div className="utility-page-body">
                    <section className="utility-card">
                        <h2 className="utility-card-title">Recent activity</h2>
                        <div className="notification-list">
                            {NOTIFICATIONS.map((notification) => (
                                <article
                                    key={notification.id}
                                    className={`notification-item ${
                                        notification.unread ? "unread" : ""
                                    }`}
                                >
                                    <span
                                        className="notification-dot"
                                        aria-hidden={!notification.unread}
                                    />
                                    <div className="notification-content">
                                        <p className="notification-item-title">
                                            {notification.title}
                                        </p>
                                        <p className="notification-item-meta">
                                            {notification.context} •{" "}
                                            {notification.time}
                                        </p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                </div>
            </main>

            <aside className="right-sidebar">
                <div className="right-card right-new-section page-side-note">
                    <h2 className="page-side-note-title">Notification settings</h2>
                    <p className="page-side-note-text">
                        Choose which updates matter most so your inbox stays
                        focused and useful.
                    </p>
                </div>
            </aside>
        </div>
    );
}
