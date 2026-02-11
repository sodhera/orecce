"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

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
        label: "Explore",
        icon: (
            <svg viewBox="0 0 24 24">
                <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z" />
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
        label: "Profile",
        icon: (
            <svg viewBox="0 0 24 24">
                <path d="M5.651 19h12.698c-.337-1.8-1.023-3.21-1.945-4.19C15.318 13.65 13.838 13 12 13s-3.317.65-4.404 1.81c-.922.98-1.608 2.39-1.945 4.19zm.486-5.56C7.627 11.85 9.648 11 12 11s4.373.85 5.863 2.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H3.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46zM12 4c-1.105 0-2 .9-2 2s.895 2 2 2 2-.9 2-2-.895-2-2-2zM8 6c0-2.21 1.791-4 4-4s4 1.79 4 4-1.791 4-4 4-4-1.79-4-4z" />
            </svg>
        ),
    },
];

export default function Sidebar() {
    const { isAuthenticated, user, setShowAuthModal, logout } = useAuth();
    const pathname = usePathname();
    const [showProfileModal, setShowProfileModal] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // Close modal when clicking outside
    useEffect(() => {
        if (!showProfileModal) return;
        function handleClickOutside(e: MouseEvent) {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setShowProfileModal(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showProfileModal]);

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
                <div className="sidebar-profile-wrapper" ref={profileRef}>
                    {showProfileModal && (
                        <div className="profile-modal">
                            <div className="profile-modal-header">
                                <div className="profile-modal-avatar">
                                    {user?.name?.charAt(0).toUpperCase() || "O"}
                                </div>
                                <div className="profile-modal-user">
                                    <div className="profile-modal-name">
                                        {user?.name || "Orecce"}
                                    </div>
                                    <div className="profile-modal-handle">
                                        @{user?.name?.toLowerCase().replace(/\s+/g, "") || "orecce"}
                                    </div>
                                </div>
                                <svg className="profile-modal-check" viewBox="0 0 24 24">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                </svg>
                            </div>

                            <div className="profile-modal-divider" />

                            <div className="profile-modal-email">
                                <svg viewBox="0 0 24 24" className="profile-modal-email-icon">
                                    <path d="M1.998 5.5c0-1.381 1.119-2.5 2.5-2.5h15c1.381 0 2.5 1.119 2.5 2.5v13c0 1.381-1.119 2.5-2.5 2.5h-15c-1.381 0-2.5-1.119-2.5-2.5v-13zm2.5-.5c-.276 0-.5.224-.5.5v2.764l8 3.638 8-3.636V5.5c0-.276-.224-.5-.5-.5h-15zm15.5 5.463l-8 3.636-8-3.638V18.5c0 .276.224.5.5.5h15c.276 0 .5-.224.5-.5v-8.037z" />
                                </svg>
                                <span>{user?.email || ""}</span>
                            </div>

                            <div className="profile-modal-divider" />

                            <button
                                className="profile-modal-item"
                                onClick={() => {
                                    setShowProfileModal(false);
                                    logout();
                                }}
                            >
                                <svg viewBox="0 0 24 24" className="profile-modal-item-icon">
                                    <path d="M16 13v-2H7V8l-5 4 5 4v-3z" />
                                    <path d="M20 3h-9c-1.103 0-2 .897-2 2v4h2V5h9v14h-9v-4H9v4c0 1.103.897 2 2 2h9c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2z" />
                                </svg>
                                Log out @{user?.name?.toLowerCase().replace(/\s+/g, "") || "orecce"}
                            </button>
                        </div>
                    )}
                    <div
                        className="sidebar-profile"
                        onClick={() => setShowProfileModal((v) => !v)}
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
                    </div>
                </div>
            ) : (
                <button
                    className="sidebar-auth-btn"
                    onClick={() => setShowAuthModal(true)}
                >
                    Log in / Sign up
                </button>
            )}
        </aside>
    );
}
