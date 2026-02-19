"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AiFillHome, AiOutlineHome } from "react-icons/ai";
import { BsBookmark, BsBookmarkFill } from "react-icons/bs";
import {
    IoChatbubbleEllipsesOutline,
    IoLogOutOutline,
    IoMoonOutline,
    IoNotifications,
    IoNotificationsOutline,
    IoSettingsOutline,
    IoSparklesOutline,
    IoSparkles,
    IoSunnyOutline,
} from "react-icons/io5";
import { MdExplore, MdOutlineExplore } from "react-icons/md";
import { MdSportsSoccer } from "react-icons/md";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

const navItems: Array<{
    label: string;
    href?: string;
    iconOutline: ReactNode;
    iconFilled?: ReactNode;
}> = [
    {
        label: "Home",
        href: "/",
        iconOutline: <AiOutlineHome aria-hidden="true" />,
        iconFilled: <AiFillHome aria-hidden="true" />,
    },
    {
        label: "Sports",
        href: "/sports",
        iconOutline: <MdSportsSoccer aria-hidden="true" />,
        iconFilled: <MdSportsSoccer aria-hidden="true" />,
    },
    {
        label: "AI News",
        href: "/ai-news",
        iconOutline: <IoSparklesOutline aria-hidden="true" />,
        iconFilled: <IoSparkles aria-hidden="true" />,
    },
    {
        label: "Discover",
        href: "/discover",
        iconOutline: <MdOutlineExplore aria-hidden="true" />,
        iconFilled: <MdExplore aria-hidden="true" />,
    },
    {
        label: "Saved",
        href: "/saved",
        iconOutline: <BsBookmark aria-hidden="true" />,
        iconFilled: <BsBookmarkFill aria-hidden="true" />,
    },
    {
        label: "Notifications",
        href: "/notifications",
        iconOutline: <IoNotificationsOutline aria-hidden="true" />,
        iconFilled: <IoNotifications aria-hidden="true" />,
    },
    {
        label: "Feedback",
        href: "mailto:feedback@orecce.app?subject=Orecce%20Web%20Feedback",
        iconOutline: <IoChatbubbleEllipsesOutline aria-hidden="true" />,
    },
];

export default function Sidebar() {
    const { isAuthenticated, user, setShowAuthModal, logout } = useAuth();
    const { themeMode, toggleTheme } = useTheme();
    const pathname = usePathname();
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [showSecurityTip, setShowSecurityTip] = useState(true);
    const userMenuRef = useRef<HTMLDivElement | null>(null);

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

    useEffect(() => {
        document.body.classList.toggle("sidebar-user-menu-open", showUserMenu);
        return () => {
            document.body.classList.remove("sidebar-user-menu-open");
        };
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

    const openLogoutConfirm = (closeProfileModal = false) => {
        setShowUserMenu(false);
        if (closeProfileModal) {
            setShowProfileModal(false);
        }
        setShowLogoutConfirm(true);
    };

    const handleConfirmLogout = async () => {
        if (isLoggingOut) {
            return;
        }
        setIsLoggingOut(true);
        try {
            setShowUserMenu(false);
            setShowProfileModal(false);
            await logout();
            setShowLogoutConfirm(false);
        } finally {
            setIsLoggingOut(false);
        }
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
                    const icon =
                        isActive && item.iconFilled
                            ? item.iconFilled
                            : item.iconOutline;

                    return item.href?.startsWith("mailto:") ? (
                        <a key={item.label} href={item.href} className={className}>
                            {icon}
                            <span>{item.label}</span>
                        </a>
                    ) : item.href ? (
                        <Link key={item.label} href={item.href} className={className}>
                            {icon}
                            <span>{item.label}</span>
                        </Link>
                    ) : (
                        <a key={item.label} href="#" className={className}>
                            {icon}
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
                                <IoSettingsOutline
                                    aria-hidden="true"
                                    className="profile-modal-item-icon"
                                />
                                Settings
                            </button>
                            <div className="profile-modal-divider" />
                            <button
                                type="button"
                                className="profile-modal-item"
                                onClick={toggleTheme}
                            >
                                {themeMode === "dark" ? (
                                    <IoSunnyOutline
                                        aria-hidden="true"
                                        className="profile-modal-item-icon"
                                    />
                                ) : (
                                    <IoMoonOutline
                                        aria-hidden="true"
                                        className="profile-modal-item-icon"
                                    />
                                )}
                                {themeMode === "dark" ? "Light mode" : "Dark mode"}
                            </button>
                            <div className="profile-modal-divider" />
                            <button
                                type="button"
                                className="profile-modal-item profile-modal-item-danger"
                                onClick={() => openLogoutConfirm()}
                            >
                                <IoLogOutOutline
                                    aria-hidden="true"
                                    className="profile-modal-item-icon profile-modal-item-icon-danger"
                                />
                                Log out
                            </button>
                        </div>
                    )}
                    <button
                        type="button"
                        className={`sidebar-profile ${showUserMenu ? "menu-open" : ""}`}
                        onClick={(event) => {
                            const nextOpen = !showUserMenu;
                            setShowUserMenu(nextOpen);
                            if (nextOpen) {
                                event.currentTarget.blur();
                            }
                        }}
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
                                    onClick={() => openLogoutConfirm(true)}
                                >
                                    Log out
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {isAuthenticated && showLogoutConfirm && (
                <div
                    className="auth-overlay logout-confirm-overlay"
                    onClick={() =>
                        !isLoggingOut && setShowLogoutConfirm(false)
                    }
                >
                    <div
                        className="logout-confirm-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="logout-confirm-brand" aria-hidden="true">
                            O
                        </div>
                        <h2 className="logout-confirm-title">Log out of Orecce?</h2>
                        <p className="logout-confirm-text">
                            You can log back in at any time. If you only want to
                            switch accounts, add another existing account instead.
                        </p>
                        <button
                            type="button"
                            className="logout-confirm-btn logout-confirm-btn-primary"
                            onClick={handleConfirmLogout}
                            disabled={isLoggingOut}
                        >
                            {isLoggingOut ? "Logging out..." : "Log out"}
                        </button>
                        <button
                            type="button"
                            className="logout-confirm-btn logout-confirm-btn-secondary"
                            onClick={() => setShowLogoutConfirm(false)}
                            disabled={isLoggingOut}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
}
