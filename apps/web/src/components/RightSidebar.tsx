"use client";

interface RightSidebarProps {
    mode: string;
    onModeChange: (mode: string) => void;
    profile: string;
    onProfileChange: (profile: string) => void;
}

export default function RightSidebar(_: RightSidebarProps) {
    return (
        <aside className="right-sidebar">
            <div className="right-card right-new-section">
                <h2 className="right-card-title">Something new</h2>
                <div className="right-new-content">
                    <p className="right-new-text">
                        A fresh discovery experience is on the way, with richer
                        recommendations and smarter topic exploration.
                    </p>
                    <button className="right-new-btn" type="button">
                        Coming soon
                    </button>
                </div>
            </div>
        </aside>
    );
}
