import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, AppStateStatus } from "react-native";
import { supabase } from "../config/supabase";

interface TrackEventInput {
    eventName: string;
    surface?: string;
    routeName?: string;
    properties?: Record<string, unknown>;
}

interface AnalyticsBatchEvent {
    event_id: string;
    event_name: string;
    platform: "mobile";
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

const API_BASE_URL = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
const ANON_KEY = "@analytics_anonymous_id";
const DEVICE_KEY = "@analytics_device_id";
const SESSION_KEY = "@analytics_session_id";
const APP_VERSION = "mobile@1.0.0";
const MAX_BATCH_SIZE = 25;
const FLUSH_DELAY_MS = 1500;

let currentUserId: string | null = null;
let currentRouteName = "";
let queue: AnalyticsBatchEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
let backgroundTracked = false;
let appOpenedTracked = false;

function createId(prefix: string): string {
    const randomPart =
        typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}:${randomPart}`;
}

async function getStoredId(storageKey: string, prefix: string): Promise<string> {
    const existing = (await AsyncStorage.getItem(storageKey))?.trim();
    if (existing) {
        return existing;
    }
    const next = createId(prefix);
    await AsyncStorage.setItem(storageKey, next);
    return next;
}

async function ensureIds(): Promise<{ anonymousId: string; deviceId: string; sessionId: string }> {
    const anonymousId = await getStoredId(ANON_KEY, "anon");
    const deviceId = await getStoredId(DEVICE_KEY, "device");
    const sessionId = await getStoredId(SESSION_KEY, "session");
    return { anonymousId, deviceId, sessionId };
}

function scheduleFlush(): void {
    if (flushTimer) {
        return;
    }
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushMobileAnalytics();
    }, FLUSH_DELAY_MS);
}

async function buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
}

function handleAppStateChange(nextState: AppStateStatus): void {
    if (nextState !== "active" && !backgroundTracked) {
        backgroundTracked = true;
        trackMobileAnalyticsEvent({
            eventName: "app_backgrounded",
            surface: "app",
            routeName: currentRouteName,
        });
        void flushMobileAnalytics();
    }

    if (nextState === "active") {
        backgroundTracked = false;
    }
}

export function initMobileAnalytics(): void {
    if (initialized) {
        return;
    }
    initialized = true;
    void AsyncStorage.setItem(SESSION_KEY, createId("session"));
    AppState.addEventListener("change", handleAppStateChange);
}

export function setMobileAnalyticsUserId(userId: string | null): void {
    currentUserId = userId;
}

export function setMobileAnalyticsRouteName(routeName: string): void {
    currentRouteName = routeName;
}

export function trackMobileAnalyticsEvent(input: TrackEventInput): void {
    void (async () => {
        initMobileAnalytics();
        const ids = await ensureIds();

        if (!appOpenedTracked) {
            appOpenedTracked = true;
            queue.push({
                event_id: createId("evt"),
                event_name: "app_opened",
                platform: "mobile",
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
            platform: "mobile",
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
            await flushMobileAnalytics();
            return;
        }

        scheduleFlush();
    })();
}

export async function flushMobileAnalytics(): Promise<void> {
    if (!API_BASE_URL || queue.length === 0) {
        return;
    }

    const batch = queue.slice(0, MAX_BATCH_SIZE);

    try {
        const headers = await buildHeaders();
        const response = await fetch(`${API_BASE_URL}/v1/analytics/events/batch`, {
            method: "POST",
            headers,
            body: JSON.stringify({ events: batch }),
        });

        if (!response.ok) {
            return;
        }

        queue = queue.slice(batch.length);
        if (queue.length > 0) {
            scheduleFlush();
        }
    } catch {
        // Keep queued events for the next successful flush attempt.
        scheduleFlush();
    }
}

export function trackMobileRouteView(routeName: string, properties: Record<string, unknown> = {}): void {
    setMobileAnalyticsRouteName(routeName);

    if (routeName === "Home") {
        trackMobileAnalyticsEvent({ eventName: "feed_viewed", surface: "feed", routeName, properties });
        return;
    }
    if (routeName === "Explore") {
        trackMobileAnalyticsEvent({ eventName: "discover_viewed", surface: "discover", routeName, properties });
        return;
    }
    if (routeName === "Saved") {
        trackMobileAnalyticsEvent({ eventName: "saved_viewed", surface: "saved", routeName, properties });
        return;
    }
    if (routeName === "Inbox") {
        trackMobileAnalyticsEvent({ eventName: "notifications_viewed", surface: "notifications", routeName, properties });
        return;
    }
    if (routeName === "Profile") {
        trackMobileAnalyticsEvent({ eventName: "profile_viewed", surface: "profile", routeName, properties });
        return;
    }
    if (routeName === "CollectionDetail") {
        trackMobileAnalyticsEvent({ eventName: "collection_opened", surface: "saved", routeName, properties });
        return;
    }
    if (routeName === "PostDetails") {
        trackMobileAnalyticsEvent({ eventName: "post_detail_viewed", surface: "post_detail", routeName, properties });
        return;
    }
    if (routeName === "Welcome") {
        trackMobileAnalyticsEvent({ eventName: "landing_viewed", surface: "landing", routeName, properties });
        return;
    }

    trackMobileAnalyticsEvent({ eventName: "screen_viewed", surface: "app", routeName, properties });
}
