import {
  ListFeedbackQuery,
  ListFeedbackResult,
  ListPostsQuery,
  RecentTitleQuery,
  Repository,
  SaveFeedbackInput,
  SavePostInput
} from "../src/types/contracts";
import { PromptPreferences, StoredFeedback, StoredPost } from "../src/types/domain";

export class InMemoryRepository implements Repository {
  public posts: StoredPost[] = [];
  public feedback: StoredFeedback[] = [];
  private readonly preferences = new Map<string, PromptPreferences>();

  private postCounter = 0;
  private feedbackCounter = 0;

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
    const all = this.posts
      .filter((post) => post.userId === query.userId && post.mode === query.mode && post.profileKey === query.profileKey)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    const cursorMs = query.cursor ? Number(query.cursor) : null;
    const filtered = cursorMs ? all.filter((post) => post.createdAtMs < cursorMs) : all;
    const items = filtered.slice(0, query.pageSize);
    const hasMore = filtered.length > query.pageSize;

    return {
      items,
      nextCursor: hasMore ? String(items[items.length - 1].createdAtMs) : null
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

