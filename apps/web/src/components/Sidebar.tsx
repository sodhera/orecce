"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

type ThemeMode = "dark" | "light";

const navItems: Array<{ label: string; icon: ReactNode; href?: string }> = [
    {
        label: "Home",
        href: "/",
        icon: (
            <svg viewBox="0 0 24 24">
                <path d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913h5.8a.93.93 0 00.929-.913v-7.075h3.68v7.075c0 .502.418.913.929.913h5.8a.93.93 0 00.929-.913V7.903c0-.3-.149-.584-.409-.757z" />
            </svg>
        ),
    },
    {
        label: "Discover",
        icon: (
            <svg viewBox="0 0 24 24">
                <path d="M10.5 10.5l7.5-3.5-3.5 7.5-7.5 3.5 3.5-7.5zm1.1 1.1l-1.8 3.9 3.9-1.8 1.8-3.9-3.9 1.8z" />
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16z" />
            </svg>
        ),
    },
    {
        label: "Saved",
        href: "/saved",
        icon: (
            <svg viewBox="0 0 24 24">
                <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z" />
            </svg>
        ),
    },
    {
        label: "Notifications",
        icon: (
            <svg viewBox="0 0 24 24">
                <path d="M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.437-1.718 4.9-4h4.236l-1.143-8.958zM12 20c-1.306 0-2.417-.835-2.829-2h5.658c-.412 1.165-1.523 2-2.829 2zm-6.866-4l.847-6.698C6.364 6.272 8.941 4 11.996 4s5.627 2.268 6.013 5.295L18.858 16H5.134z" />
            </svg>
        ),
    },
];

export default function Sidebar() {
    const { isAuthenticated, user, setShowAuthModal, logout } = useAuth();
    const pathname = usePathname();
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showSecurityTip, setShowSecurityTip] = useState(true);
    const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
    const userMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem("orecce-theme");
        const initialTheme: ThemeMode = saved === "light" ? "light" : "dark";
        setThemeMode(initialTheme);
    }, []);

    useEffect(() => {
        document.body.dataset.theme = themeMode;
        localStorage.setItem("orecce-theme", themeMode);
    }, [themeMode]);

    useEffect(() => {
        if (!showUserMenu) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (
                userMenuRef.current &&
                !userMenuRef.current.contains(event.target as Node)
            ) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showUserMenu]);

    const openProfileScreen = () => {
        if (!isAuthenticated) {
            setShowAuthModal(true);
            return;
        }
        setShowUserMenu(false);
        setShowSecurityTip(true);
        setShowProfileModal(true);
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <span
                    style={{
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: "-0.5px",
                    }}
                >
                    Orecce
                </span>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => {
                    const isActive = item.href
                        ? item.href === "/"
                            ? pathname === "/"
                            : pathname.startsWith(item.href)
                        : false;
                    const className = `nav-item ${isActive ? "active" : ""}`;

                    return item.href ? (
                        <Link key={item.label} href={item.href} className={className}>
                            {item.icon}
                            <span>{item.label}</span>
                        </Link>
                    ) : (
                        <a key={item.label} href="#" className={className}>
                            {item.icon}
                            <span>{item.label}</span>
                        </a>
                    );
                })}
            </nav>

            {/* Bottom section: auth-dependent */}
            {isAuthenticated ? (
                <div className="sidebar-profile-wrapper" ref={userMenuRef}>
                    {showUserMenu && (
                        <div className="profile-modal">
                            <button
                                type="button"
                                className="profile-modal-item"
                                onClick={openProfileScreen}
                            >
                                <svg viewBox="0 0 24 24" className="profile-modal-item-icon">
                                    <path d="M19.14 12.94a7.98 7.98 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.9 7.9 0 00-1.62-.94l-.36-2.54A.5.5 0 0013.91 2h-3.82a.5.5 0 00-.49.42l-.36 2.54a7.9 7.9 0 00-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.71 8.84a.5.5 0 00.12.64l2.03 1.58a7.98 7.98 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.82a.5.5 0 00.49-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" />
                                </svg>
                                Settings
                            </button>
                            <div className="profile-modal-divider" />
                            <button
                                type="button"
                                className="profile-modal-item"
                                onClick={() =>
                                    setThemeMode((prev) =>
                                        prev === "dark" ? "light" : "dark",
                                    )
                                }
                            >
                                {themeMode === "dark" ? (
                                    <svg viewBox="0 0 24 24" className="profile-modal-item-icon">
                                        <path d="M12 4.5a1 1 0 011-1V1.75a1 1 0 10-2 0V3.5a1 1 0 011 1zm0 15a1 1 0 011 1v1.75a1 1 0 11-2 0V20.5a1 1 0 011-1zM5.47 6.88a1 1 0 011.41 0l1.24 1.24a1 1 0 01-1.41 1.41L5.47 8.29a1 1 0 010-1.41zm11.65 11.65a1 1 0 011.41 0l1.24 1.24a1 1 0 01-1.41 1.41l-1.24-1.24a1 1 0 010-1.41zM4.5 12a1 1 0 01-1 1H1.75a1 1 0 110-2H3.5a1 1 0 011 1zm19.5 0a1 1 0 01-1 1h-1.75a1 1 0 110-2H23a1 1 0 011 1zM6.88 18.53a1 1 0 010-1.41l1.24-1.24a1 1 0 011.41 1.41l-1.24 1.24a1 1 0 01-1.41 0zM18.53 5.47a1 1 0 010 1.41l-1.24 1.24a1 1 0 11-1.41-1.41l1.24-1.24a1 1 0 011.41 0zM12 7a5 5 0 100 10 5 5 0 000-10z" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" className="profile-modal-item-icon">
                                        <path d="M19.29 15.18A8 8 0 018.82 4.71a.75.75 0 00-.94-.94A10 10 0 1019.29 15.18z" />
                                    </svg>
                                )}
                                {themeMode === "dark" ? "Light mode" : "Dark mode"}
                            </button>
                            <div className="profile-modal-divider" />
                            <button
                                type="button"
                                className="profile-modal-item"
                                onClick={async () => {
                                    setShowUserMenu(false);
                                    await logout();
                                }}
                            >
                                <svg viewBox="0 0 24 24" className="profile-modal-item-icon">
                                    <path d="M16 13v-2H7V8l-5 4 5 4v-3z" />
                                    <path d="M20 3h-9c-1.103 0-2 .897-2 2v4h2V5h9v14h-9v-4H9v4c0 1.103.897 2 2 2h9c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2z" />
                                </svg>
                                Log out
                            </button>
                        </div>
                    )}
                    <button
                        type="button"
                        className="sidebar-profile"
                        onClick={() => setShowUserMenu((prev) => !prev)}
                    >
                        <div className="profile-avatar">
                            {user?.name?.charAt(0).toUpperCase() || "O"}
                        </div>
                        <div className="profile-info">
                            <div className="profile-name">
                                {user?.name || "Orecce"}
                            </div>
                            <div className="profile-handle">
                                @{user?.name?.toLowerCase().replace(/\s+/g, "") || "orecce"}
                            </div>
                        </div>
                        <span className="profile-more">···</span>
                    </button>
                </div>
            ) : (
                <button
                    className="sidebar-auth-btn"
                    onClick={() => setShowAuthModal(true)}
                >
                    Log in / Sign up
                </button>
            )}

            {isAuthenticated && showProfileModal && (
                <div
                    className="auth-overlay profile-settings-overlay"
                    onClick={() => setShowProfileModal(false)}
                >
                    <div
                        className="profile-settings-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <aside className="profile-settings-nav">
                            <button
                                className="profile-settings-close"
                                onClick={() => setShowProfileModal(false)}
                                aria-label="Close profile settings"
                            >
                                ✕
                            </button>

                            <div className="profile-settings-nav-list">
                                <button
                                    className="profile-settings-nav-item active"
                                    type="button"
                                >
                                    <svg viewBox="0 0 24 24">
                                        <path d="M19.14 12.94a7.98 7.98 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.9 7.9 0 00-1.62-.94l-.36-2.54A.5.5 0 0013.91 2h-3.82a.5.5 0 00-.49.42l-.36 2.54a7.9 7.9 0 00-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.71 8.84a.5.5 0 00.12.64l2.03 1.58a7.98 7.98 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.82a.5.5 0 00.49-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" />
                                    </svg>
                                    General
                                </button>
                                <button className="profile-settings-nav-item" type="button">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M19.993 9.042C19.48 5.017 16.054 2 11.996 2s-7.49 3.021-7.999 7.051L2.866 18H7.1c.463 2.282 2.481 4 4.9 4s4.437-1.718 4.9-4h4.236l-1.143-8.958z" />
                                    </svg>
                                    Notifications
                                </button>
                                <button className="profile-settings-nav-item" type="button">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5v5.17l3.59 2.13-.75 1.23L11.5 13V7H13z" />
                                    </svg>
                                    Personalization
                                </button>
                                <button className="profile-settings-nav-item" type="button">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M7 3h4v4H7V3zm6 0h4v4h-4V3zM7 9h4v4H7V9zm6 0h4v4h-4V9zM7 15h4v4H7v-4zm6 0h4v4h-4v-4z" />
                                    </svg>
                                    Apps
                                </button>
                                <button className="profile-settings-nav-item" type="button">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5v6l4 2-.8 1.4L11 13.7V7h2z" />
                                    </svg>
                                    Schedules
                                </button>
                                <button className="profile-settings-nav-item" type="button">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M12 2l7 3v6c0 5.25-3.44 9.83-7 11-3.56-1.17-7-5.75-7-11V5l7-3zm0 3.2L7 7v4c0 3.92 2.44 7.46 5 8.64 2.56-1.18 5-4.72 5-8.64V7l-5-1.8z" />
                                    </svg>
                                    Data controls
                                </button>
                                <button className="profile-settings-nav-item" type="button">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M12 1l9 4v6c0 5.8-3.8 10.88-9 12-5.2-1.12-9-6.2-9-12V5l9-4zm0 3.2L5 7v4c0 4.6 2.9 8.88 7 10 4.1-1.12 7-5.4 7-10V7l-7-2.8z" />
                                    </svg>
                                    Security
                                </button>
                                <button className="profile-settings-nav-item" type="button">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M16 11a4 4 0 10-8 0 4 4 0 008 0zm-4 6c-4.42 0-8 1.79-8 4v1h16v-1c0-2.21-3.58-4-8-4z" />
                                    </svg>
                                    Account
                                </button>
                            </div>
                        </aside>

                        <section className="profile-settings-content">
                            <h2 className="profile-settings-title">General</h2>

                            {showSecurityTip && (
                                <div className="profile-settings-security-card">
                                    <button
                                        className="profile-settings-security-close"
                                        type="button"
                                        aria-label="Dismiss card"
                                        onClick={() => setShowSecurityTip(false)}
                                    >
                                        ✕
                                    </button>
                                    <div className="profile-settings-security-icon-wrap">
                                        <svg viewBox="0 0 24 24">
                                            <path d="M12 1l8 4v6c0 5.2-3.4 9.72-8 11-4.6-1.28-8-5.8-8-11V5l8-4zm0 3.2L6 7v4c0 3.9 2.4 7.35 6 8.56 3.6-1.21 6-4.66 6-8.56V7l-6-2.8zm0 2.8a3 3 0 013 3v1h1v6H8v-6h1v-1a3 3 0 013-3zm-1 4h2v-1a1 1 0 10-2 0v1z" />
                                        </svg>
                                    </div>
                                    <h3>Secure your account</h3>
                                    <p>
                                        Add multi-factor authentication (MFA), like a passkey
                                        or text message, to help protect your account.
                                    </p>
                                    <button
                                        className="profile-settings-ghost-btn"
                                        type="button"
                                    >
                                        Set up MFA
                                    </button>
                                </div>
                            )}

                            <div className="profile-settings-row">
                                <span>Appearance</span>
                                <span>System ▾</span>
                            </div>
                            <div className="profile-settings-row">
                                <span>Accent color</span>
                                <span>Default ▾</span>
                            </div>
                            <div className="profile-settings-row">
                                <span>Language</span>
                                <span>Auto-detect ▾</span>
                            </div>
                            <div className="profile-settings-row">
                                <div>
                                    <div>Account</div>
                                    <p className="profile-settings-row-subtext">
                                        {user?.email || ""}
                                    </p>
                                </div>
                                <span>Manage ▾</span>
                            </div>
                            <div className="profile-settings-row">
                                <span>Sign out</span>
                                <button
                                    className="profile-settings-signout"
                                    type="button"
                                    onClick={async () => {
                                        setShowProfileModal(false);
                                        await logout();
                                    }}
                                >
                                    Log out
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </aside>
    );
}
