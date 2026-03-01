"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { buildRecceKey, type Recce } from "@/lib/recces";

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

let cachedRecces: Recce[] = [];
let cachedFollowedKeys = new Set<string>();
let cachedLoading = false;
let cachedLoaded = false;
let cachedError: string | null = null;
let loadPromise: Promise<void> | null = null;
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

async function fetchReccesSnapshot(): Promise<{ recces: Recce[]; followedKeys: Set<string> }> {
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
    if (user) {
        const [
            { data: authorFollowRows, error: authorFollowError },
            { data: topicFollowRows, error: topicFollowError },
        ] = await Promise.all([
            supabase
                .from("user_author_follows")
                .select("author_id")
                .eq("user_id", user.id),
            supabase
                .from("user_topic_follows")
                .select("topic_id")
                .eq("user_id", user.id),
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

    return { recces, followedKeys };
}

function ensureLoaded(force = false): Promise<void> {
    if (cachedLoaded && !force) {
        return Promise.resolve();
    }
    if (loadPromise && !force) {
        return loadPromise;
    }

    setCachedState({ loading: true, error: null });

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
        const syncFromCache = () => {
            setRecces(cachedRecces);
            setFollowedKeys(new Set(cachedFollowedKeys));
            setLoading(cachedLoading || !cachedLoaded);
            setError(cachedError);
        };

        listeners.add(syncFromCache);
        syncFromCache();
        void ensureLoaded();

        return () => {
            listeners.delete(syncFromCache);
        };
    }, []);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            setCachedState({ loaded: false });
            void ensureLoaded(true);
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

        void (async () => {
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError) {
                    throw new Error(userError.message);
                }
                if (!user) {
                    throw new Error("You need to sign in to follow recces.");
                }

                if (recce.kind === "author") {
                    if (isFollowing) {
                        const { error: deleteError } = await supabase
                            .from("user_author_follows")
                            .delete()
                            .match({ user_id: user.id, author_id: recce.id });
                        if (deleteError) {
                            throw new Error(deleteError.message);
                        }
                    } else {
                        const { error: insertError } = await supabase
                            .from("user_author_follows")
                            .insert({ user_id: user.id, author_id: recce.id });
                        if (insertError) {
                            throw new Error(insertError.message);
                        }
                    }
                } else if (isFollowing) {
                    const { error: deleteError } = await supabase
                        .from("user_topic_follows")
                        .delete()
                        .match({ user_id: user.id, topic_id: recce.id });
                    if (deleteError) {
                        throw new Error(deleteError.message);
                    }
                } else {
                    const { error: insertError } = await supabase
                        .from("user_topic_follows")
                        .insert({ user_id: user.id, topic_id: recce.id });
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
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
            }
        })();
    }, []);

    return { recces, followedKeys, loading, error, toggleFollow };
}
