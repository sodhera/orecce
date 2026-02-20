import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "./firebaseConfig";
import type { Post } from "@/components/PostCard";

/**
 * Fetch posts from the Firestore `posts` collection.
 * Used for unauthenticated visitors (replaces the old hardcoded MOCK_POSTS).
 */
export async function fetchPublicPosts(maxPosts = 20): Promise<Post[]> {
    const postsRef = collection(db, "posts");
    const q = query(postsRef, orderBy("createdAt", "desc"), limit(maxPosts));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            post_type: data.post_type ?? "single",
            topic: data.topic ?? "NICHE",
            title: data.title ?? "",
            slides: data.slides ?? [],
            date: data.date ?? "",
            sourceUrl: data.sourceUrl ?? undefined,
        } as Post;
    });
}
