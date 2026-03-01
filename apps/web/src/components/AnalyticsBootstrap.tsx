"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
    setAnalyticsRouteName,
    setAnalyticsUserId,
    trackAnalyticsEvent,
    trackWebPageView,
} from "@/lib/analytics";

export default function AnalyticsBootstrap() {
    const pathname = usePathname();
    const { user, showAuthModal } = useAuth();

    useEffect(() => {
        setAnalyticsUserId(user?.id ?? null);
    }, [user?.id]);

    useEffect(() => {
        const routeName = pathname || "/";
        setAnalyticsRouteName(routeName);
        trackWebPageView(routeName);
    }, [pathname]);

    useEffect(() => {
        if (!showAuthModal) {
            return;
        }
        trackAnalyticsEvent({
            eventName: "auth_modal_opened",
            surface: "auth",
            routeName: pathname || "/",
        });
    }, [pathname, showAuthModal]);

    return null;
}
