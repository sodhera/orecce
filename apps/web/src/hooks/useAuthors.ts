"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

export function useAuthors(): UseAuthorsReturn {
    const [authors, setAuthors] = useState<Author[]>([]);
    const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                // Fetch all authors
                const { data: authorRows, error: authErr } = await supabase
                    .from("authors")
                    .select("id, name, bio, avatar_url, website_url")
                    .order("name");

                if (authErr) throw new Error(authErr.message);

                // Fetch current user's follows
                const { data: { user } } = await supabase.auth.getUser();
                let followSet = new Set<string>();

                if (user) {
                    const { data: followRows } = await supabase
                        .from("user_author_follows")
                        .select("author_id")
                        .eq("user_id", user.id);

                    if (followRows) {
                        followSet = new Set(followRows.map((r) => r.author_id));
                    }
                }

                if (!cancelled) {
                    setAuthors((authorRows ?? []) as Author[]);
                    setFollowedIds(followSet);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load authors.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    const toggleFollow = useCallback((authorId: string) => {
        setFollowedIds((prev) => {
            const next = new Set(prev);
            const isFollowing = next.has(authorId);

            if (isFollowing) {
                next.delete(authorId);
            } else {
                next.add(authorId);
            }

            // Fire-and-forget mutation
            (async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                if (isFollowing) {
                    await supabase
                        .from("user_author_follows")
                        .delete()
                        .match({ user_id: user.id, author_id: authorId });
                } else {
                    await supabase
                        .from("user_author_follows")
                        .insert({ user_id: user.id, author_id: authorId });
                }
            })();

            return next;
        });
    }, []);

    return { authors, followedIds, loading, error, toggleFollow };
}
