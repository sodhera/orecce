"use client";

import { useState } from "react";
import PostCard, { type Post } from "./PostCard";

const MOCK_POSTS: Post[] = [
    {
        id: 1,
        topic: "AI",
        text_content:
            "GPT-5 is showing emergent reasoning capabilities that weren't present in previous models. The jump from GPT-4 to GPT-5 feels bigger than 3.5 to 4. Especially in multi-step planning and code generation.",
        date: "Feb 10, 2026",
    },
    {
        id: 2,
        topic: "Frontend",
        text_content:
            "Next.js 16 just dropped with built-in Turbopack support. Dev server cold starts went from 1.2s to 180ms in our monorepo. The DX improvement is massive.",
        date: "Feb 10, 2026",
    },
    {
        id: 3,
        topic: "Startups",
        text_content:
            "Hot take: most startups fail not because of bad ideas, but because founders optimize for fundraising instead of building something people actually want. Ship first, pitch later.",
        date: "Feb 9, 2026",
    },
    {
        id: 4,
        topic: "Design",
        text_content:
            "The best interfaces feel invisible. Users shouldn't have to think about navigation — it should be instinctive. If your app needs a tutorial, your design needs work.",
        date: "Feb 9, 2026",
    },
    {
        id: 5,
        topic: "Backend",
        text_content:
            "Switched our API from REST to tRPC and the type safety across the full stack is incredible. No more runtime type mismatches between client and server. Worth the migration effort.",
        date: "Feb 8, 2026",
    },
    {
        id: 6,
        topic: "Open Source",
        text_content:
            "Just hit 10K stars on our open source project. The community contributions have been amazing — 47 contributors from 12 countries. Open source really is the best way to build software.",
        date: "Feb 8, 2026",
    },
    {
        id: 7,
        topic: "DevOps",
        text_content:
            "Migrated our CI/CD from Jenkins to GitHub Actions. Build times dropped 60% and the config is 10x more readable. Should have done this years ago.",
        date: "Feb 7, 2026",
    },
    {
        id: 8,
        topic: "Career",
        text_content:
            "Unpopular opinion: the best way to grow as an engineer isn't grinding LeetCode. It's shipping real projects, reading production codebases, and learning to communicate technical decisions clearly.",
        date: "Feb 7, 2026",
    },
    {
        id: 9,
        topic: "AI",
        text_content:
            "Built an AI agent that reviews PRs, suggests optimizations, and auto-generates unit tests. It caught 3 bugs that our entire team missed during code review. The future of development is here.",
        date: "Feb 6, 2026",
    },
    {
        id: 10,
        topic: "Frontend",
        text_content:
            "CSS container queries are a game changer. Finally we can build truly responsive components that adapt to their container, not just the viewport. No more hacky JavaScript resize observers.",
        date: "Feb 6, 2026",
    },
];

export default function Feed() {
    const [activeTab, setActiveTab] = useState<"for-you" | "following">(
        "for-you"
    );

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


            {/* Posts */}
            {MOCK_POSTS.map((post) => (
                <PostCard key={post.id} post={post} />
            ))}
        </main>
    );
}
