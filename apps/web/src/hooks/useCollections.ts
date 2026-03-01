"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { readTabCache, writeTabCache } from "@/lib/tabCache";

export interface Collection {
    id: string;
    name: string;
    postCount: number;
    createdAt: string;
    updatedAt: string;
}

interface UseCollectionsReturn {
    collections: Collection[];
    loading: boolean;
    error: string | null;
    defaultCollectionId: string | null;
    createCollection: (name: string) => Promise<Collection | null>;
    renameCollection: (id: string, newName: string) => Promise<boolean>;
    deleteCollection: (id: string) => Promise<boolean>;
    refresh: () => void;
}

interface PersistedCollectionsSnapshot {
    userId: string | null;
    collections: Collection[];
}

const COLLECTIONS_CACHE_KEY = "orecce:web:collections:v1";
const COLLECTIONS_CACHE_TTL_MS = 15 * 60 * 1000;

async function requireUserId(): Promise<string> {
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    if (!user) throw new Error("Authentication required.");
    return user.id;
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

export function useCollections(): UseCollectionsReturn {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchIdRef = useRef(0);

    const defaultCollectionId =
        collections.find((c) => c.name === "Default Collection")?.id ?? null;

    const persistCollections = useCallback((nextCollections: Collection[]) => {
        void (async () => {
            try {
                const userId = await getSessionUserId();
                if (!userId) {
                    return;
                }

                writeTabCache<PersistedCollectionsSnapshot>(COLLECTIONS_CACHE_KEY, {
                    userId,
                    collections: nextCollections,
                });
            } catch {
                // Ignore cache persistence failures.
            }
        })();
    }, []);

    const hydratePersistedCollections = useCallback(async (): Promise<{
        hydrated: boolean;
        isFresh: boolean;
    }> => {
        const userId = await getSessionUserId();
        const snapshot = readTabCache<PersistedCollectionsSnapshot>(
            COLLECTIONS_CACHE_KEY,
            COLLECTIONS_CACHE_TTL_MS,
        );

        if (!snapshot || snapshot.value.userId !== userId) {
            return { hydrated: false, isFresh: false };
        }

        setCollections(snapshot.value.collections);
        setLoading(false);
        setError(null);

        return { hydrated: true, isFresh: snapshot.isFresh };
    }, []);

    const fetchCollections = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
        const id = ++fetchIdRef.current;
        if (!quiet) {
            setLoading(true);
        }
        setError(null);

        try {
            const { data, error: rpcError } = await supabase.rpc(
                "get_user_collections" as any,
                { p_limit: 100, p_offset: 0 } as any,
            );

            if (id !== fetchIdRef.current) return;
            if (rpcError) throw new Error(rpcError.message);

            const rows = (data ?? []) as Array<{
                collection_id: string;
                collection_name: string;
                post_count: number;
                created_at: string;
                updated_at: string;
            }>;

            const nextCollections = rows.map((row) => ({
                id: row.collection_id,
                name: row.collection_name,
                postCount: Number(row.post_count),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }));

            setCollections(nextCollections);
            persistCollections(nextCollections);
        } catch (err) {
            if (id === fetchIdRef.current) {
                setError(
                    err instanceof Error ? err.message : "Failed to load collections.",
                );
            }
        } finally {
            if (id === fetchIdRef.current && !quiet) {
                setLoading(false);
            }
        }
    }, [persistCollections]);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const { hydrated, isFresh } = await hydratePersistedCollections();
                if (cancelled) {
                    return;
                }

                if (!hydrated) {
                    void fetchCollections();
                    return;
                }

                if (!isFresh) {
                    void fetchCollections({ quiet: true });
                }
            } catch {
                if (cancelled) {
                    return;
                }
                void fetchCollections();
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [fetchCollections, hydratePersistedCollections]);

    const createCollection = useCallback(
        async (name: string): Promise<Collection | null> => {
            const trimmed = name.trim();
            if (!trimmed) return null;

            try {
                const userId = await requireUserId();
                const { data, error: insertError } = await supabase
                    .from("save_collections")
                    .insert({ user_id: userId, name: trimmed })
                    .select("id, name, created_at, updated_at")
                    .single();

                if (insertError) throw new Error(insertError.message);

                const newCollection: Collection = {
                    id: data.id,
                    name: data.name,
                    postCount: 0,
                    createdAt: data.created_at,
                    updatedAt: data.updated_at,
                };

                setCollections((prev) => {
                    const nextCollections = [...prev, newCollection];
                    persistCollections(nextCollections);
                    return nextCollections;
                });
                trackAnalyticsEvent({
                    eventName: "collection_created",
                    surface: "saved",
                    properties: {
                        collection_id: newCollection.id,
                        collection_name: newCollection.name,
                    },
                });
                return newCollection;
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : "Failed to create collection.",
                );
                return null;
            }
        },
        [],
    );

    const renameCollection = useCallback(
        async (id: string, newName: string): Promise<boolean> => {
            const trimmed = newName.trim();
            if (!trimmed) return false;

            // Optimistic update
            setCollections((prev) => {
                const nextCollections = prev.map((c) =>
                    c.id === id ? { ...c, name: trimmed } : c,
                );
                persistCollections(nextCollections);
                return nextCollections;
            });

            try {
                const { error: updateError } = await supabase
                    .from("save_collections")
                    .update({ name: trimmed, updated_at: new Date().toISOString() })
                    .eq("id", id);

                if (updateError) throw new Error(updateError.message);
                trackAnalyticsEvent({
                    eventName: "collection_renamed",
                    surface: "saved",
                    properties: {
                        collection_id: id,
                        collection_name: trimmed,
                    },
                });
                return true;
            } catch (err) {
                // Revert
                void fetchCollections({ quiet: true });
                setError(
                    err instanceof Error ? err.message : "Failed to rename collection.",
                );
                return false;
            }
        },
        [fetchCollections, persistCollections],
    );

    const deleteCollection = useCallback(
        async (id: string): Promise<boolean> => {
            // Don't allow deleting the default collection
            const target = collections.find((c) => c.id === id);
            if (!target || target.name === "Default Collection") return false;

            // Optimistic remove
            setCollections((prev) => {
                const nextCollections = prev.filter((c) => c.id !== id);
                persistCollections(nextCollections);
                return nextCollections;
            });

            try {
                const { error: deleteError } = await supabase
                    .from("save_collections")
                    .delete()
                    .eq("id", id);

                if (deleteError) throw new Error(deleteError.message);
                trackAnalyticsEvent({
                    eventName: "collection_deleted",
                    surface: "saved",
                    properties: {
                        collection_id: id,
                        collection_name: target.name,
                    },
                });
                return true;
            } catch (err) {
                // Revert
                void fetchCollections({ quiet: true });
                setError(
                    err instanceof Error ? err.message : "Failed to delete collection.",
                );
                return false;
            }
        },
        [collections, fetchCollections, persistCollections],
    );

    return {
        collections,
        loading,
        error,
        defaultCollectionId,
        createCollection,
        renameCollection,
        deleteCollection,
        refresh: () => {
            void fetchCollections();
        },
    };
}
