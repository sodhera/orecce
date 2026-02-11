import {
  EnsureUserInput,
  LlmGateway,
  LlmGenerationInput,
  ListFeedbackQuery,
  ListFeedbackResult,
  ListPostsQuery,
  NextPrefillPostQuery,
  ReplaceUserPrefillPostsInput,
  RecentTitleQuery,
  Repository,
  SaveFeedbackInput,
  SavePostInput,
  StreamChunkHandler,
  UpdateUserProfileInput
} from "../src/types/contracts";
import { AppUser, GeneratedPost, PromptPreferences, StoredFeedback, StoredPost, UserPrefillSummary } from "../src/types/domain";
import { DEFAULT_PROFILE_BY_MODE } from "../src/services/prefillBlueprint";
import { normalizeProfileKey } from "../src/utils/text";

export class InMemoryRepository implements Repository {
  public posts: StoredPost[] = [];
  public feedback: StoredFeedback[] = [];
  private readonly preferences = new Map<string, PromptPreferences>();
  private readonly users = new Map<string, AppUser>();
  private readonly prefillPosts = new Map<string, StoredPost[]>();
  private readonly prefillPointers = new Map<string, number>();

  private postCounter = 0;
  private feedbackCounter = 0;

  async getUser(userId: string): Promise<AppUser | null> {
    return this.users.get(userId) ?? null;
  }

  async getOrCreateUser(input: EnsureUserInput): Promise<AppUser> {
    const existing = this.users.get(input.userId);
    if (existing) {
      return existing;
    }
    const now = Date.now();
    const created: AppUser = {
      id: input.userId,
      email: input.email ?? null,
      profile: {
        displayName: input.displayName ?? null,
        photoURL: input.photoURL ?? null
      },
      prefillStatus: "empty",
      prefillPostCount: 0,
      prefillChunkCount: 0,
      prefillBytes: 0,
      createdAtMs: now,
      updatedAtMs: now
    };
    this.users.set(input.userId, created);
    return created;
  }

  async updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<AppUser> {
    const current = await this.getOrCreateUser({ userId });
    const updated: AppUser = {
      ...current,
      profile: {
        displayName: input.displayName === undefined ? current.profile.displayName : input.displayName,
        photoURL: input.photoURL === undefined ? current.profile.photoURL : input.photoURL
      },
      updatedAtMs: Date.now()
    };
    this.users.set(userId, updated);
    return updated;
  }

  async updateUserPrefillStatus(
    userId: string,
    status: AppUser["prefillStatus"],
    summary?: Partial<UserPrefillSummary>
  ): Promise<AppUser> {
    const current = await this.getOrCreateUser({ userId });
    const updated: AppUser = {
      ...current,
      prefillStatus: status,
      prefillPostCount: typeof summary?.postCount === "number" ? summary.postCount : current.prefillPostCount,
      prefillChunkCount: typeof summary?.chunkCount === "number" ? summary.chunkCount : current.prefillChunkCount,
      prefillBytes: typeof summary?.totalBytes === "number" ? summary.totalBytes : current.prefillBytes,
      prefillUpdatedAtMs:
        typeof summary?.generatedAtMs === "number" ? summary.generatedAtMs : current.prefillUpdatedAtMs,
      updatedAtMs: Date.now()
    };
    this.users.set(userId, updated);
    return updated;
  }

  async replaceUserPrefillPosts(input: ReplaceUserPrefillPostsInput): Promise<UserPrefillSummary> {
    const nextPosts = input.posts.map((post, index) => ({
      ...post,
      id: post.id || `prefill-${index + 1}`,
      userId: input.userId,
      createdAtMs: post.createdAtMs || Date.now() + index
    }));
    this.prefillPosts.set(input.userId, nextPosts);

    const totalBytes = Buffer.byteLength(JSON.stringify(nextPosts), "utf8");
    const summary: UserPrefillSummary = {
      postCount: nextPosts.length,
      chunkCount: Math.max(1, Math.ceil(totalBytes / (900 * 1024))),
      totalBytes,
      generatedAtMs: Date.now()
    };
    await this.updateUserPrefillStatus(input.userId, "ready", summary);
    return summary;
  }

  async listAllPrefillPosts(userId: string): Promise<StoredPost[]> {
    return [...(this.prefillPosts.get(userId) ?? [])].sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  async getNextPrefillPost(query: NextPrefillPostQuery): Promise<StoredPost | null> {
    const posts = this.prefillPosts.get(query.userId) ?? [];
    const exact = posts.filter(
      (post) =>
        post.mode === query.mode &&
        post.profileKey === query.profileKey &&
        post.length === query.length
    );
    const fallbackKey = normalizeProfileKey(DEFAULT_PROFILE_BY_MODE[query.mode]);
    const fallback = posts.filter(
      (post) =>
        post.mode === query.mode &&
        post.profileKey === fallbackKey &&
        post.length === query.length
    );
    const candidates = exact.length ? exact : fallback;
    if (!candidates.length) {
      return null;
    }

    const pointerKey = `${query.userId}:${query.mode}:${query.profileKey}:${query.length}`;
    const pointer = this.prefillPointers.get(pointerKey) ?? 0;
    this.prefillPointers.set(pointerKey, pointer + 1);
    return candidates[pointer % candidates.length];
  }

  async getRecentTitles(query: RecentTitleQuery): Promise<string[]> {
    return this.posts
      .filter((post) => post.userId === query.userId && post.mode === query.mode && post.profileKey === query.profileKey)
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, query.limit)
      .map((post) => post.title);
  }

  async savePost(input: SavePostInput): Promise<StoredPost> {
    this.postCounter += 1;
    const item: StoredPost = {
      id: `post-${this.postCounter}`,
      userId: input.userId,
      mode: input.mode,
      profile: input.profile,
      profileKey: input.profileKey,
      length: input.length,
      ...input.payload,
      createdAtMs: Date.now() + this.postCounter
    };
    this.posts.push(item);
    return item;
  }

  async listPosts(query: ListPostsQuery): Promise<{ items: StoredPost[]; nextCursor: string | null }> {
    const allPrefills = this.prefillPosts.get(query.userId) ?? [];
    if (!allPrefills.length) {
      const legacy = this.posts
        .filter((post) => post.userId === query.userId && post.mode === query.mode && post.profileKey === query.profileKey)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      const legacyOffsetRaw = Number(query.cursor ?? "0");
      const legacyOffset =
        Number.isFinite(legacyOffsetRaw) && legacyOffsetRaw >= 0 ? Math.floor(legacyOffsetRaw) : 0;
      const legacyItems = legacy.slice(legacyOffset, legacyOffset + query.pageSize);
      const legacyNextOffset = legacyOffset + legacyItems.length;
      return {
        items: legacyItems,
        nextCursor: legacyNextOffset < legacy.length ? String(legacyNextOffset) : null
      };
    }

    const exact = allPrefills.filter(
      (post) => post.mode === query.mode && post.profileKey === query.profileKey
    );
    const fallbackKey = normalizeProfileKey(DEFAULT_PROFILE_BY_MODE[query.mode]);
    const all = (exact.length
      ? exact
      : allPrefills.filter((post) => post.mode === query.mode && post.profileKey === fallbackKey))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    const cursorMs = query.cursor ? Number(query.cursor) : null;
    const offset = cursorMs && cursorMs > 0 ? Math.floor(cursorMs) : 0;
    const items = all.slice(offset, offset + query.pageSize);
    const hasMore = offset + query.pageSize < all.length;

    return {
      items,
      nextCursor: hasMore ? String(offset + items.length) : null
    };
  }

  async saveFeedback(input: SaveFeedbackInput): Promise<StoredFeedback> {
    this.feedbackCounter += 1;
    const item: StoredFeedback = {
      id: `fb-${this.feedbackCounter}`,
      userId: input.userId,
      postId: input.postId,
      type: input.type,
      createdAtMs: Date.now() + this.feedbackCounter
    };
    this.feedback.push(item);
    return item;
  }

  async listFeedback(query: ListFeedbackQuery): Promise<ListFeedbackResult> {
    const all = this.feedback
      .filter((item) => item.userId === query.userId)
      .filter((item) => (query.postId ? item.postId === query.postId : true))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    const cursorMs = query.cursor ? Number(query.cursor) : null;
    const filtered = cursorMs ? all.filter((item) => item.createdAtMs < cursorMs) : all;
    const items = filtered.slice(0, query.pageSize);
    const hasMore = filtered.length > query.pageSize;

    return {
      items,
      nextCursor: hasMore ? String(items[items.length - 1].createdAtMs) : null
    };
  }

  async getPromptPreferences(userId: string): Promise<PromptPreferences> {
    return this.preferences.get(userId) ?? { biographyInstructions: "", nicheInstructions: "" };
  }

  async setPromptPreferences(userId: string, input: Partial<PromptPreferences>): Promise<PromptPreferences> {
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
    this.preferences.set(userId, next);
    return next;
  }
}

export class FakeGateway implements LlmGateway {
  public readonly calls: LlmGenerationInput[] = [];

  constructor(private readonly sequence: GeneratedPost[]) {}

  async generatePost(input: LlmGenerationInput): Promise<GeneratedPost> {
    this.calls.push(input);
    const next = this.sequence.shift();
    if (!next) {
      throw new Error("No fake LLM response available");
    }
    return next;
  }

  async generatePostStream(input: LlmGenerationInput, onChunk: StreamChunkHandler): Promise<GeneratedPost> {
    const post = await this.generatePost(input);
    onChunk(post.body.slice(0, 60));
    return post;
  }
}
