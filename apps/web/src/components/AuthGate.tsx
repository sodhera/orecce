"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface AuthGateProps {
    children: ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
    const { isAuthenticated, loading, setShowAuthModal } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const isPublicRoute = pathname === "/";

    useEffect(() => {
        if (!loading && !isAuthenticated && !isPublicRoute) {
            setShowAuthModal(false);
            router.replace("/");
        }
    }, [loading, isAuthenticated, isPublicRoute, router, setShowAuthModal]);

    if (!isPublicRoute && loading) {
        return (
            <div className="app-layout">
                <main className="feed">
                    <div className="onboarding-loading">Checking session...</div>
                </main>
            </div>
        );
    }

    if (!isPublicRoute && !isAuthenticated) {
        return null;
    }

    return <>{children}</>;
}
