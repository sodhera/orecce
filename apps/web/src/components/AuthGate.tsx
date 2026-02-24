"use client";

import { ReactNode, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

interface AuthGateProps {
    children: ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
    const { isAuthenticated, loading, setShowAuthModal } = useAuth();

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            setShowAuthModal(true);
        }
    }, [loading, isAuthenticated, setShowAuthModal]);

    if (loading) {
        return (
            <div className="app-layout">
                <main className="feed">
                    <div className="onboarding-loading">Checking session...</div>
                </main>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="app-layout">
                <main className="feed">
                    <div className="sports-login-panel">
                        <p className="sports-login-title">Sign in to access Orecce</p>
                        <button
                            type="button"
                            className="sports-login-btn"
                            onClick={() => setShowAuthModal(true)}
                        >
                            Log in / Sign up
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    return <>{children}</>;
}
