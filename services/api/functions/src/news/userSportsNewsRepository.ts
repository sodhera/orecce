import { createHash } from "crypto";
import { Firestore, Timestamp } from "firebase-admin/firestore";
import { SportId } from "./sportsNewsSources";
import { SportsGameDraft, SportsStory } from "./sportsNewsService";

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
  replaceGameDraftsForUser(userId: string, sport: SportId, gameDateKey: string, drafts: SportsGameDraft[]): Promise<void>;
  replaceStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void>;
  listStoriesForUser(userId: string, sport: SportId, limit: number): Promise<SportsStory[]>;
}

export class FirestoreUserSportsNewsRepository implements UserSportsNewsRepository {
  private readonly storiesCollection = "userSportsNewsStories";
  private readonly gameDraftsCollection = "userSportsNewsGameDrafts";

  constructor(private readonly db: Firestore) {}

  async replaceGameDraftsForUser(
    userId: string,
    sport: SportId,
    gameDateKey: string,
    drafts: SportsGameDraft[]
  ): Promise<void> {
    const existing = await this.db
      .collection(this.gameDraftsCollection)
      .where("userId", "==", userId)
      .where("sport", "==", sport)
      .get();

    const batch = this.db.batch();
    for (const doc of existing.docs) {
      batch.delete(doc.ref);
    }

    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 48 * 60 * 60 * 1000);
    for (const draft of drafts) {
      const docId = hashText(`${userId}:${sport}:${draft.gameId}`);
      const ref = this.db.collection(this.gameDraftsCollection).doc(docId);
      batch.set(ref, {
        userId,
        sport,
        gameId: draft.gameId,
        gameName: draft.gameName,
        gameDateKey: draft.gameDateKey || gameDateKey,
        articleCount: draft.articleRefs.length,
        articles: draft.articleRefs.map((item) => ({
          itemIndex: item.itemIndex,
          sourceId: item.sourceId,
          sourceName: item.sourceName,
          title: item.title,
          canonicalUrl: item.canonicalUrl,
          publishedAt: typeof item.publishedAtMs === "number" ? Timestamp.fromMillis(item.publishedAtMs) : null
        })),
        createdAt: now,
        updatedAt: now,
        expiresAt
      });
    }

    await batch.commit();
  }

  async replaceStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void> {
    const existing = await this.db
      .collection(this.storiesCollection)
      .where("userId", "==", userId)
      .where("sport", "==", sport)
      .get();

    const batch = this.db.batch();
    for (const doc of existing.docs) {
      batch.delete(doc.ref);
    }

    const now = Timestamp.now();
    stories.forEach((story, index) => {
      const docId = hashText(`${userId}:${sport}:${story.gameDateKey}:${story.gameId}`);
      const ref = this.db.collection(this.storiesCollection).doc(docId);
      batch.set(ref, {
        userId,
        sport,
        sourceId: story.sourceId,
        sourceName: story.sourceName,
        title: story.title,
        canonicalUrl: story.canonicalUrl,
        publishedAt: typeof story.publishedAtMs === "number" ? Timestamp.fromMillis(story.publishedAtMs) : null,
        gameId: story.gameId,
        gameName: story.gameName,
        gameDateKey: story.gameDateKey,
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
      .collection(this.storiesCollection)
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
        gameId: String(data.gameId ?? ""),
        gameName: String(data.gameName ?? ""),
        gameDateKey: String(data.gameDateKey ?? ""),
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
