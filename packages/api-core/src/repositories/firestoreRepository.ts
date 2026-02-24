import { Firestore, Timestamp } from "firebase-admin/firestore";
import { DEFAULT_PROFILE_BY_MODE } from "../services/prefillBlueprint";
import {
  EnsureUserInput,
  ListFeedbackQuery,
  ListFeedbackResult,
  ListPostsQuery,
  NextPrefillPostQuery,
  ReplaceUserPrefillPostsInput,
  RecentTitleQuery,
  Repository,
  SaveFeedbackInput,
  SavePostInput,
  UpdateUserProfileInput
} from "../types/contracts";
import {
  AppUser,
  FeedMode,
  PromptPreferences,
  StoredFeedback,
  StoredPost,
  UserPrefillSummary
} from "../types/domain";
import { ApiError } from "../types/errors";
import { normalizeProfileKey } from "../utils/text";

const PREFILL_DOC_TARGET_BYTES = 900 * 1024;

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return Date.now();
}

function parseUserPrefillStatus(value: unknown): AppUser["prefillStatus"] {
  if (value === "empty" || value === "generating" || value === "ready" || value === "error") {
    return value;
  }
  return "empty";
}

function parseFeedMode(raw: unknown): FeedMode | null {
  if (raw === "BIOGRAPHY" || raw === "TRIVIA" || raw === "NICHE") {
    return raw;
  }
  return null;
}

function normalizeUserEmailDocId(email: string | null | undefined): string | null {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized.replace(/\//g, "_");
}

function isSharedDatasetUserId(userId: string): boolean {
  return userId === "common_prefill_dataset";
}

export class FirestoreRepository implements Repository {
  private readonly postsCollection = "posts";
  private readonly feedbackCollection = "feedback";
  private readonly preferencesCollection = "promptPreferences";
  private readonly usersCollection = "users";
  private readonly userPrefillChunksCollection = "userPrefillChunks";
  private readonly userAuthUidField = "authUid";

  constructor(private readonly db: Firestore) {}

  async getUser(userId: string): Promise<AppUser | null> {
    const userDocId = await this.resolveUserDocId(userId);
    const snap = await this.db.collection(this.usersCollection).doc(userDocId).get();
    if (!snap.exists) {
      return null;
    }
    return this.mapUserDoc(snap.id, snap.data() ?? {});
  }

  async getOrCreateUser(input: EnsureUserInput): Promise<AppUser> {
    const now = Timestamp.now();
    const emailDocId = normalizeUserEmailDocId(input.email);
    const resolvedUserDocId = await this.resolveUserDocId(input.userId);
    const userDocId =
      !isSharedDatasetUserId(input.userId) && emailDocId
        ? emailDocId
        : resolvedUserDocId;

    const userRef = this.db.collection(this.usersCollection).doc(userDocId);
    const legacyUidRef =
      input.userId !== userDocId ? this.db.collection(this.usersCollection).doc(input.userId) : null;
    const [existing, legacyUidSnap] = await Promise.all([
      userRef.get(),
      legacyUidRef ? legacyUidRef.get() : Promise.resolve(null)
    ]);

    if (existing.exists) {
      const patch: Record<string, unknown> = {};
      if (!isSharedDatasetUserId(input.userId)) {
        patch[this.userAuthUidField] = input.userId;
      }
      if (emailDocId) {
        patch.email = emailDocId;
      } else if (input.email === null) {
        patch.email = null;
      }
      if (typeof input.displayName === "string") {
        patch.displayName = input.displayName;
      }
      if (typeof input.photoURL === "string") {
        patch.photoURL = input.photoURL;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await userRef.set(patch, { merge: true });
      }

      if (legacyUidSnap?.exists && legacyUidRef) {
        await this.migrateUserScopedDocuments(input.userId, userDocId, input.userId);
        await legacyUidRef.delete();
      }
      const refreshed = await userRef.get();
      return this.mapUserDoc(refreshed.id, refreshed.data() ?? {});
    }

    if (legacyUidSnap?.exists && legacyUidRef) {
      const legacyData = legacyUidSnap.data() ?? {};
      await userRef.set(
        {
          ...legacyData,
          email: emailDocId ?? (typeof legacyData.email === "string" ? legacyData.email : null),
          displayName:
            input.displayName ??
            (typeof legacyData.displayName === "string" ? legacyData.displayName : null),
          photoURL:
            input.photoURL ??
            (typeof legacyData.photoURL === "string" ? legacyData.photoURL : null),
          [this.userAuthUidField]: isSharedDatasetUserId(input.userId) ? null : input.userId,
          updatedAt: now
        },
        { merge: true }
      );
      await this.migrateUserScopedDocuments(input.userId, userDocId, input.userId);
      await legacyUidRef.delete();
      const createdFromLegacy = await userRef.get();
      return this.mapUserDoc(createdFromLegacy.id, createdFromLegacy.data() ?? {});
    }

    await userRef.set({
      email: emailDocId ?? input.email ?? null,
      displayName: input.displayName ?? null,
      photoURL: input.photoURL ?? null,
      [this.userAuthUidField]: isSharedDatasetUserId(input.userId) ? null : input.userId,
      prefillStatus: "empty",
      prefillPostCount: 0,
      prefillChunkCount: 0,
      prefillBytes: 0,
      prefillUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
      prefillPointers: {}
    });

    return {
      id: input.userId,
      email: emailDocId ?? input.email ?? null,
      profile: {
        displayName: input.displayName ?? null,
        photoURL: input.photoURL ?? null
      },
      prefillStatus: "empty",
      prefillPostCount: 0,
      prefillChunkCount: 0,
      prefillBytes: 0,
      createdAtMs: now.toMillis(),
      updatedAtMs: now.toMillis(),
      prefillUpdatedAtMs: undefined
    };
  }

  async updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<AppUser> {
    const user = await this.getOrCreateUser({ userId });
    const userDocId = await this.resolveUserDocId(userId);
    const ref = this.db.collection(this.usersCollection).doc(userDocId);
    const now = Timestamp.now();

    const displayName = input.displayName === undefined ? user.profile.displayName : input.displayName;
    const photoURL = input.photoURL === undefined ? user.profile.photoURL : input.photoURL;

    await ref.set(
      {
        displayName: displayName ?? null,
        photoURL: photoURL ?? null,
        updatedAt: now
      },
      { merge: true }
    );

    return {
      ...user,
      profile: {
        displayName: displayName ?? null,
        photoURL: photoURL ?? null
      },
      updatedAtMs: now.toMillis()
    };
  }

  async updateUserPrefillStatus(
    userId: string,
    status: AppUser["prefillStatus"],
    summary?: Partial<UserPrefillSummary>
  ): Promise<AppUser> {
    const user = await this.getOrCreateUser({ userId });
    const userDocId = await this.resolveUserDocId(userId);
    const ref = this.db.collection(this.usersCollection).doc(userDocId);
    const now = Timestamp.now();

    const patch: Record<string, unknown> = {
      prefillStatus: status,
      updatedAt: now
    };

    if (summary) {
      if (typeof summary.postCount === "number") {
        patch.prefillPostCount = summary.postCount;
      }
      if (typeof summary.chunkCount === "number") {
        patch.prefillChunkCount = summary.chunkCount;
      }
      if (typeof summary.totalBytes === "number") {
        patch.prefillBytes = summary.totalBytes;
      }
      if (typeof summary.generatedAtMs === "number") {
        patch.prefillUpdatedAt = Timestamp.fromMillis(summary.generatedAtMs);
      }
    }

    await ref.set(patch, { merge: true });
    const updated = await this.getOrCreateUser({ userId });
    return {
      ...updated,
      prefillStatus: status
    };
  }

  async replaceUserPrefillPosts(input: ReplaceUserPrefillPostsInput): Promise<UserPrefillSummary> {
    const now = Timestamp.now();
    const userDocId = await this.resolveUserDocId(input.userId);
    const preparedPosts = input.posts.map((post, index) => ({
      id: String(post.id || `prefill-${index + 1}`),
      userId: input.userId,
      mode: post.mode,
      profile: String(post.profile),
      profileKey: String(post.profileKey),
      length: post.length,
      title: String(post.title),
      body: String(post.body),
      post_type: String(post.post_type),
      tags: Array.isArray(post.tags) ? post.tags.map((tag) => String(tag)) : [],
      confidence: post.confidence,
      uncertainty_note: post.uncertainty_note ?? null,
      createdAtMs: Number(post.createdAtMs) || Date.now() + index
    }));

    const chunks = this.chunkPostsByDocumentSize(userDocId, preparedPosts);
    const existingChunks = await this.db
      .collection(this.userPrefillChunksCollection)
      .where("userId", "==", userDocId)
      .get();

    const batch = this.db.batch();
    for (const doc of existingChunks.docs) {
      batch.delete(doc.ref);
    }

    chunks.forEach((chunk, index) => {
      const docId = `${userDocId}_${String(index + 1).padStart(4, "0")}`;
      const ref = this.db.collection(this.userPrefillChunksCollection).doc(docId);
      batch.set(ref, {
        userId: userDocId,
        [this.userAuthUidField]: isSharedDatasetUserId(input.userId) ? null : input.userId,
        chunkIndex: index,
        sizeBytes: chunk.sizeBytes,
        posts: chunk.posts,
        createdAt: now,
        updatedAt: now
      });
    });

    await batch.commit();

    const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0);
    const summary: UserPrefillSummary = {
      postCount: preparedPosts.length,
      chunkCount: chunks.length,
      totalBytes,
      generatedAtMs: now.toMillis()
    };

    await this.db
      .collection(this.usersCollection)
      .doc(userDocId)
      .set(
        {
          [this.userAuthUidField]: isSharedDatasetUserId(input.userId) ? null : input.userId,
          prefillStatus: "ready",
          prefillPostCount: summary.postCount,
          prefillChunkCount: summary.chunkCount,
          prefillBytes: summary.totalBytes,
          prefillUpdatedAt: Timestamp.fromMillis(summary.generatedAtMs),
          updatedAt: now
        },
        { merge: true }
      );

    return summary;
  }

  async getNextPrefillPost(query: NextPrefillPostQuery): Promise<StoredPost | null> {
    const all = await this.listAllPrefillPosts(query.userId);
    const filtered = this.filterPostsWithFallback(all, query.mode, query.profileKey).filter(
      (post) => post.length === query.length
    );
    if (!filtered.length) {
      return null;
    }

    const userDocId = await this.resolveUserDocId(query.userId);
    const ref = this.db.collection(this.usersCollection).doc(userDocId);
    const snap = await ref.get();
    const data = snap.data() ?? {};
    const pointers =
      data.prefillPointers && typeof data.prefillPointers === "object"
        ? ({ ...(data.prefillPointers as Record<string, unknown>) } as Record<string, number>)
        : {};
    const key = `${query.mode}:${query.profileKey}:${query.length}`;
    const currentPointerRaw = pointers[key];
    const currentPointer = typeof currentPointerRaw === "number" && currentPointerRaw >= 0 ? currentPointerRaw : 0;
    const selected = filtered[currentPointer % filtered.length];

    pointers[key] = currentPointer + 1;
    await ref.set(
      {
        prefillPointers: pointers,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );

    return selected;
  }

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
    const all = await this.listAllPrefillPosts(query.userId);
    const filtered = this.filterPostsWithFallback(all, query.mode, query.profileKey);

    const offsetRaw = Number(query.cursor ?? "0");
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;
    const items = filtered.slice(offset, offset + query.pageSize);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < filtered.length ? String(nextOffset) : null
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
    const userDocId = await this.resolveUserDocId(userId);
    const ref = this.db.collection(this.preferencesCollection).doc(userDocId);
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
    const userDocId = await this.resolveUserDocId(userId);
    const ref = this.db.collection(this.preferencesCollection).doc(userDocId);
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

  private mapUserDoc(userId: string, data: Record<string, unknown>): AppUser {
    const authUid =
      typeof data[this.userAuthUidField] === "string" && String(data[this.userAuthUidField]).trim()
        ? String(data[this.userAuthUidField]).trim()
        : userId;
    return {
      id: authUid,
      email: typeof data.email === "string" ? data.email : null,
      profile: {
        displayName: typeof data.displayName === "string" ? data.displayName : null,
        photoURL: typeof data.photoURL === "string" ? data.photoURL : null
      },
      prefillStatus: parseUserPrefillStatus(data.prefillStatus),
      prefillPostCount: typeof data.prefillPostCount === "number" ? data.prefillPostCount : 0,
      prefillChunkCount: typeof data.prefillChunkCount === "number" ? data.prefillChunkCount : 0,
      prefillBytes: typeof data.prefillBytes === "number" ? data.prefillBytes : 0,
      createdAtMs: toMillis(data.createdAt),
      updatedAtMs: toMillis(data.updatedAt),
      prefillUpdatedAtMs: data.prefillUpdatedAt ? toMillis(data.prefillUpdatedAt) : undefined
    };
  }

  private chunkPostsByDocumentSize(userId: string, posts: StoredPost[]): Array<{ posts: StoredPost[]; sizeBytes: number }> {
    const chunks: Array<{ posts: StoredPost[]; sizeBytes: number }> = [];
    let current: StoredPost[] = [];

    const estimate = (value: StoredPost[]): number =>
      Buffer.byteLength(
        JSON.stringify({
          userId,
          chunkIndex: 0,
          posts: value
        }),
        "utf8"
      );

    for (const post of posts) {
      const singleSize = estimate([post]);
      if (singleSize > PREFILL_DOC_TARGET_BYTES) {
        throw new ApiError(400, "prefill_post_too_large", "Single prefill post is larger than 900KB document target.");
      }

      const tentative = [...current, post];
      const tentativeBytes = estimate(tentative);
      if (tentativeBytes <= PREFILL_DOC_TARGET_BYTES) {
        current = tentative;
        continue;
      }

      chunks.push({
        posts: current,
        sizeBytes: estimate(current)
      });
      current = [post];
    }

    if (current.length) {
      chunks.push({
        posts: current,
        sizeBytes: estimate(current)
      });
    }

    return chunks;
  }

  async listAllPrefillPosts(userId: string): Promise<StoredPost[]> {
    const userDocId = await this.resolveUserDocId(userId);
    const snapshot = await this.db
      .collection(this.userPrefillChunksCollection)
      .where("userId", "==", userDocId)
      .orderBy("chunkIndex", "asc")
      .get();

    const posts: StoredPost[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const chunkPosts = Array.isArray(data.posts) ? data.posts : [];
      for (const raw of chunkPosts) {
        const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const mode = parseFeedMode(value.mode);
        if (!mode) {
          continue;
        }

        posts.push({
          id: String(value.id ?? `${doc.id}-${posts.length + 1}`),
          userId,
          mode,
          profile: String(value.profile ?? DEFAULT_PROFILE_BY_MODE[mode]),
          profileKey: String(
            value.profileKey ??
              normalizeProfileKey(String(value.profile ?? DEFAULT_PROFILE_BY_MODE[mode]))
          ),
          length: value.length === "medium" ? "medium" : "short",
          title: String(value.title ?? ""),
          body: String(value.body ?? ""),
          post_type: String(value.post_type ?? "micro_essay"),
          tags: Array.isArray(value.tags) ? value.tags.map((tag) => String(tag)) : [],
          confidence: value.confidence === "high" || value.confidence === "low" ? value.confidence : "medium",
          uncertainty_note: value.uncertainty_note == null ? null : String(value.uncertainty_note),
          createdAtMs:
            typeof value.createdAtMs === "number" && Number.isFinite(value.createdAtMs)
              ? value.createdAtMs
              : Date.now()
        });
      }
    }

    return posts.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  private async resolveUserDocId(userId: string): Promise<string> {
    if (isSharedDatasetUserId(userId)) {
      return userId;
    }

    const normalizedEmailId = normalizeUserEmailDocId(userId);
    if (normalizedEmailId && normalizedEmailId === userId.toLowerCase()) {
      return normalizedEmailId;
    }

    const directSnap = await this.db.collection(this.usersCollection).doc(userId).get();
    if (directSnap.exists) {
      return userId;
    }

    const byAuthUidSnap = await this.db
      .collection(this.usersCollection)
      .where(this.userAuthUidField, "==", userId)
      .limit(1)
      .get();
    if (!byAuthUidSnap.empty) {
      return byAuthUidSnap.docs[0].id;
    }

    return userId;
  }

  private async migrateUserScopedDocuments(fromUserDocId: string, toUserDocId: string, authUid: string): Promise<void> {
    if (fromUserDocId === toUserDocId) {
      return;
    }

    const now = Timestamp.now();
    const [preferencesSnap, chunkSnap] = await Promise.all([
      this.db.collection(this.preferencesCollection).doc(fromUserDocId).get(),
      this.db.collection(this.userPrefillChunksCollection).where("userId", "==", fromUserDocId).get()
    ]);

    const batch = this.db.batch();
    if (preferencesSnap.exists) {
      const targetPreferencesRef = this.db.collection(this.preferencesCollection).doc(toUserDocId);
      batch.set(targetPreferencesRef, preferencesSnap.data() ?? {}, { merge: true });
      batch.delete(preferencesSnap.ref);
    }

    for (const sourceChunk of chunkSnap.docs) {
      const data = sourceChunk.data();
      const chunkIndex = typeof data.chunkIndex === "number" ? Math.max(0, data.chunkIndex) : 0;
      const targetDocId = `${toUserDocId}_${String(chunkIndex + 1).padStart(4, "0")}`;
      const targetRef = this.db.collection(this.userPrefillChunksCollection).doc(targetDocId);
      batch.set(
        targetRef,
        {
          ...data,
          userId: toUserDocId,
          [this.userAuthUidField]: authUid,
          updatedAt: now
        },
        { merge: true }
      );
      if (sourceChunk.id !== targetDocId) {
        batch.delete(sourceChunk.ref);
      }
    }

    await batch.commit();
  }

  private filterPostsWithFallback(posts: StoredPost[], mode: FeedMode, profileKey: string): StoredPost[] {
    const exact = posts.filter((post) => post.mode === mode && post.profileKey === profileKey);
    if (exact.length) {
      return exact;
    }
    const fallbackProfileKey = normalizeProfileKey(DEFAULT_PROFILE_BY_MODE[mode]);
    return posts.filter((post) => post.mode === mode && post.profileKey === fallbackProfileKey);
  }
}
