"use client";

import { supabase } from "@/lib/supabaseClient";

type AnalyticsPlatform = "web";

interface TrackEventInput {
    eventName: string;
    surface?: string;
    routeName?: string;
    properties?: Record<string, unknown>;
}

interface AnalyticsBatchEvent {
    event_id: string;
    event_name: string;
    platform: AnalyticsPlatform;
    surface?: string;
    occurred_at_ms: number;
    session_id: string;
    anonymous_id: string;
    device_id: string;
    app_version: string;
    route_name?: string;
    request_id?: string;
    properties: Record<string, unknown>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
const ANON_KEY = "orecce.analytics.anonymous_id";
const DEVICE_KEY = "orecce.analytics.device_id";
const SESSION_KEY = "orecce.analytics.session_id";
const APP_VERSION = "web@0.1.0";
const FLUSH_DELAY_MS = 1500;
const MAX_BATCH_SIZE = 25;

let currentUserId: string | null = null;
let currentRouteName = "";
let queue: AnalyticsBatchEvent[] = [];
let flushTimer: number | null = null;
let listenersRegistered = false;
let appOpenedTracked = false;
let backgroundTracked = false;

function canUseDom(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

function createId(prefix: string): string {
    const randomPart =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}:${randomPart}`;
}

function getStoredId(storageKey: string, prefix: string, storage: Storage): string {
    const existing = storage.getItem(storageKey)?.trim();
    if (existing) {
        return existing;
    }
    const next = createId(prefix);
    storage.setItem(storageKey, next);
    return next;
}

function ensureSessionIds(): { anonymousId: string; deviceId: string; sessionId: string } {
    if (!canUseDom()) {
        const fallback = createId("anon");
        return {
            anonymousId: fallback,
            deviceId: createId("device"),
            sessionId: createId("session"),
        };
    }

    return {
        anonymousId: getStoredId(ANON_KEY, "anon", window.localStorage),
        deviceId: getStoredId(DEVICE_KEY, "device", window.localStorage),
        sessionId: getStoredId(SESSION_KEY, "session", window.sessionStorage),
    };
}

function scheduleFlush(): void {
    if (flushTimer) {
        return;
    }
    flushTimer = window.setTimeout(() => {
        flushTimer = null;
        void flushAnalyticsQueue();
    }, FLUSH_DELAY_MS);
}

async function getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
}

function registerLifecycleListeners(): void {
    if (!canUseDom() || listenersRegistered) {
        return;
    }

    const onVisibilityChange = () => {
        if (document.visibilityState === "hidden" && !backgroundTracked) {
            backgroundTracked = true;
            trackAnalyticsEvent({
                eventName: "app_backgrounded",
                surface: "app",
                routeName: currentRouteName,
                properties: { visibility_state: document.visibilityState },
            });
            void flushAnalyticsQueue(true);
        }
        if (document.visibilityState === "visible") {
            backgroundTracked = false;
        }
    };

    const onPageHide = () => {
        trackAnalyticsEvent({
            eventName: "app_closed",
            surface: "app",
            routeName: currentRouteName,
        });
        void flushAnalyticsQueue(true);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    listenersRegistered = true;
}

export function setAnalyticsUserId(userId: string | null): void {
    currentUserId = userId;
}

export function setAnalyticsRouteName(routeName: string): void {
    currentRouteName = routeName;
}

export function trackAnalyticsEvent(input: TrackEventInput): void {
    if (!canUseDom()) {
        return;
    }

    registerLifecycleListeners();

    const ids = ensureSessionIds();
    if (!appOpenedTracked) {
        appOpenedTracked = true;
        queue.push({
            event_id: createId("evt"),
            event_name: "app_opened",
            platform: "web",
            surface: "app",
            occurred_at_ms: Date.now(),
            session_id: ids.sessionId,
            anonymous_id: ids.anonymousId,
            device_id: ids.deviceId,
            app_version: APP_VERSION,
            route_name: currentRouteName || input.routeName,
            properties: currentUserId ? { user_id: currentUserId } : {},
        });
    }

    queue.push({
        event_id: createId("evt"),
        event_name: input.eventName,
        platform: "web",
        surface: input.surface,
        occurred_at_ms: Date.now(),
        session_id: ids.sessionId,
        anonymous_id: ids.anonymousId,
        device_id: ids.deviceId,
        app_version: APP_VERSION,
        route_name: input.routeName ?? currentRouteName ?? undefined,
        properties: {
            ...(currentUserId ? { user_id: currentUserId } : {}),
            ...(input.properties ?? {}),
        },
    });

    if (queue.length >= MAX_BATCH_SIZE) {
        void flushAnalyticsQueue();
        return;
    }

    scheduleFlush();
}

export async function flushAnalyticsQueue(useBeacon: boolean = false): Promise<void> {
    if (!canUseDom() || queue.length === 0) {
        return;
    }

    const batch = queue.slice(0, MAX_BATCH_SIZE);
    const payload = JSON.stringify({ events: batch });
    const url = `${API_BASE}/analytics/events/batch`;

    if (useBeacon && typeof navigator.sendBeacon === "function") {
        const sent = navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        if (sent) {
            queue = queue.slice(batch.length);
            return;
        }
    }

    try {
        const headers = await getAuthHeaders();
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: payload,
            keepalive: true,
        });

        if (!response.ok) {
            return;
        }

        queue = queue.slice(batch.length);
        if (queue.length > 0) {
            scheduleFlush();
        }
    } catch {
        // Keep the queue in memory for the next flush attempt.
        scheduleFlush();
    }
}

export function trackWebPageView(pathname: string): void {
    const routeName = pathname || "/";
    setAnalyticsRouteName(routeName);

    if (routeName === "/") {
        trackAnalyticsEvent({ eventName: "landing_viewed", surface: "landing", routeName });
        return;
    }
    if (routeName === "/feed") {
        trackAnalyticsEvent({ eventName: "feed_viewed", surface: "feed", routeName });
        return;
    }
    if (routeName === "/discover") {
        trackAnalyticsEvent({ eventName: "discover_viewed", surface: "discover", routeName });
        return;
    }
    if (routeName === "/liked") {
        trackAnalyticsEvent({ eventName: "liked_viewed", surface: "liked", routeName });
        return;
    }
    if (routeName === "/saved") {
        trackAnalyticsEvent({ eventName: "saved_viewed", surface: "saved", routeName });
        return;
    }
    if (routeName === "/notifications") {
        trackAnalyticsEvent({ eventName: "notifications_viewed", surface: "notifications", routeName });
        return;
    }
    if (routeName === "/feedback") {
        trackAnalyticsEvent({ eventName: "feedback_viewed", surface: "feedback", routeName });
        return;
    }
    if (routeName.startsWith("/post/")) {
        trackAnalyticsEvent({ eventName: "post_detail_viewed", surface: "post_detail", routeName });
        return;
    }

    trackAnalyticsEvent({ eventName: "page_viewed", surface: "unknown", routeName });
}
