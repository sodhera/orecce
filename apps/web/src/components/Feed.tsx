"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import PostCard, { type Post } from "./PostCard";
import { generatePost, listPosts, type ApiPost } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MOCK_POSTS } from "@/lib/mockPosts";

// ── Config ──────────────────────────────────────────────────────
const VISIBLE_GUEST_POSTS = 3; // posts shown before the gate

const CATEGORIES = [
    { value: "ALL", label: "All" },
    { value: "BIOGRAPHY", label: "Biographies" },
    { value: "TRIVIA", label: "Trivia" },
    { value: "NICHE", label: "Niche" },
];

// ── Helpers ─────────────────────────────────────────────────────

function apiPostToPost(p: ApiPost): Post {
    return {
        id: p.id,
        topic: p.mode,
        title: p.title,
        text_content: p.body,
        date: new Date(p.createdAtMs).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        }),
    };
}

// ── Component ───────────────────────────────────────────────────

interface FeedProps {
    mode: string;
    profile: string;
    onModeChange?: (mode: string) => void;
}

export default function Feed({ mode, profile, onModeChange }: FeedProps) {
    const { isAuthenticated, setShowAuthModal } = useAuth();

    const [activeTab, setActiveTab] = useState<"for-you" | "following">(
        "for-you",
    );
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showGate, setShowGate] = useState(false);

    const gateRef = useRef<HTMLDivElement | null>(null);

    // ── Fetch posts (authenticated) or use mock posts ───────────
    useEffect(() => {
        if (!isAuthenticated) {
            setPosts(MOCK_POSTS);
            setLoading(false);
            setShowGate(false);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                setPosts([]);
                const result = await listPosts(mode, profile, 20);
                if (!cancelled) {
                    setPosts(result.items.map(apiPostToPost));
                }
            } catch (err) {
                if (!cancelled) setError((err as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [mode, profile, isAuthenticated]);

    // ── Scroll gate observer (guest only) ───────────────────────
    useEffect(() => {
        if (isAuthenticated) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShowGate(true);
                }
            },
            { threshold: 0.5 },
        );

        const el = gateRef.current;
        if (el) observer.observe(el);

        return () => {
            if (el) observer.unobserve(el);
        };
    }, [isAuthenticated, posts]);

    // ── Generate a new post (authenticated only) ────────────────
    const handleGenerate = useCallback(async () => {
        try {
            setGenerating(true);
            setError(null);
            const newPost = await generatePost(mode, profile, "short");
            setPosts((prev) => [apiPostToPost(newPost), ...prev]);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setGenerating(false);
        }
    }, [mode, profile]);

    // ── Determine which posts to render ─────────────────────────
    const visiblePosts = isAuthenticated
        ? posts
        : posts.slice(0, VISIBLE_GUEST_POSTS + 2); // show a few extra (partially hidden)

    return (
        <main className="feed">
            <div className="feed-header">
                <div className="feed-header-top">
                    <h1>Home</h1>
                </div>
                <div className="feed-tabs">
                    <button
                        className={`feed-tab ${activeTab === "for-you" ? "active" : ""}`}
                        onClick={() => setActiveTab("for-you")}
                    >
                        For you
                    </button>
                    <button
                        className={`feed-tab ${activeTab === "following" ? "active" : ""}`}
                        onClick={() => setActiveTab("following")}
                    >
                        Following
                    </button>
                </div>
            </div>

            {/* Category pills — horizontally scrollable */}
            <div className="feed-categories">
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.value}
                        className={`feed-category-pill ${mode === cat.value || (cat.value === "ALL" && mode === "ALL") ? "active" : ""}`}
                        onClick={() => onModeChange?.(cat.value)}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Posts */}
            <div className="feed-posts-container">
                {loading ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        Loading posts…
                    </div>
                ) : visiblePosts.length === 0 ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        No posts yet.
                    </div>
                ) : (
                    visiblePosts.map((post, index) => (
                        <div
                            key={post.id}
                            ref={
                                !isAuthenticated &&
                                    index === VISIBLE_GUEST_POSTS - 1
                                    ? gateRef
                                    : undefined
                            }
                        >
                            <PostCard post={post} />
                        </div>
                    ))
                )}

                {/* Scroll gate overlay for guests */}
                {!isAuthenticated && showGate && (
                    <div className="scroll-gate">
                        <div className="scroll-gate-content">
                            <h2 className="scroll-gate-title">
                                See what&apos;s happening
                            </h2>
                            <p className="scroll-gate-subtitle">
                                Join Orecce today to get personalized posts,
                                follow topics you love, and more.
                            </p>
                            <button
                                className="scroll-gate-cta"
                                onClick={() => setShowAuthModal(true)}
                            >
                                Create account
                            </button>
                            <button
                                className="scroll-gate-login"
                                onClick={() => setShowAuthModal(true)}
                            >
                                Sign in
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

