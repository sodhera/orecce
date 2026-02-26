"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AiFillHome, AiOutlineHome } from "react-icons/ai";
import {
    BsBookmark,
    BsBookmarkFill,
    BsHeart,
    BsHeartFill,
    BsWhatsapp,
} from "react-icons/bs";
import {
    IoColorPaletteOutline,
    IoChatbubbleEllipsesOutline,
    IoLockClosedOutline,
    IoLogOutOutline,
    IoMailOutline,
    IoNotifications,
    IoNotificationsOutline,
    IoPersonCircleOutline,
    IoSettingsOutline,
} from "react-icons/io5";
import { MdExplore, MdOutlineExplore } from "react-icons/md";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { supabase } from "@/lib/supabaseClient";

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

type SettingsTab = "profile" | "password" | "appearance" | "notifications";
type NotificationChannel = "email" | "whatsapp";

interface SettingsNotice {
    type: "success" | "error";
    message: string;
}

const settingsNavItems: Array<{
    id: SettingsTab;
    label: string;
    icon: ReactNode;
}> = [
        {
            id: "profile",
            label: "Profile",
            icon: <IoPersonCircleOutline aria-hidden="true" />,
        },
        {
            id: "password",
            label: "Password",
            icon: <IoLockClosedOutline aria-hidden="true" />,
        },
        {
            id: "appearance",
            label: "Appearance",
            icon: <IoColorPaletteOutline aria-hidden="true" />,
        },
        {
            id: "notifications",
            label: "Notifications",
            icon: <IoNotificationsOutline aria-hidden="true" />,
        },
    ];

export default function Sidebar() {
    const { isAuthenticated, user, setShowAuthModal, logout } = useAuth();
    const { themeMode, themePreference, setThemePreference } = useTheme();
    const pathname = usePathname();
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("profile");
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [profileName, setProfileName] = useState("");
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [profileNotice, setProfileNotice] = useState<SettingsNotice | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [passwordNotice, setPasswordNotice] = useState<SettingsNotice | null>(null);
    const [notificationChannel, setNotificationChannel] = useState<NotificationChannel>("email");
    const [whatsappNumber, setWhatsappNumber] = useState("");
    const [isSavingNotifications, setIsSavingNotifications] = useState(false);
    const [notificationsNotice, setNotificationsNotice] = useState<SettingsNotice | null>(null);
    const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
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

    useEffect(() => {
        if (!isAuthenticated || !showProfileModal) return;

        let cancelled = false;
        const hydrateSettings = async () => {
            setSettingsLoadError(null);
            setProfileName(user?.name ?? "");
            try {
                const { data, error } = await supabase.auth.getUser();
                if (error) throw error;
                const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
                const savedName = typeof metadata.full_name === "string" && metadata.full_name.trim()
                    ? metadata.full_name.trim()
                    : typeof metadata.name === "string" && metadata.name.trim()
                        ? metadata.name.trim()
                        : (user?.name ?? "");
                const savedChannel = metadata.notification_channel === "whatsapp"
                    ? "whatsapp"
                    : "email";
                const savedWhatsapp = typeof metadata.whatsapp_number === "string"
                    ? metadata.whatsapp_number
                    : "";

                if (cancelled) return;
                setProfileName(savedName);
                setNotificationChannel(savedChannel);
                setWhatsappNumber(savedWhatsapp);
            } catch {
                if (cancelled) return;
                setSettingsLoadError("Could not load your latest settings. You can still make changes.");
            }
        };

        void hydrateSettings();

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, showProfileModal, user?.name]);

    const resetSettingsNotices = () => {
        setProfileNotice(null);
        setPasswordNotice(null);
        setNotificationsNotice(null);
    };

    const closeProfileSettings = () => {
        setShowProfileModal(false);
        setActiveSettingsTab("profile");
        setNewPassword("");
        setConfirmPassword("");
        setSettingsLoadError(null);
        resetSettingsNotices();
    };

    const openProfileScreen = () => {
        if (!isAuthenticated) {
            setShowAuthModal(true);
            return;
        }
        setShowUserMenu(false);
        setActiveSettingsTab("profile");
        setNewPassword("");
        setConfirmPassword("");
        setSettingsLoadError(null);
        resetSettingsNotices();
        setShowProfileModal(true);
    };

    const openLogoutConfirm = (closeProfileModal = false) => {
        setShowUserMenu(false);
        if (closeProfileModal) {
            closeProfileSettings();
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
            closeProfileSettings();
            await logout();
            setShowLogoutConfirm(false);
        } finally {
            setIsLoggingOut(false);
        }
    };

    const handleSaveProfile = async () => {
        const trimmedName = profileName.trim();
        if (!trimmedName) {
            setProfileNotice({ type: "error", message: "Display name cannot be empty." });
            return;
        }

        setIsSavingProfile(true);
        setProfileNotice(null);
        try {
            const { error } = await supabase.auth.updateUser({
                data: {
                    full_name: trimmedName,
                    name: trimmedName,
                },
            });
            if (error) throw error;
            setProfileName(trimmedName);
            setProfileNotice({ type: "success", message: "Profile updated." });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to update profile.";
            setProfileNotice({ type: "error", message });
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!newPassword.trim()) {
            setPasswordNotice({ type: "error", message: "Enter a new password." });
            return;
        }
        if (newPassword.length < 8) {
            setPasswordNotice({ type: "error", message: "Password must be at least 8 characters." });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordNotice({ type: "error", message: "Passwords do not match." });
            return;
        }

        setIsUpdatingPassword(true);
        setPasswordNotice(null);
        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });
            if (error) throw error;
            setNewPassword("");
            setConfirmPassword("");
            setPasswordNotice({ type: "success", message: "Password updated." });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to update password.";
            setPasswordNotice({ type: "error", message });
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const handleSaveNotifications = async () => {
        const normalizedWhatsapp = whatsappNumber.trim();
        if (notificationChannel === "whatsapp" && !normalizedWhatsapp) {
            setNotificationsNotice({
                type: "error",
                message: "Enter a WhatsApp number to use WhatsApp notifications.",
            });
            return;
        }

        setIsSavingNotifications(true);
        setNotificationsNotice(null);
        try {
            const { error } = await supabase.auth.updateUser({
                data: {
                    notification_channel: notificationChannel,
                    whatsapp_number: notificationChannel === "whatsapp" ? normalizedWhatsapp : null,
                },
            });
            if (error) throw error;
            setNotificationsNotice({ type: "success", message: "Notification preferences saved." });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to save notification preferences.";
            setNotificationsNotice({ type: "error", message });
        } finally {
            setIsSavingNotifications(false);
        }
    };

    const renderSettingsContent = () => {
        if (activeSettingsTab === "profile") {
            return (
                <>
                    <h2 className="profile-settings-title">Profile</h2>
                    <p className="profile-settings-section-intro">
                        Update your public display details.
                    </p>
                    <div className="profile-settings-form">
                        <label className="profile-settings-label" htmlFor="settings-display-name">
                            Display name
                        </label>
                        <input
                            id="settings-display-name"
                            className="profile-settings-input"
                            value={profileName}
                            onChange={(event) => setProfileName(event.target.value)}
                            placeholder="Your display name"
                            maxLength={80}
                        />

                        <label className="profile-settings-label" htmlFor="settings-email">
                            Account email
                        </label>
                        <input
                            id="settings-email"
                            className="profile-settings-input"
                            value={user?.email ?? ""}
                            disabled
                            readOnly
                        />

                        <button
                            type="button"
                            className="profile-settings-primary-btn"
                            onClick={() => {
                                void handleSaveProfile();
                            }}
                            disabled={isSavingProfile}
                        >
                            {isSavingProfile ? "Saving..." : "Save profile"}
                        </button>

                        {profileNotice && (
                            <p className={`profile-settings-inline-status is-${profileNotice.type}`}>
                                {profileNotice.message}
                            </p>
                        )}
                    </div>
                </>
            );
        }

        if (activeSettingsTab === "password") {
            return (
                <>
                    <h2 className="profile-settings-title">Password</h2>
                    <p className="profile-settings-section-intro">
                        Change your account password using Supabase authentication.
                    </p>
                    <div className="profile-settings-form">
                        <label className="profile-settings-label" htmlFor="settings-new-password">
                            New password
                        </label>
                        <input
                            id="settings-new-password"
                            type="password"
                            className="profile-settings-input"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                        />

                        <label className="profile-settings-label" htmlFor="settings-confirm-password">
                            Confirm new password
                        </label>
                        <input
                            id="settings-confirm-password"
                            type="password"
                            className="profile-settings-input"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="Re-enter new password"
                            autoComplete="new-password"
                        />

                        <button
                            type="button"
                            className="profile-settings-primary-btn"
                            onClick={() => {
                                void handleUpdatePassword();
                            }}
                            disabled={isUpdatingPassword}
                        >
                            {isUpdatingPassword ? "Updating..." : "Update password"}
                        </button>

                        {passwordNotice && (
                            <p className={`profile-settings-inline-status is-${passwordNotice.type}`}>
                                {passwordNotice.message}
                            </p>
                        )}
                    </div>
                </>
            );
        }

        if (activeSettingsTab === "appearance") {
            return (
                <>
                    <h2 className="profile-settings-title">Appearance</h2>
                    <p className="profile-settings-section-intro">
                        Choose how Orecce should look for you.
                    </p>
                    <div className="profile-settings-form">
                        <div className="profile-settings-choice-group" role="radiogroup" aria-label="Theme preference">
                            <button
                                type="button"
                                className={`profile-settings-choice ${themePreference === "auto" ? "active" : ""}`}
                                onClick={() => setThemePreference("auto")}
                            >
                                Automatic
                            </button>
                            <button
                                type="button"
                                className={`profile-settings-choice ${themePreference === "dark" ? "active" : ""}`}
                                onClick={() => setThemePreference("dark")}
                            >
                                Dark
                            </button>
                            <button
                                type="button"
                                className={`profile-settings-choice ${themePreference === "light" ? "active" : ""}`}
                                onClick={() => setThemePreference("light")}
                            >
                                Light
                            </button>
                        </div>
                        <p className="profile-settings-helper">
                            Current active theme: {themeMode === "dark" ? "Dark" : "Light"}.
                        </p>
                    </div>
                </>
            );
        }

        return (
            <>
                <h2 className="profile-settings-title">Notifications</h2>
                <p className="profile-settings-section-intro">
                    Choose where you want updates to be delivered.
                </p>
                <div className="profile-settings-form">
                    <div className="profile-settings-radio-list">
                        <label className={`profile-settings-radio-option ${notificationChannel === "email" ? "active" : ""}`}>
                            <input
                                type="radio"
                                name="notification-channel"
                                value="email"
                                checked={notificationChannel === "email"}
                                onChange={() => setNotificationChannel("email")}
                            />
                            <span>
                                <IoMailOutline aria-hidden="true" />
                                Email
                            </span>
                        </label>
                        <label className={`profile-settings-radio-option ${notificationChannel === "whatsapp" ? "active" : ""}`}>
                            <input
                                type="radio"
                                name="notification-channel"
                                value="whatsapp"
                                checked={notificationChannel === "whatsapp"}
                                onChange={() => setNotificationChannel("whatsapp")}
                            />
                            <span>
                                <BsWhatsapp aria-hidden="true" />
                                WhatsApp
                            </span>
                        </label>
                    </div>

                    {notificationChannel === "whatsapp" && (
                        <>
                            <label className="profile-settings-label" htmlFor="settings-whatsapp">
                                WhatsApp number
                            </label>
                            <input
                                id="settings-whatsapp"
                                className="profile-settings-input"
                                value={whatsappNumber}
                                onChange={(event) => setWhatsappNumber(event.target.value)}
                                placeholder="+1 555 123 4567"
                            />
                        </>
                    )}

                    <button
                        type="button"
                        className="profile-settings-primary-btn"
                        onClick={() => {
                            void handleSaveNotifications();
                        }}
                        disabled={isSavingNotifications}
                    >
                        {isSavingNotifications ? "Saving..." : "Save notifications"}
                    </button>

                    {notificationsNotice && (
                        <p className={`profile-settings-inline-status is-${notificationsNotice.type}`}>
                            {notificationsNotice.message}
                        </p>
                    )}
                </div>
            </>
        );
    };

    return (
        <>
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
                        onClick={closeProfileSettings}
                    >
                        <div
                            className="profile-settings-modal"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                className="profile-settings-close"
                                onClick={closeProfileSettings}
                                aria-label="Close profile settings"
                                type="button"
                            >
                                ✕
                            </button>

                            <aside className="profile-settings-nav">
                                <div className="profile-settings-nav-head">
                                    <h2 className="profile-settings-nav-title">Settings</h2>
                                </div>

                                <div className="profile-settings-nav-list">
                                    {settingsNavItems.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={`profile-settings-nav-item ${activeSettingsTab === item.id ? "active" : ""}`}
                                            onClick={() => {
                                                setActiveSettingsTab(item.id);
                                                resetSettingsNotices();
                                            }}
                                        >
                                            {item.icon}
                                            <span>{item.label}</span>
                                        </button>
                                    ))}
                                </div>

                                <button
                                    className="profile-settings-signout profile-settings-signout-danger profile-settings-nav-signout"
                                    type="button"
                                    onClick={() => openLogoutConfirm(true)}
                                >
                                    Log out
                                </button>
                            </aside>

                            <section className="profile-settings-content">
                                {settingsLoadError && (
                                    <p className="profile-settings-inline-status is-error">
                                        {settingsLoadError}
                                    </p>
                                )}
                                {renderSettingsContent()}
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
