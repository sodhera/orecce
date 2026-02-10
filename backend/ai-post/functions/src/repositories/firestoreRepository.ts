import { Firestore, Timestamp } from "firebase-admin/firestore";
import { ListFeedbackResult, ListFeedbackQuery, ListPostsQuery, RecentTitleQuery, Repository, SaveFeedbackInput, SavePostInput } from "../types/contracts";
import { PromptPreferences, StoredFeedback, StoredPost } from "../types/domain";

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return Date.now();
}

export class FirestoreRepository implements Repository {
  private readonly postsCollection = "posts";
  private readonly feedbackCollection = "feedback";
  private readonly preferencesCollection = "promptPreferences";

  constructor(private readonly db: Firestore) {}

  async getRecentTitles(query: RecentTitleQuery): Promise<string[]> {
    const snapshot = await this.db
      .collection(this.postsCollection)
      .where("userId", "==", query.userId)
      .where("mode", "==", query.mode)
      .where("profileKey", "==", query.profileKey)
      .orderBy("createdAt", "desc")
      .limit(query.limit)
      .get();

    return snapshot.docs
      .map((doc) => doc.data().title)
      .filter((title): title is string => typeof title === "string" && title.trim().length > 0);
  }

  async savePost(input: SavePostInput): Promise<StoredPost> {
    const ref = this.db.collection(this.postsCollection).doc();
    const createdAt = Timestamp.now();

    await ref.set({
      userId: input.userId,
      mode: input.mode,
      profile: input.profile,
      profileKey: input.profileKey,
      length: input.length,
      ...input.payload,
      createdAt
    });

    return {
      id: ref.id,
      userId: input.userId,
      mode: input.mode,
      profile: input.profile,
      profileKey: input.profileKey,
      length: input.length,
      ...input.payload,
      createdAtMs: createdAt.toMillis()
    };
  }

  async listPosts(query: ListPostsQuery): Promise<{ items: StoredPost[]; nextCursor: string | null }> {
    let firestoreQuery = this.db
      .collection(this.postsCollection)
      .where("userId", "==", query.userId)
      .where("mode", "==", query.mode)
      .where("profileKey", "==", query.profileKey)
      .orderBy("createdAt", "desc")
      .limit(query.pageSize + 1);

    if (query.cursor) {
      const cursorMs = Number(query.cursor);
      if (!Number.isNaN(cursorMs) && cursorMs > 0) {
        firestoreQuery = firestoreQuery.startAfter(Timestamp.fromMillis(cursorMs));
      }
    }

    const snapshot = await firestoreQuery.get();
    const docs = snapshot.docs;
    const hasMore = docs.length > query.pageSize;
    const pageDocs = hasMore ? docs.slice(0, query.pageSize) : docs;

    const items = pageDocs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: String(data.userId),
        mode: data.mode,
        profile: String(data.profile),
        profileKey: String(data.profileKey),
        length: data.length,
        title: String(data.title),
        body: String(data.body),
        post_type: String(data.post_type),
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
        confidence: data.confidence,
        uncertainty_note: data.uncertainty_note ?? null,
        createdAtMs: toMillis(data.createdAt)
      } as StoredPost;
    });

    const nextCursor = hasMore ? String(items[items.length - 1]?.createdAtMs ?? "") : null;

    return {
      items,
      nextCursor: nextCursor || null
    };
  }

  async saveFeedback(input: SaveFeedbackInput): Promise<StoredFeedback> {
    const ref = this.db.collection(this.feedbackCollection).doc();
    const createdAt = Timestamp.now();

    await ref.set({
      userId: input.userId,
      postId: input.postId,
      type: input.type,
      createdAt
    });

    return {
      id: ref.id,
      userId: input.userId,
      postId: input.postId,
      type: input.type,
      createdAtMs: createdAt.toMillis()
    };
  }

  async listFeedback(query: ListFeedbackQuery): Promise<ListFeedbackResult> {
    let firestoreQuery = this.db
      .collection(this.feedbackCollection)
      .where("userId", "==", query.userId)
      .orderBy("createdAt", "desc")
      .limit(query.pageSize + 1);

    if (query.postId) {
      firestoreQuery = this.db
        .collection(this.feedbackCollection)
        .where("userId", "==", query.userId)
        .where("postId", "==", query.postId)
        .orderBy("createdAt", "desc")
        .limit(query.pageSize + 1);
    }

    if (query.cursor) {
      const cursorMs = Number(query.cursor);
      if (!Number.isNaN(cursorMs) && cursorMs > 0) {
        firestoreQuery = firestoreQuery.startAfter(Timestamp.fromMillis(cursorMs));
      }
    }

    const snapshot = await firestoreQuery.get();
    const docs = snapshot.docs;
    const hasMore = docs.length > query.pageSize;
    const pageDocs = hasMore ? docs.slice(0, query.pageSize) : docs;

    const items = pageDocs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: String(data.userId),
        postId: String(data.postId),
        type: data.type,
        createdAtMs: toMillis(data.createdAt)
      } as StoredFeedback;
    });

    const nextCursor = hasMore ? String(items[items.length - 1]?.createdAtMs ?? "") : null;

    return {
      items,
      nextCursor: nextCursor || null
    };
  }

  async getPromptPreferences(userId: string): Promise<PromptPreferences> {
    const ref = this.db.collection(this.preferencesCollection).doc(userId);
    const snap = await ref.get();
    if (!snap.exists) {
      return {
        biographyInstructions: "",
        nicheInstructions: ""
      };
    }

    const data = snap.data() ?? {};
    return {
      biographyInstructions: typeof data.biographyInstructions === "string" ? data.biographyInstructions : "",
      nicheInstructions: typeof data.nicheInstructions === "string" ? data.nicheInstructions : "",
      updatedAtMs: toMillis(data.updatedAt)
    };
  }

  async setPromptPreferences(userId: string, input: Partial<PromptPreferences>): Promise<PromptPreferences> {
    const ref = this.db.collection(this.preferencesCollection).doc(userId);
    const current = await this.getPromptPreferences(userId);

    const next: PromptPreferences = {
      biographyInstructions:
        typeof input.biographyInstructions === "string"
          ? input.biographyInstructions
          : current.biographyInstructions,
      nicheInstructions:
        typeof input.nicheInstructions === "string" ? input.nicheInstructions : current.nicheInstructions,
      updatedAtMs: Date.now()
    };

    await ref.set(
      {
        biographyInstructions: next.biographyInstructions,
        nicheInstructions: next.nicheInstructions,
        updatedAt: Timestamp.fromMillis(next.updatedAtMs ?? Date.now())
      },
      { merge: true }
    );

    return next;
  }
}
