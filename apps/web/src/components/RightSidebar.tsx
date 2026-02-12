"use client";

<<<<<<< HEAD
=======
import { useAuth } from "@/context/AuthContext";

const MODES = [
    {
        value: "BIOGRAPHY",
        label: "Biography",
        icon: "📖",
        desc: "Stories about real people",
    },
    {
        value: "TRIVIA",
        label: "Trivia",
        icon: "🧠",
        desc: "Fascinating facts",
    },
    {
        value: "NICHE",
        label: "Niche",
        icon: "🎯",
        desc: "Deep dives into topics",
    },
    {
        value: "NEWS",
        label: "News",
        icon: "📰",
        desc: "Live articles from sources",
    },
];

const SUGGESTED_PROFILES: Record<string, string[]> = {
    BIOGRAPHY: [
        "Steve Jobs",
        "Elon Musk",
        "Ada Lovelace",
        "Nikola Tesla",
        "Marie Curie",
    ],
    TRIVIA: ["Space", "History", "Science", "Technology", "Nature"],
    NICHE: [
        "Retro Computing",
        "Mechanical Keyboards",
        "Coffee Brewing",
        "Urban Exploration",
        "Film Photography",
    ],
    NEWS: [],
};

>>>>>>> cc691e347f8757d292badc0220d99f14e89bab5d
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
<<<<<<< HEAD
=======
            )}

            {/* Mode Selector */}
            <div className="right-card">
                <h2 className="right-card-title">Post Type</h2>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                    }}
                >
                    {MODES.map((m) => (
                        <button
                            key={m.value}
                            onClick={() => {
                                onModeChange(m.value);
                                const defaults = SUGGESTED_PROFILES[m.value];
                                onProfileChange(defaults?.[0] ?? "");
                            }}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 12px",
                                borderRadius: 12,
                                border:
                                    mode === m.value
                                        ? "1px solid #1d9bf0"
                                        : "1px solid var(--border)",
                                background:
                                    mode === m.value
                                        ? "rgba(29,155,240,0.1)"
                                        : "transparent",
                                cursor: "pointer",
                                textAlign: "left",
                                color: "var(--text-primary)",
                                transition: "all 0.2s",
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{m.icon}</span>
                            <div>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        fontSize: 14,
                                        color:
                                            mode === m.value
                                                ? "#1d9bf0"
                                                : "var(--text-primary)",
                                    }}
                                >
                                    {m.label}
                                </div>
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "var(--text-secondary)",
                                    }}
                                >
                                    {m.desc}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Profile / Topic Selector */}
            {mode !== "NEWS" ? (
                <div className="right-card">
                    <h2 className="right-card-title">
                        {mode === "BIOGRAPHY" ? "Person" : "Topic"}
                    </h2>
                    <input
                        type="text"
                        value={profile}
                        onChange={(e) => onProfileChange(e.target.value)}
                        placeholder={
                            mode === "BIOGRAPHY"
                                ? "Enter a name…"
                                : "Enter a topic…"
                        }
                        style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 9999,
                            border: "1px solid var(--border)",
                            background: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                            fontSize: 14,
                            outline: "none",
                            boxSizing: "border-box",
                            marginBottom: 10,
                        }}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {suggestions.map((s) => (
                            <button
                                key={s}
                                onClick={() => onProfileChange(s)}
                                style={{
                                    padding: "5px 12px",
                                    borderRadius: 9999,
                                    border:
                                        profile === s
                                            ? "1px solid #1d9bf0"
                                            : "1px solid var(--border)",
                                    background:
                                        profile === s
                                            ? "rgba(29,155,240,0.1)"
                                            : "transparent",
                                    color:
                                        profile === s
                                            ? "#1d9bf0"
                                            : "var(--text-secondary)",
                                    fontSize: 13,
                                    cursor: "pointer",
                                    fontWeight: profile === s ? 700 : 400,
                                    transition: "all 0.2s",
                                }}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="right-card">
                    <h2 className="right-card-title">News Sources</h2>
                    <p
                        style={{
                            color: "var(--text-secondary)",
                            fontSize: 13,
                            lineHeight: 1.5,
                        }}
                    >
                        Use the source dropdown in the main feed to choose
                        which publisher&apos;s articles to display.
                    </p>
                </div>
            )}

            {/* Footer */}
            <div className="right-footer">
                <a href="#">Terms of Service</a>
                <a href="#">Privacy Policy</a>
                <a href="#">Cookie Policy</a>
                <a href="#">Accessibility</a>
                <a href="#">Ads info</a>
                <a href="#">More</a>
                <a href="#">© 2026 Orecce</a>
>>>>>>> cc691e347f8757d292badc0220d99f14e89bab5d
            </div>
        </aside>
    );
}
