import { createHash } from "crypto";
import { FieldPath, Firestore, Timestamp } from "firebase-admin/firestore";
import { parseSportId, SportId } from "./sportsNewsSources";
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

function buildPreviewText(story: SportsStory): string {
  const raw =
    String(story.story ?? "").trim() ||
    String(story.reconstructedArticle ?? "").trim() ||
    String(story.bulletPoints[0] ?? "").trim();
  if (!raw) {
    return "Open to read the full article.";
  }
  if (raw.length <= 220) {
    return raw;
  }
  return `${raw.slice(0, 217)}...`;
}

export interface UserSportsNewsRepository {
  enqueueRefreshForUser(userId: string, sport: SportId): Promise<void>;
  claimRefreshForUser(userId: string, sport: SportId): Promise<boolean>;
  finishRefreshForUser(userId: string, sport: SportId, input: { success: boolean; errorMessage?: string }): Promise<void>;
  replaceSyncStateForUser(userId: string, sport: SportId, state: UserSportsSyncState): Promise<void>;
  getSyncStateForUser(userId: string, sport: SportId): Promise<UserSportsSyncState | null>;
  replaceGameDraftsForUser(userId: string, sport: SportId, gameDateKey: string, drafts: SportsGameDraft[]): Promise<void>;
  upsertStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void>;
  replaceStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void>;
  listStoriesForUser(userId: string, sport: SportId, limit: number): Promise<SportsStory[]>;
  getStoryForUser(userId: string, storyId: string): Promise<SportsStory | null>;
  listFeedStoriesForUser(
    userId: string,
    limit: number,
    cursor?: UserSportsFeedCursor,
    sports?: SportId[]
  ): Promise<UserSportsFeedPage>;
}

export interface UserSportsFeedCursor {
  publishedAtMs: number | null;
  docId: string;
}

export interface UserSportsFeedPage {
  items: UserSportsFeedItem[];
  nextCursor: UserSportsFeedCursor | null;
}

export interface UserSportsFeedItem {
  id: string;
  sport: SportId;
  title: string;
  publishedAtMs?: number;
  importanceScore: number;
  preview: string;
}

export type UserSportsSyncStep =
  | "idle"
  | "looking_games"
  | "games_found"
  | "preparing_articles"
  | "complete"
  | "error";

export interface UserSportsSyncState {
  status: "idle" | "running" | "complete" | "error";
  step: UserSportsSyncStep;
  message: string;
  totalGames: number;
  processedGames: number;
  foundGames: string[];
  updatedAtMs: number;
  startedAtMs?: number;
  completedAtMs?: number;
  errorMessage?: string;
}

export class FirestoreUserSportsNewsRepository implements UserSportsNewsRepository {
  private readonly storiesCollection = "userSportsNewsStories";
  private readonly gameDraftsCollection = "userSportsNewsGameDrafts";
  private readonly syncStateCollection = "userSportsNewsSyncState";
  private readonly refreshJobsCollection = "userSportsNewsRefreshJobs";

  constructor(private readonly db: Firestore) {}

  private static fromStoryData(docId: string, data: Record<string, unknown>): SportsStory | null {
    const sport = parseSportId(String(data.sport ?? ""));
    if (!sport) {
      return null;
    }
    return {
      id: String(docId),
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
  }

  private static fromStoryDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): SportsStory | null {
    return this.fromStoryData(String(doc.id), (doc.data() ?? {}) as Record<string, unknown>);
  }

  private static fromFeedDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): UserSportsFeedItem | null {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const sport = parseSportId(String(data.sport ?? ""));
    if (!sport) {
      return null;
    }
    return {
      id: String(doc.id),
      sport,
      title: String(data.title ?? ""),
      publishedAtMs: toMillis(data.publishedAt),
      importanceScore: typeof data.importanceScore === "number" ? data.importanceScore : 0,
      preview: String(data.preview ?? "").trim() || "Open to read the full article."
    } satisfies UserSportsFeedItem;
  }

  private refreshDocRef(userId: string, sport: SportId): FirebaseFirestore.DocumentReference {
    const docId = hashText(`${userId}:${sport}:refresh`);
    return this.db.collection(this.refreshJobsCollection).doc(docId);
  }

  async enqueueRefreshForUser(userId: string, sport: SportId): Promise<void> {
    const ref = this.refreshDocRef(userId, sport);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Timestamp.now();
      const current = (snap.data() ?? {}) as Record<string, unknown>;
      const status = String(current.status ?? "idle");

      if (status === "processing") {
        tx.set(
          ref,
          {
            userId,
            sport,
            status: "processing",
            pending: true,
            requestedAt: now,
            updatedAt: now
          },
          { merge: true }
        );
        return;
      }

      tx.set(
        ref,
        {
          userId,
          sport,
          status: "queued",
          pending: false,
          requestedAt: now,
          updatedAt: now,
          errorMessage: null
        },
        { merge: true }
      );
    });
  }

  async claimRefreshForUser(userId: string, sport: SportId): Promise<boolean> {
    const ref = this.refreshDocRef(userId, sport);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return false;
      }

      const data = (snap.data() ?? {}) as Record<string, unknown>;
      if (String(data.status ?? "") !== "queued") {
        return false;
      }

      const now = Timestamp.now();
      tx.set(
        ref,
        {
          status: "processing",
          pending: false,
          startedAt: now,
          updatedAt: now,
          errorMessage: null
        },
        { merge: true }
      );
      return true;
    });
  }

  async finishRefreshForUser(
    userId: string,
    sport: SportId,
    input: { success: boolean; errorMessage?: string }
  ): Promise<void> {
    const ref = this.refreshDocRef(userId, sport);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return;
      }
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const pending = Boolean(data.pending);
      const now = Timestamp.now();

      if (pending) {
        tx.set(
          ref,
          {
            status: "queued",
            pending: false,
            updatedAt: now,
            errorMessage: null
          },
          { merge: true }
        );
        return;
      }

      tx.set(
        ref,
        {
          status: input.success ? "idle" : "error",
          pending: false,
          completedAt: now,
          updatedAt: now,
          errorMessage: input.success ? null : input.errorMessage ?? "Unknown refresh error"
        },
        { merge: true }
      );
    });
  }

  async replaceSyncStateForUser(userId: string, sport: SportId, state: UserSportsSyncState): Promise<void> {
    const docId = hashText(`${userId}:${sport}:sync`);
    const ref = this.db.collection(this.syncStateCollection).doc(docId);
    await ref.set({
      userId,
      sport,
      status: state.status,
      step: state.step,
      message: state.message,
      totalGames: state.totalGames,
      processedGames: state.processedGames,
      foundGames: state.foundGames,
      updatedAt: Timestamp.fromMillis(state.updatedAtMs),
      startedAt: typeof state.startedAtMs === "number" ? Timestamp.fromMillis(state.startedAtMs) : null,
      completedAt: typeof state.completedAtMs === "number" ? Timestamp.fromMillis(state.completedAtMs) : null,
      errorMessage: state.errorMessage ?? null
    });
  }

  async getSyncStateForUser(userId: string, sport: SportId): Promise<UserSportsSyncState | null> {
    const docId = hashText(`${userId}:${sport}:sync`);
    const snap = await this.db.collection(this.syncStateCollection).doc(docId).get();
    if (!snap.exists) {
      return null;
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    return {
      status:
        data.status === "running" || data.status === "complete" || data.status === "error"
          ? data.status
          : "idle",
      step:
        data.step === "looking_games" ||
        data.step === "games_found" ||
        data.step === "preparing_articles" ||
        data.step === "complete" ||
        data.step === "error"
          ? data.step
          : "idle",
      message: String(data.message ?? ""),
      totalGames: typeof data.totalGames === "number" ? data.totalGames : 0,
      processedGames: typeof data.processedGames === "number" ? data.processedGames : 0,
      foundGames: Array.isArray(data.foundGames) ? data.foundGames.map((item) => String(item)).slice(0, 40) : [],
      updatedAtMs: toMillis(data.updatedAt) ?? Date.now(),
      startedAtMs: toMillis(data.startedAt),
      completedAtMs: toMillis(data.completedAt),
      errorMessage: data.errorMessage ? String(data.errorMessage) : undefined
    };
  }

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
        preview: buildPreviewText(story),
        fullTextStatus: story.fullTextStatus,
        summarySource: story.summarySource,
        rank: index + 1,
        updatedAt: now,
        createdAt: now
      });
    });

    await batch.commit();
  }

  async upsertStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void> {
    if (!stories.length) {
      return;
    }

    const now = Timestamp.now();
    const batch = this.db.batch();
    stories.forEach((story, index) => {
      const docId = hashText(`${userId}:${sport}:${story.gameDateKey}:${story.gameId}`);
      const ref = this.db.collection(this.storiesCollection).doc(docId);
      batch.set(
        ref,
        {
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
          preview: buildPreviewText(story),
          fullTextStatus: story.fullTextStatus,
          summarySource: story.summarySource,
          rank: index + 1,
          updatedAt: now,
          createdAt: now
        },
        { merge: true }
      );
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

    const stories = snap.docs
      .map((doc) => FirestoreUserSportsNewsRepository.fromStoryDoc(doc))
      .filter((item): item is SportsStory => Boolean(item))
      .filter((item) => item.sport === sport);

    stories.sort((a, b) => {
      if (b.importanceScore !== a.importanceScore) {
        return b.importanceScore - a.importanceScore;
      }
      return (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0);
    });

    return stories.slice(0, boundedLimit);
  }

  async getStoryForUser(userId: string, storyId: string): Promise<SportsStory | null> {
    const storyIdTrimmed = String(storyId ?? "").trim();
    if (!storyIdTrimmed) {
      return null;
    }

    const snap = await this.db.collection(this.storiesCollection).doc(storyIdTrimmed).get();
    if (!snap.exists) {
      return null;
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(data.userId ?? "") !== userId) {
      return null;
    }
    return FirestoreUserSportsNewsRepository.fromStoryData(storyIdTrimmed, data);
  }

  async listFeedStoriesForUser(
    userId: string,
    limit: number,
    cursor?: UserSportsFeedCursor,
    sports?: SportId[]
  ): Promise<UserSportsFeedPage> {
    const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));
    let query = this.db
      .collection(this.storiesCollection)
      .where("userId", "==", userId);

    const selectedSports = Array.isArray(sports)
      ? Array.from(new Set(sports.map((item) => item.trim()).filter(Boolean))) as SportId[]
      : [];
    if (selectedSports.length === 1) {
      query = query.where("sport", "==", selectedSports[0]);
    } else if (selectedSports.length > 1) {
      query = query.where("sport", "in", selectedSports);
    }

    query = query
      .select("sport", "title", "publishedAt", "importanceScore", "preview")
      .orderBy("publishedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(boundedLimit + 1);

    if (cursor) {
      const publishedAtCursor = cursor.publishedAtMs === null ? null : Timestamp.fromMillis(cursor.publishedAtMs);
      query = query.startAfter(publishedAtCursor, cursor.docId);
    }

    const snap = await query.get();
    const docs = snap.docs;
    const hasMore = docs.length > boundedLimit;
    const pageDocs = hasMore ? docs.slice(0, boundedLimit) : docs;
    const items = pageDocs
      .map((doc) => FirestoreUserSportsNewsRepository.fromFeedDoc(doc))
      .filter((item): item is UserSportsFeedItem => Boolean(item));

    if (!hasMore || pageDocs.length === 0) {
      return {
        items,
        nextCursor: null
      };
    }

    const lastDoc = pageDocs[pageDocs.length - 1];
    const lastPublishedAt = (lastDoc.data().publishedAt ?? null) as unknown;
    return {
      items,
      nextCursor: {
        publishedAtMs: toMillis(lastPublishedAt) ?? null,
        docId: lastDoc.id
      }
    };
  }
}
