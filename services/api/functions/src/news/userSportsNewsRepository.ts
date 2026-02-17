import { createHash } from "crypto";
import { Firestore, Timestamp } from "firebase-admin/firestore";
import { SportId } from "./sportsNewsSources";
import { SportsStory } from "./sportsNewsService";

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toMillis(value: unknown): number | undefined {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return undefined;
}

export interface UserSportsNewsRepository {
  replaceStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void>;
  listStoriesForUser(userId: string, sport: SportId, limit: number): Promise<SportsStory[]>;
}

export class FirestoreUserSportsNewsRepository implements UserSportsNewsRepository {
  private readonly collection = "userSportsNewsStories";

  constructor(private readonly db: Firestore) {}

  async replaceStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void> {
    const existing = await this.db
      .collection(this.collection)
      .where("userId", "==", userId)
      .where("sport", "==", sport)
      .get();

    const batch = this.db.batch();
    for (const doc of existing.docs) {
      batch.delete(doc.ref);
    }

    const now = Timestamp.now();
    stories.forEach((story, index) => {
      const docId = hashText(`${userId}:${sport}:${story.canonicalUrl.toLowerCase()}`);
      const ref = this.db.collection(this.collection).doc(docId);
      batch.set(ref, {
        userId,
        sport,
        sourceId: story.sourceId,
        sourceName: story.sourceName,
        title: story.title,
        canonicalUrl: story.canonicalUrl,
        publishedAt: typeof story.publishedAtMs === "number" ? Timestamp.fromMillis(story.publishedAtMs) : null,
        importanceScore: story.importanceScore,
        bulletPoints: story.bulletPoints,
        reconstructedArticle: story.reconstructedArticle,
        story: story.story,
        fullTextStatus: story.fullTextStatus,
        summarySource: story.summarySource,
        rank: index + 1,
        updatedAt: now,
        createdAt: now
      });
    });

    await batch.commit();
  }

  async listStoriesForUser(userId: string, sport: SportId, limit: number): Promise<SportsStory[]> {
    const boundedLimit = Math.max(1, Math.min(40, Math.floor(limit)));
    const snap = await this.db
      .collection(this.collection)
      .where("userId", "==", userId)
      .where("sport", "==", sport)
      .get();

    const stories = snap.docs.map((doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      return {
        id: String(doc.id),
        sport,
        sourceId: String(data.sourceId ?? ""),
        sourceName: String(data.sourceName ?? ""),
        title: String(data.title ?? ""),
        canonicalUrl: String(data.canonicalUrl ?? ""),
        publishedAtMs: toMillis(data.publishedAt),
        importanceScore: typeof data.importanceScore === "number" ? data.importanceScore : 0,
        bulletPoints: Array.isArray(data.bulletPoints) ? data.bulletPoints.map((item) => String(item)) : [],
        reconstructedArticle: String(data.reconstructedArticle ?? ""),
        story: String(data.story ?? ""),
        fullTextStatus: data.fullTextStatus === "ready" ? "ready" : "fallback",
        summarySource: data.summarySource === "llm" ? "llm" : "fallback"
      } satisfies SportsStory;
    });

    stories.sort((a, b) => {
      if (b.importanceScore !== a.importanceScore) {
        return b.importanceScore - a.importanceScore;
      }
      return (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0);
    });

    return stories.slice(0, boundedLimit);
  }
}
