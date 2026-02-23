import { Firestore, Timestamp } from "firebase-admin/firestore";

export interface ReccesSlide {
  slideNumber: number;
  type: string;
  text: string;
}

export interface ReccesPost {
  theme: string;
  postType: string;
  slides: ReccesSlide[];
}

export interface ReccesEssayDocument {
  essayId: string;
  sourceTitle: string;
  posts: ReccesPost[];
  updatedAtMs?: number;
}

export interface ReccesRepository {
  listEssayDocuments(authorId: string): Promise<ReccesEssayDocument[]>;
}

function toMillis(value: unknown): number | undefined {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return undefined;
}

function readSlide(raw: unknown): ReccesSlide | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const text = String(value.text ?? "").trim();
  if (!text) {
    return null;
  }
  const slideNumberRaw = Number(value.slide_number);
  const slideNumber = Number.isFinite(slideNumberRaw) && slideNumberRaw >= 1 ? Math.floor(slideNumberRaw) : 0;
  return {
    slideNumber,
    type: String(value.type ?? "body"),
    text
  };
}

function readPost(raw: unknown): ReccesPost | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const slidesRaw = Array.isArray(value.slides) ? value.slides : [];
  const slides = slidesRaw.map(readSlide).filter((slide): slide is ReccesSlide => Boolean(slide));
  if (!slides.length) {
    return null;
  }
  const theme = String(value.theme ?? "").trim() || "Untitled";
  return {
    theme,
    postType: String(value.post_type ?? "carousel"),
    slides
  };
}

export class FirestoreReccesRepository implements ReccesRepository {
  private readonly rootCollection = "recces";
  private readonly blogsDocument = "blogs";

  constructor(private readonly db: Firestore) {}

  async listEssayDocuments(authorId: string): Promise<ReccesEssayDocument[]> {
    const authorKey = String(authorId ?? "").trim();
    if (!authorKey) {
      return [];
    }

    const snap = await this.db
      .collection(this.rootCollection)
      .doc(this.blogsDocument)
      .collection(authorKey)
      .get();

    return snap.docs
      .map((doc) => {
        const data = (doc.data() ?? {}) as Record<string, unknown>;
        const rawPosts = Array.isArray(data.posts) ? data.posts : [];
        const posts = rawPosts.map(readPost).filter((post): post is ReccesPost => Boolean(post));
        if (!posts.length) {
          return null;
        }

        return {
          essayId: doc.id,
          sourceTitle: String(data.source_title ?? doc.id),
          posts,
          updatedAtMs: toMillis((data.updatedAt as unknown) ?? (data.updated_at as unknown))
        } as ReccesEssayDocument;
      })
      .filter((item): item is ReccesEssayDocument => Boolean(item));
  }
}
