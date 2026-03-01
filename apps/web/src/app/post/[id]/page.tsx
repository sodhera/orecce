"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRecces } from "@/hooks/useRecces";
import Sidebar from "@/components/Sidebar";
import PostCard, { type Post, type Slide } from "@/components/PostCard";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { buildRecceKey, type Recce } from "@/lib/recces";
import { readTabCache, writeTabCache } from "@/lib/tabCache";

interface PostRow {
    id: string;
    theme: string | null;
    slides: unknown;
    post_type: string | null;
    source_url: string | null;
    source_title: string | null;
    author_id: string | null;
    topics: string[] | null;
    authors: { name: string; avatar_url: string | null } | null;
}

interface PersistedPostPageSnapshot {
    post: Post;
    authorId: string | null;
    authorName: string;
    authorAvatar: string | null;
    authorBio: string | null;
}

const POST_PAGE_CACHE_TTL_MS = 10 * 60 * 1000;

function parseSlides(raw: unknown): Slide[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((s: Record<string, unknown>, i: number) => ({
        slide_number: typeof s.slide_number === "number" ? s.slide_number : i + 1,
        type: (s.type as Slide["type"]) ?? "body",
        text: typeof s.text === "string" ? s.text : "",
    }));
}

export default function PublicPostPage() {
    const params = useParams();
    const router = useRouter();
    const postId = typeof params.id === "string" ? params.id : "";
    const { isAuthenticated, setShowAuthModal } = useAuth();
    const { followedKeys, toggleFollow } = useRecces();

    const [post, setPost] = useState<Post | null>(null);
    const [authorId, setAuthorId] = useState<string | null>(null);
    const [authorName, setAuthorName] = useState("Unknown");
    const [authorAvatar, setAuthorAvatar] = useState<string | null>(null);
    const [authorBio, setAuthorBio] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const trackedPostIdRef = useRef<string | null>(null);
    const cacheKey = postId
        ? `orecce:web:page:post:${encodeURIComponent(postId)}:v1`
        : null;

    const authorRecce = useMemo<Recce | null>(() => {
        if (!authorId) {
            return null;
        }
        return {
            id: authorId,
            key: buildRecceKey("author", authorId),
            kind: "author",
            name: authorName,
            bio: authorBio,
            avatarUrl: authorAvatar,
            websiteUrl: null,
        };
    }, [authorAvatar, authorBio, authorId, authorName]);

    useEffect(() => {
        if (!postId) {
            setError("No post ID provided.");
            setLoading(false);
            return;
        }

        let cachedSnapshotLoaded = false;
        if (cacheKey) {
            const cachedSnapshot = readTabCache<PersistedPostPageSnapshot>(
                cacheKey,
                POST_PAGE_CACHE_TTL_MS,
            );

            if (cachedSnapshot) {
                cachedSnapshotLoaded = true;
                setPost(cachedSnapshot.value.post);
                setAuthorId(cachedSnapshot.value.authorId);
                setAuthorName(cachedSnapshot.value.authorName);
                setAuthorAvatar(cachedSnapshot.value.authorAvatar);
                setAuthorBio(cachedSnapshot.value.authorBio);
                setError(null);
                setLoading(false);
            }
        }

        (async () => {
            try {
                if (!cachedSnapshotLoaded) {
                    setLoading(true);
                }

                const { data, error: fetchError } = await supabase
                    .from("posts")
                    .select("id, theme, slides, post_type, source_url, source_title, author_id, topics, authors(name, avatar_url, bio)")
                    .eq("id", postId)
                    .single();

                if (fetchError) throw new Error(fetchError.message);
                if (!data) throw new Error("Post not found.");

                const row = data as unknown as PostRow & { authors: { bio?: string | null } | null };
                const slides = parseSlides(row.slides);

                setPost({
                    id: row.id,
                    post_type: (row.post_type as Post["post_type"]) ?? "carousel",
                    topic: row.topics?.[0] ?? "",
                    title: row.theme ?? "Untitled",
                    sourceUrl: row.source_url ?? undefined,
                    sourceTitle: row.source_title ?? undefined,
                    slides,
                    date: "",
                });

                setAuthorId(row.author_id);
                const author = row.authors;
                const nextAuthorName = author?.name ?? "Unknown";
                const nextAuthorAvatar = author?.avatar_url ?? null;
                const nextAuthorBio = author?.bio ?? null;
                setAuthorName(nextAuthorName);
                setAuthorAvatar(nextAuthorAvatar);
                setAuthorBio(nextAuthorBio);

                if (cacheKey) {
                    writeTabCache<PersistedPostPageSnapshot>(cacheKey, {
                        post: {
                            id: row.id,
                            post_type: (row.post_type as Post["post_type"]) ?? "carousel",
                            topic: row.topics?.[0] ?? "",
                            title: row.theme ?? "Untitled",
                            sourceUrl: row.source_url ?? undefined,
                            sourceTitle: row.source_title ?? undefined,
                            slides,
                            date: "",
                        },
                        authorId: row.author_id,
                        authorName: nextAuthorName,
                        authorAvatar: nextAuthorAvatar,
                        authorBio: nextAuthorBio,
                    });
                }
            } catch (err) {
                if (!cachedSnapshotLoaded) {
                    setError(err instanceof Error ? err.message : "Failed to load post.");
                }
            } finally {
                setLoading(false);
            }
        })();
    }, [cacheKey, postId]);

    useEffect(() => {
        if (!post) {
            return;
        }
        if (trackedPostIdRef.current === post.id) {
            return;
        }
        trackedPostIdRef.current = post.id;
        trackAnalyticsEvent({
            eventName: "post_detail_viewed",
            surface: "post_detail",
            properties: {
                post_id: post.id,
                author_id: authorId,
                author_name: authorName,
                topic: post.topic,
                source_url: post.sourceUrl ?? null,
            },
        });
    }, [authorId, authorName, post]);

    const isFollowing = authorRecce ? followedKeys.has(authorRecce.key) : false;

    // ── Center content ──
    const centerContent = loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
            Loading post…
        </div>
    ) : error || !post ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-secondary)" }}>
            {error ?? "Post not found."}
        </div>
    ) : (
        <div className="feed-posts-container feed-posts-slides">
            <div className="feed-slide-shell">
                <PostCard
                    post={post}
                    variant="slide"
                    authorName={authorName}
                    authorAvatar={authorAvatar}
                />
            </div>
        </div>
    );

    // ── Right sidebar ──
    const rightContent = isAuthenticated ? (
        <aside className="right-sidebar">
            {authorId && (
                <div className="post-page-author-card">
                    <div className="post-page-author-header">
                        <div className="post-page-author-avatar">
                            {authorName.charAt(0).toUpperCase()}
                        </div>
                        <div className="post-page-author-info">
                            <span className="post-page-author-name">{authorName}</span>
                            {authorBio && (
                                <span className="post-page-author-bio">{authorBio}</span>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        className={`post-page-author-follow-btn ${isFollowing ? "is-following" : ""}`}
                        onClick={() => {
                            if (authorRecce) {
                                toggleFollow(authorRecce);
                            }
                        }}
                    >
                        {isFollowing ? "Following" : "Follow"}
                    </button>
                </div>
            )}
        </aside>
    ) : (
        <aside className="right-sidebar">
            <div className="post-page-signup-card">
                <h2 className="post-page-signup-title">New to Orecce?</h2>
                <p className="post-page-signup-subtitle">
                    Sign up now to get your own personalized feed!
                </p>
                <button
                    type="button"
                    className="post-page-signup-btn"
                    onClick={() => setShowAuthModal(true)}
                >
                    Create account
                </button>
                <button
                    type="button"
                    className="post-page-login-btn"
                    onClick={() => setShowAuthModal(true)}
                >
                    Log in
                </button>
            </div>
        </aside>
    );

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="feed">
                <div className="feed-header">
                    <div className="post-page-header">
                        <button
                            type="button"
                            className="post-page-back-btn"
                            onClick={() => {
                                if (isAuthenticated) {
                                    router.push("/feed");
                                } else {
                                    router.push("/");
                                }
                            }}
                            aria-label="Go back"
                        >
                            ←
                        </button>
                        <h1>Post</h1>
                    </div>
                </div>
                {centerContent}
            </main>
            {rightContent}
        </div>
    );
}
