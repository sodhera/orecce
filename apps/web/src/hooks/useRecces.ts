"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { buildRecceKey, type Recce } from "@/lib/recces";
import { readTabCache, writeTabCache } from "@/lib/tabCache";

interface AuthorRow {
    id: string;
    name: string;
    bio: string | null;
    avatar_url: string | null;
    website_url: string | null;
}

interface TopicRow {
    id: string;
    name: string;
    description: string | null;
}

interface UseReccesReturn {
    recces: Recce[];
    followedKeys: Set<string>;
    loading: boolean;
    error: string | null;
    toggleFollow: (recce: Recce) => void;
}

interface PersistedReccesSnapshot {
    userId: string | null;
    recces: Recce[];
    followedKeys: string[];
}

const RECCES_CACHE_KEY = "orecce:web:recces:v1";
const RECCES_CACHE_TTL_MS = 15 * 60 * 1000;

let cachedRecces: Recce[] = [];
let cachedFollowedKeys = new Set<string>();
let cachedLoading = false;
let cachedLoaded = false;
let cachedError: string | null = null;
let loadPromise: Promise<void> | null = null;
let cachedSavedAt = 0;
let cacheHydrated = false;
const listeners = new Set<() => void>();

function notifyListeners() {
    for (const listener of listeners) {
        listener();
    }
}

function setCachedState(partial: {
    recces?: Recce[];
    followedKeys?: Set<string>;
    loading?: boolean;
    loaded?: boolean;
    error?: string | null;
}) {
    if (typeof partial.recces !== "undefined") {
        cachedRecces = partial.recces;
    }
    if (typeof partial.followedKeys !== "undefined") {
        cachedFollowedKeys = partial.followedKeys;
    }
    if (typeof partial.loading === "boolean") {
        cachedLoading = partial.loading;
    }
    if (typeof partial.loaded === "boolean") {
        cachedLoaded = partial.loaded;
    }
    if (typeof partial.error !== "undefined") {
        cachedError = partial.error;
    }
    notifyListeners();
}

function parseErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function cacheIsFresh(): boolean {
    return cachedSavedAt > 0 && Date.now() - cachedSavedAt <= RECCES_CACHE_TTL_MS;
}

async function getSessionUserId(): Promise<string | null> {
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();

    if (error) {
        throw new Error(error.message);
    }

    return session?.user?.id ?? null;
}

function persistSnapshot(userId: string | null): void {
    writeTabCache<PersistedReccesSnapshot>(RECCES_CACHE_KEY, {
        userId,
        recces: cachedRecces,
        followedKeys: Array.from(cachedFollowedKeys),
    });
    cachedSavedAt = Date.now();
}

function persistSnapshotForCurrentSession(): void {
    void (async () => {
        try {
            persistSnapshot(await getSessionUserId());
        } catch {
            // Ignore cache persistence failures.
        }
    })();
}

async function hydratePersistedState(): Promise<boolean> {
    if (cacheHydrated) {
        return cacheIsFresh();
    }

    cacheHydrated = true;

    const sessionUserId = await getSessionUserId();
    const snapshot = readTabCache<PersistedReccesSnapshot>(
        RECCES_CACHE_KEY,
        RECCES_CACHE_TTL_MS,
    );

    if (!snapshot || snapshot.value.userId !== sessionUserId) {
        return false;
    }

    cachedRecces = snapshot.value.recces;
    cachedFollowedKeys = new Set<string>(snapshot.value.followedKeys);
    cachedLoading = false;
    cachedLoaded = true;
    cachedError = null;
    cachedSavedAt = snapshot.savedAt;

    return snapshot.isFresh;
}

async function fetchReccesSnapshot(): Promise<{
    userId: string | null;
    recces: Recce[];
    followedKeys: Set<string>;
}> {
    const [
        { data: authorRows, error: authorError },
        { data: topicRows, error: topicError },
        { data: { user }, error: userError },
    ] = await Promise.all([
        supabase
            .from("authors")
            .select("id, name, bio, avatar_url, website_url")
            .order("name"),
        supabase
            .from("topics")
            .select("id, name, description")
            .order("name"),
        supabase.auth.getUser(),
    ]);

    if (authorError) {
        throw new Error(authorError.message);
    }
    if (topicError) {
        throw new Error(topicError.message);
    }
    if (userError) {
        throw new Error(userError.message);
    }

    const userId = user?.id ?? null;

    const authorRecces = ((authorRows ?? []) as AuthorRow[]).map((author) => ({
        id: author.id,
        key: buildRecceKey("author", author.id),
        kind: "author" as const,
        name: author.name,
        bio: author.bio,
        avatarUrl: author.avatar_url,
        websiteUrl: author.website_url,
    }));

    const topicRecces = ((topicRows ?? []) as TopicRow[]).map((topic) => ({
        id: topic.id,
        key: buildRecceKey("topic", topic.id),
        kind: "topic" as const,
        name: topic.name,
        bio: topic.description,
        avatarUrl: null,
        websiteUrl: null,
    }));

    const recces = [...authorRecces, ...topicRecces].sort((left, right) =>
        left.name.localeCompare(right.name),
    );

    let followedKeys = new Set<string>();
    if (userId) {
        const [
            { data: authorFollowRows, error: authorFollowError },
            { data: topicFollowRows, error: topicFollowError },
        ] = await Promise.all([
            supabase
                .from("user_author_follows")
                .select("author_id")
                .eq("user_id", userId),
            supabase
                .from("user_topic_follows")
                .select("topic_id")
                .eq("user_id", userId),
        ]);

        if (authorFollowError) {
            throw new Error(authorFollowError.message);
        }
        if (topicFollowError) {
            throw new Error(topicFollowError.message);
        }

        followedKeys = new Set<string>([
            ...(authorFollowRows ?? []).map((row) => buildRecceKey("author", String(row.author_id))),
            ...(topicFollowRows ?? []).map((row) => buildRecceKey("topic", String(row.topic_id))),
        ]);
    }

    return { userId, recces, followedKeys };
}

function ensureLoaded(force = false): Promise<void> {
    if (cachedLoaded && !force && cacheIsFresh()) {
        return Promise.resolve();
    }
    if (loadPromise && !force) {
        return loadPromise;
    }

    const keepVisibleState = cachedLoaded && !force;
    if (keepVisibleState) {
        setCachedState({ error: null });
    } else {
        setCachedState({ loading: true, error: null });
    }

    loadPromise = (async () => {
        try {
            const snapshot = await fetchReccesSnapshot();
            setCachedState({
                recces: snapshot.recces,
                followedKeys: snapshot.followedKeys,
                loading: false,
                loaded: true,
                error: null,
            });
            persistSnapshot(snapshot.userId);
        } catch (error) {
            setCachedState({
                loading: false,
                loaded: cachedLoaded,
                error: parseErrorMessage(error, "Failed to load recces."),
            });
            throw error;
        } finally {
            loadPromise = null;
        }
    })();

    return loadPromise;
}

export function useRecces(): UseReccesReturn {
    const [recces, setRecces] = useState<Recce[]>(cachedRecces);
    const [followedKeys, setFollowedKeys] = useState<Set<string>>(new Set(cachedFollowedKeys));
    const [loading, setLoading] = useState<boolean>(cachedLoading || !cachedLoaded);
    const [error, setError] = useState<string | null>(cachedError);

    useEffect(() => {
        let cancelled = false;

        const syncFromCache = () => {
            setRecces(cachedRecces);
            setFollowedKeys(new Set(cachedFollowedKeys));
            setLoading(cachedLoading || !cachedLoaded);
            setError(cachedError);
        };

        listeners.add(syncFromCache);
        void (async () => {
            try {
                const isFresh = await hydratePersistedState();
                if (cancelled) {
                    return;
                }
                syncFromCache();
                if (!isFresh) {
                    void ensureLoaded().catch(() => { });
                }
            } catch {
                if (cancelled) {
                    return;
                }
                syncFromCache();
                void ensureLoaded().catch(() => { });
            }
        })();

        return () => {
            cancelled = true;
            listeners.delete(syncFromCache);
        };
    }, []);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            cacheHydrated = false;
            cachedSavedAt = 0;
            setCachedState(
                event === "SIGNED_OUT"
                    ? { followedKeys: new Set<string>(), loaded: false }
                    : { loaded: false },
            );
            void ensureLoaded(true).catch(() => { });
        });
        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const toggleFollow = useCallback((recce: Recce) => {
        const previous = new Set(cachedFollowedKeys);
        const next = new Set(previous);
        const isFollowing = next.has(recce.key);

        if (isFollowing) {
            next.delete(recce.key);
        } else {
            next.add(recce.key);
        }

        setCachedState({ followedKeys: next, error: null });
        persistSnapshotForCurrentSession();

        void (async () => {
            try {
                const userId = await getSessionUserId();
                if (!userId) {
                    throw new Error("You need to sign in to follow recces.");
                }

                if (recce.kind === "author") {
                    if (isFollowing) {
                        const { error: deleteError } = await supabase
                            .from("user_author_follows")
                            .delete()
                            .match({ user_id: userId, author_id: recce.id });
                        if (deleteError) {
                            throw new Error(deleteError.message);
                        }
                    } else {
                        const { error: insertError } = await supabase
                            .from("user_author_follows")
                            .insert({ user_id: userId, author_id: recce.id });
                        if (insertError) {
                            throw new Error(insertError.message);
                        }
                    }
                } else if (isFollowing) {
                    const { error: deleteError } = await supabase
                        .from("user_topic_follows")
                        .delete()
                        .match({ user_id: userId, topic_id: recce.id });
                    if (deleteError) {
                        throw new Error(deleteError.message);
                    }
                } else {
                    const { error: insertError } = await supabase
                        .from("user_topic_follows")
                        .insert({ user_id: userId, topic_id: recce.id });
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                }

                persistSnapshot(userId);

                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("orecce:follow:success", {
                            detail: { recceKey: recce.key, isFollowing },
                        })
                    );
                }

                trackAnalyticsEvent({
                    eventName: isFollowing ? "recce_unfollowed" : "recce_followed",
                    surface: "discover",
                    properties: {
                        recce_id: recce.id,
                        recce_key: recce.key,
                        recce_name: recce.name,
                        recce_type: recce.kind,
                    },
                });
            } catch (error) {
                setCachedState({
                    followedKeys: previous,
                    error: parseErrorMessage(error, "Failed to update recce follow."),
                });
                persistSnapshotForCurrentSession();
            }
        })();
    }, []);

    return { recces, followedKeys, loading, error, toggleFollow };
}
