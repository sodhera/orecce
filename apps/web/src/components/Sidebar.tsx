"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AiFillHome, AiOutlineHome } from "react-icons/ai";
import { BsBookmark, BsBookmarkFill, BsHeart, BsHeartFill } from "react-icons/bs";
import {
    IoChatbubbleEllipsesOutline,
    IoLogOutOutline,
    IoNotifications,
    IoNotificationsOutline,
    IoSettingsOutline,
} from "react-icons/io5";
import { MdExplore, MdOutlineExplore } from "react-icons/md";
import ThemeToggle from "@/components/landing/ThemeToggle";
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
            href: "/feed",
            iconOutline: <AiOutlineHome aria-hidden="true" />,
            iconFilled: <AiFillHome aria-hidden="true" />,
        },
        {
            label: "Discover",
            href: "/discover",
            iconOutline: <MdOutlineExplore aria-hidden="true" />,
            iconFilled: <MdExplore aria-hidden="true" />,
        },
        {
            label: "Liked",
            href: "/liked",
            iconOutline: <BsHeart aria-hidden="true" />,
            iconFilled: <BsHeartFill aria-hidden="true" />,
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
            href: "/feedback",
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
        <>
            <div
                style={{
                    position: "fixed",
                    top: 12,
                    left: 12,
                    zIndex: 70,
                }}
            >
                <ThemeToggle
                    isDark={themeMode === "dark"}
                    toggleTheme={toggleTheme}
                />
            </div>
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
                            ? pathname === item.href || pathname.startsWith(`${item.href}/`)
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
                            <section className="profile-settings-content" style={{ width: "100%" }}>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        gap: 12,
                                        marginBottom: 6,
                                    }}
                                >
                                    <h2
                                        className="profile-settings-title"
                                        style={{ marginBottom: 0, paddingBottom: 0 }}
                                    >
                                        Settings
                                    </h2>
                                    <button
                                        className="profile-settings-close"
                                        onClick={() => setShowProfileModal(false)}
                                        aria-label="Close profile settings"
                                        type="button"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="profile-settings-row">
                                    <span>Theme</span>
                                    <ThemeToggle
                                        isDark={themeMode === "dark"}
                                        toggleTheme={toggleTheme}
                                    />
                                </div>

                                <div className="profile-settings-row">
                                    <div>
                                        <div>Account email</div>
                                        <p className="profile-settings-row-subtext">
                                            {user?.email || "No email available"}
                                        </p>
                                    </div>
                                </div>

                                <div className="profile-settings-row" style={{ borderBottom: "none" }}>
                                    <button
                                        className="profile-settings-signout profile-settings-signout-danger"
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
        </>
    );
}
