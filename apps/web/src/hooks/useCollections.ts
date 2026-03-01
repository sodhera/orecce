"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { trackAnalyticsEvent } from "@/lib/analytics";

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

async function requireUserId(): Promise<string> {
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    if (!user) throw new Error("Authentication required.");
    return user.id;
}

export function useCollections(): UseCollectionsReturn {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchIdRef = useRef(0);

    const defaultCollectionId =
        collections.find((c) => c.name === "Default Collection")?.id ?? null;

    const fetchCollections = useCallback(async () => {
        const id = ++fetchIdRef.current;
        setLoading(true);
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

            setCollections(
                rows.map((row) => ({
                    id: row.collection_id,
                    name: row.collection_name,
                    postCount: Number(row.post_count),
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                })),
            );
        } catch (err) {
            if (id === fetchIdRef.current) {
                setError(
                    err instanceof Error ? err.message : "Failed to load collections.",
                );
            }
        } finally {
            if (id === fetchIdRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchCollections();
    }, [fetchCollections]);

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

                setCollections((prev) => [...prev, newCollection]);
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
            setCollections((prev) =>
                prev.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
            );

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
                void fetchCollections();
                setError(
                    err instanceof Error ? err.message : "Failed to rename collection.",
                );
                return false;
            }
        },
        [fetchCollections],
    );

    const deleteCollection = useCallback(
        async (id: string): Promise<boolean> => {
            // Don't allow deleting the default collection
            const target = collections.find((c) => c.id === id);
            if (!target || target.name === "Default Collection") return false;

            // Optimistic remove
            setCollections((prev) => prev.filter((c) => c.id !== id));

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
                void fetchCollections();
                setError(
                    err instanceof Error ? err.message : "Failed to delete collection.",
                );
                return false;
            }
        },
        [collections, fetchCollections],
    );

    return {
        collections,
        loading,
        error,
        defaultCollectionId,
        createCollection,
        renameCollection,
        deleteCollection,
        refresh: fetchCollections,
    };
}
