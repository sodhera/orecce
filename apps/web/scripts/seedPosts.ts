/**
 * Seed script — uploads mock_data.json posts to the Firestore `posts` collection.
 *
 * Usage:
 *   npx tsx scripts/seedPosts.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Firebase Admin init ─────────────────────────────────────────
// Uses Application Default Credentials (run `gcloud auth application-default login` first)
// or set GOOGLE_APPLICATION_CREDENTIALS to a service account key JSON path.
initializeApp({
    projectId: "audit-3a7ec",
});
const db = getFirestore();

// ── Load mock data ──────────────────────────────────────────────
const mockDataPath = resolve(__dirname, "../mock_data.json");
const raw = JSON.parse(readFileSync(mockDataPath, "utf-8"));

interface MockSlide {
    slide_number: number;
    type: string;
    text: string;
}

interface MockPost {
    post_type: string;
    theme: string;
    slides: MockSlide[];
}

// ── Map to Firestore documents ──────────────────────────────────
const posts: { id: string; data: Record<string, unknown> }[] = (
    raw.posts as MockPost[]
).map((post, index) => {
    // Generate a slug-style ID from the theme
    const id = post.theme
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    // Assign topics based on post characteristics
    const topicMap: Record<string, string> = {
        "dark-side-of-monk-mode": "NICHE",
        "sleep-calibration": "TRIVIA",
        courage: "NICHE",
        simplicity: "NICHE",
        "jet-lag-hack": "TRIVIA",
    };

    return {
        id,
        data: {
            post_type: post.post_type,
            topic: topicMap[id] ?? "NICHE",
            title: post.theme,
            slides: post.slides,
            date: "Feb 20, 2026",
            createdAt: FieldValue.serverTimestamp(),
            // Ensure ordering: earlier posts get an earlier base so they appear in order
            sortOrder: index,
        },
    };
});

// ── Write to Firestore ──────────────────────────────────────────
async function seed() {
    console.log(`Seeding ${posts.length} posts to Firestore...`);

    const batch = db.batch();
    for (const post of posts) {
        const ref = db.collection("posts").doc(post.id);
        batch.set(ref, post.data, { merge: true });
    }

    await batch.commit();
    console.log("✅ Done! Posts seeded successfully.");
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
