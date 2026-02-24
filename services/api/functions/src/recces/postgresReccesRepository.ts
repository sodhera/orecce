import { SupabaseClient } from "@supabase/supabase-js";
import { buildReccesPostId, parseReccesPostId } from "./postId";
import {
    ReccesEssayDocument,
    ReccesPost,
    ReccesRepository,
    ReccesResolvedPost,
    ReccesSlide
} from "./types";

function readSlide(raw: unknown): ReccesSlide | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    const text = String(value.text ?? "").trim();
    if (!text) return null;
    const slideNumberRaw = Number(value.slide_number);
    const slideNumber = Number.isFinite(slideNumberRaw) && slideNumberRaw >= 1 ? Math.floor(slideNumberRaw) : 0;
    return { slideNumber, type: String(value.type ?? "body"), text };
}

function readPost(raw: unknown): ReccesPost | null {
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    const slidesRaw = Array.isArray(value.slides) ? value.slides : [];
    const slides = slidesRaw.map(readSlide).filter((slide): slide is ReccesSlide => Boolean(slide));
    if (!slides.length) return null;
    const theme = String(value.theme ?? "").trim() || "Untitled";
    return { theme, postType: String(value.post_type ?? "carousel"), slides };
}

export class PostgresReccesRepository implements ReccesRepository {
    constructor(private readonly supabase: SupabaseClient) { }

    async listEssayDocuments(authorId: string): Promise<ReccesEssayDocument[]> {
        const authorKey = String(authorId ?? "").trim();
        if (!authorKey) return [];

        const { data, error } = await this.supabase
            .from("recces_essays")
            .select("*")
            .eq("author_id", authorKey);

        if (error) throw error;

        return (data ?? [])
            .map((row) => {
                const rawPosts = Array.isArray(row.posts) ? row.posts : [];
                const posts = rawPosts.map(readPost).filter((p: ReccesPost | null): p is ReccesPost => Boolean(p));
                if (!posts.length) return null;

                return {
                    essayId: row.essay_id,
                    sourceTitle: String(row.source_title ?? row.essay_id),
                    posts,
                    updatedAtMs: row.updated_at ? new Date(row.updated_at).getTime() : undefined
                } as ReccesEssayDocument;
            })
            .filter((item): item is ReccesEssayDocument => Boolean(item));
    }

    async getPostById(postId: string): Promise<ReccesResolvedPost | null> {
        const parsed = parseReccesPostId(postId);
        if (!parsed) return null;

        const { data, error } = await this.supabase
            .from("recces_essays")
            .select("*")
            .eq("author_id", parsed.authorId)
            .eq("essay_id", parsed.essayId)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        const rawPosts = Array.isArray(data.posts) ? data.posts : [];
        if (parsed.postIndex < 0 || parsed.postIndex >= rawPosts.length) return null;

        const post = readPost(rawPosts[parsed.postIndex]);
        if (!post) return null;

        const slideText = post.slides
            .map((slide) => slide.text.trim())
            .filter(Boolean)
            .join(" ");

        return {
            id: buildReccesPostId(parsed.authorId, parsed.essayId, parsed.postIndex),
            authorId: parsed.authorId,
            essayId: parsed.essayId,
            postIndex: parsed.postIndex,
            theme: post.theme,
            postType: post.postType,
            slides: post.slides,
            fullText: `${post.theme}. ${slideText}`.trim()
        };
    }
}
