"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";

type Tab = "login" | "signup";

export default function AuthModal() {
    const { showAuthModal, setShowAuthModal, login, signup } = useAuth();
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
