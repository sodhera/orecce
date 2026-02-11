"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";

type Tab = "login" | "signup";

export default function AuthModal() {
    const { showAuthModal, setShowAuthModal, login, signup, loginWithGoogle } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>("login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!showAuthModal) return null;

    const resetForm = () => {
        setName("");
        setEmail("");
        setPassword("");
        setError(null);
    };

    const switchTab = (tab: Tab) => {
        setActiveTab(tab);
        resetForm();
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (activeTab === "login") {
                if (!email || !password) {
                    setError("Please fill in all fields");
                    return;
                }
                // TODO: connect to backend
                await login(email, password);
            } else {
                if (!name || !email || !password) {
                    setError("Please fill in all fields");
                    return;
                }
                // TODO: connect to backend
                await signup(name, email, password);
            }
            resetForm();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="auth-overlay"
            onClick={() => setShowAuthModal(false)}
        >
            <div
                className="auth-modal"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    className="auth-close"
                    onClick={() => setShowAuthModal(false)}
                    aria-label="Close"
                >
                    ✕
                </button>

                {/* Logo */}
                <div className="auth-logo">Orecce</div>

                {/* Tabs */}
                <div className="auth-tabs">
                    <button
                        className={`auth-tab ${activeTab === "login" ? "active" : ""}`}
                        onClick={() => switchTab("login")}
                    >
                        Log In
                    </button>
                    <button
                        className={`auth-tab ${activeTab === "signup" ? "active" : ""}`}
                        onClick={() => switchTab("signup")}
                    >
                        Sign Up
                    </button>
                </div>

                {/* Google sign-in */}
                <button
                    className="auth-google-btn"
                    type="button"
                    onClick={async () => {
                        setError(null);
                        setLoading(true);
                        try {
                            await loginWithGoogle();
                        } catch (err) {
                            setError((err as Error).message);
                        } finally {
                            setLoading(false);
                        }
                    }}
                    disabled={loading}
                >
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                </button>

                <div className="auth-divider">
                    <span>or</span>
                </div>

                {/* Form */}
                <form className="auth-form" onSubmit={handleSubmit}>
                    {activeTab === "signup" && (
                        <input
                            className="auth-input"
                            type="text"
                            placeholder="Full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                        />
                    )}
                    <input
                        className="auth-input"
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                    />
                    <input
                        className="auth-input"
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={
                            activeTab === "login"
                                ? "current-password"
                                : "new-password"
                        }
                    />

                    {error && <div className="auth-error">{error}</div>}

                    <button
                        className="auth-submit-btn"
                        type="submit"
                        disabled={loading}
                    >
                        {loading
                            ? "Please wait…"
                            : activeTab === "login"
                                ? "Log In"
                                : "Create Account"}
                    </button>
                </form>

                {/* Footer text */}
                <p className="auth-footer-text">
                    {activeTab === "login" ? (
                        <>
                            Don&apos;t have an account?{" "}
                            <button
                                className="auth-link"
                                onClick={() => switchTab("signup")}
                            >
                                Sign up
                            </button>
                        </>
                    ) : (
                        <>
                            Already have an account?{" "}
                            <button
                                className="auth-link"
                                onClick={() => switchTab("login")}
                            >
                                Log in
                            </button>
                        </>
                    )}
                </p>
            </div>
        </div>
    );
}
