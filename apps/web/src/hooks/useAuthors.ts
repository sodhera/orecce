"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { trackAnalyticsEvent } from "@/lib/analytics";

export interface Author {
    id: string;
    name: string;
    bio: string | null;
    avatar_url: string | null;
    website_url: string | null;
}

interface UseAuthorsReturn {
    authors: Author[];
    followedIds: Set<string>;
    loading: boolean;
    error: string | null;
    toggleFollow: (authorId: string) => void;
}

let cachedAuthors: Author[] = [];
let cachedFollowedIds = new Set<string>();
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
    authors?: Author[];
    followedIds?: Set<string>;
    loading?: boolean;
    loaded?: boolean;
    error?: string | null;
}) {
    if (typeof partial.authors !== "undefined") {
        cachedAuthors = partial.authors;
    }
    if (typeof partial.followedIds !== "undefined") {
        cachedFollowedIds = partial.followedIds;
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

async function fetchAuthorsSnapshot(): Promise<{ authors: Author[]; followedIds: Set<string> }> {
    const { data: authorRows, error: authorError } = await supabase
        .from("authors")
        .select("id, name, bio, avatar_url, website_url")
        .order("name");
    if (authorError) {
        throw new Error(authorError.message);
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
        throw new Error(userError.message);
    }

    let followedIds = new Set<string>();
    if (user) {
        const { data: followRows, error: followError } = await supabase
            .from("user_author_follows")
            .select("author_id")
            .eq("user_id", user.id);
        if (followError) {
            throw new Error(followError.message);
        }
        followedIds = new Set((followRows ?? []).map((row) => String(row.author_id)));
    }

    return {
        authors: (authorRows ?? []) as Author[],
        followedIds,
    };
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
            const snapshot = await fetchAuthorsSnapshot();
            setCachedState({
                authors: snapshot.authors,
                followedIds: snapshot.followedIds,
                loading: false,
                loaded: true,
                error: null,
            });
        } catch (error) {
            setCachedState({
                loading: false,
                loaded: cachedLoaded,
                error: parseErrorMessage(error, "Failed to load authors."),
            });
            throw error;
        } finally {
            loadPromise = null;
        }
    })();

    return loadPromise;
}

export function useAuthors(): UseAuthorsReturn {
    const [authors, setAuthors] = useState<Author[]>(cachedAuthors);
    const [followedIds, setFollowedIds] = useState<Set<string>>(new Set(cachedFollowedIds));
    const [loading, setLoading] = useState<boolean>(cachedLoading || !cachedLoaded);
    const [error, setError] = useState<string | null>(cachedError);

    useEffect(() => {
        const syncFromCache = () => {
            setAuthors(cachedAuthors);
            setFollowedIds(new Set(cachedFollowedIds));
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

    const toggleFollow = useCallback((authorId: string) => {
        const previous = new Set(cachedFollowedIds);
        const next = new Set(previous);
        const isFollowing = next.has(authorId);
        const author = cachedAuthors.find((candidate) => candidate.id === authorId);

        if (isFollowing) {
            next.delete(authorId);
        } else {
            next.add(authorId);
        }

        setCachedState({ followedIds: next, error: null });

        void (async () => {
            try {
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError) {
                    throw new Error(userError.message);
                }
                if (!user) {
                    throw new Error("You need to sign in to follow recces.");
                }

                if (isFollowing) {
                    const { error: deleteError } = await supabase
                        .from("user_author_follows")
                        .delete()
                        .match({ user_id: user.id, author_id: authorId });
                    if (deleteError) {
                        throw new Error(deleteError.message);
                    }
                    trackAnalyticsEvent({
                        eventName: "author_unfollowed",
                        surface: "discover",
                        properties: {
                            author_id: authorId,
                            author_name: author?.name ?? null,
                        },
                    });
                } else {
                    const { error: insertError } = await supabase
                        .from("user_author_follows")
                        .insert({ user_id: user.id, author_id: authorId });
                    if (insertError) {
                        throw new Error(insertError.message);
                    }
                    trackAnalyticsEvent({
                        eventName: "author_followed",
                        surface: "discover",
                        properties: {
                            author_id: authorId,
                            author_name: author?.name ?? null,
                        },
                    });
                }
            } catch (error) {
                setCachedState({
                    followedIds: previous,
                    error: parseErrorMessage(error, "Failed to update followed recces."),
                });
            }
        })();
    }, []);

    return { authors, followedIds, loading, error, toggleFollow };
}
