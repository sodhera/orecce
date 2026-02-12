"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import NotificationItem, {
    type NotificationItemData,
} from "@/components/NotificationItem";

const NOTIFICATIONS: NotificationItemData[] = [
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
    const [notifications, setNotifications] =
        useState<NotificationItemData[]>(NOTIFICATIONS);

    const handleMarkRead = (notificationId: string) => {
        setNotifications((currentNotifications) =>
            currentNotifications.map((notification) =>
                notification.id === notificationId
                    ? { ...notification, unread: false }
                    : notification,
            ),
        );
    };

    const handleClearAll = () => {
        setNotifications([]);
    };

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
                        <div className="utility-card-header">
                            <h2 className="utility-card-title">Recent activity</h2>
                            <button
                                type="button"
                                className="utility-card-action"
                                onClick={handleClearAll}
                                disabled={notifications.length === 0}
                            >
                                Clear all
                            </button>
                        </div>
                        <div className="notification-list">
                            {notifications.length === 0 ? (
                                <p className="notification-empty">
                                    No notifications right now.
                                </p>
                            ) : (
                                notifications.map((notification) => (
                                    <NotificationItem
                                        key={notification.id}
                                        notification={notification}
                                        onMarkRead={handleMarkRead}
                                    />
                                ))
                            )}
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
