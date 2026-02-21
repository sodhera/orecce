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

/**
 * Fetch posts from a followed recce.
 *
 * Each doc in `recces/blogs/{recceName}` (e.g. "13sentences") holds
 * a `posts` array whose items match the PostCard slide format.
 * We read every essay doc, flatten all posts, and return them.
 */
export async function fetchReccePosts(
    recceName: string,
    maxPosts = 50,
): Promise<Post[]> {
    const recceRef = collection(db, "recces", "blogs", recceName);
    const snapshot = await getDocs(recceRef);

    const all: Post[] = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const posts = (data.posts ?? []) as Array<{
            post_type?: string;
            theme?: string;
            slides?: Array<{
                slide_number: number;
                type: string;
                text: string;
            }>;
        }>;

        posts.forEach((p, idx) => {
            all.push({
                id: `${doc.id}__${idx}`,
                post_type: (p.post_type as "carousel" | "single") ?? "single",
                topic: recceName,
                title: p.theme ?? doc.id,
                slides: (p.slides ?? []).map((s) => ({
                    slide_number: s.slide_number,
                    type: s.type as "hook" | "body" | "closer" | "standalone",
                    text: s.text,
                })),
                date: "",
            });
        });
    }

    return all.slice(0, maxPosts);
}
