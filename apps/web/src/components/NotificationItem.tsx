import Link from "next/link";
import { IoCheckmark, IoCheckmarkDone } from "react-icons/io5";

export interface NotificationItemData {
    id: string;
    title: string;
    context: string;
    time: string;
    unread?: boolean;
    href?: string;
}

interface NotificationItemProps {
    notification: NotificationItemData;
    onMarkRead?: (notificationId: string) => void;
}

export default function NotificationItem({
    notification,
    onMarkRead,
}: NotificationItemProps) {
    const isUnread = !!notification.unread;
    const className = `notification-item ${isUnread ? "unread" : ""}`;

    const content = (
        <>
            <span
                className="notification-dot"
                aria-hidden={!notification.unread}
            />
            <div className="notification-content">
                <p className="notification-item-title">{notification.title}</p>
                <p className="notification-item-meta">
                    {notification.context} • {notification.time}
                </p>
            </div>
        </>
    );

    const mainContent = notification.href ? (
        <Link href={notification.href} className="notification-main notification-link">
            {content}
        </Link>
    ) : (
        <div className="notification-main">{content}</div>
    );

    return (
        <article className={className}>
            {mainContent}
            <button
                type="button"
                className={`notification-read-toggle ${isUnread ? "unread" : "read"}`}
                onClick={() => onMarkRead?.(notification.id)}
                aria-label={
                    isUnread
                        ? "Mark notification as read"
                        : "Notification already read"
                }
                disabled={!isUnread}
            >
                {isUnread ? (
                    <IoCheckmark aria-hidden="true" />
                ) : (
                    <IoCheckmarkDone aria-hidden="true" />
                )}
            </button>
        </article>
    );
}
