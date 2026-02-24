import {
  AppUser,
  FeedMode,
  FeedbackType,
  GeneratedPost,
  ListPostsResult,
  PostLength,
  PromptPreferences,
  StoredFeedback,
  StoredPost,
  UserPrefillSummary
} from "./domain";

export interface RecentTitleQuery {
  userId: string;
  mode: FeedMode;
  profileKey: string;
  limit: number;
}

export interface SavePostInput {
  userId: string;
  mode: FeedMode;
  profile: string;
  profileKey: string;
  length: PostLength;
  payload: GeneratedPost;
}

export interface ListPostsQuery {
  userId: string;
  mode: FeedMode;
  profileKey: string;
  profileRaw: string;
  pageSize: number;
  cursor?: string;
}

export interface SaveFeedbackInput {
  userId: string;
  postId: string;
  type: FeedbackType;
}

export interface ListFeedbackQuery {
  userId: string;
  postId?: string;
  pageSize: number;
  cursor?: string;
}

export interface ListFeedbackResult {
  items: StoredFeedback[];
  nextCursor: string | null;
}

export interface EnsureUserInput {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

export interface UpdateUserProfileInput {
  displayName?: string | null;
  photoURL?: string | null;
}

export interface NextPrefillPostQuery {
  userId: string;
  mode: FeedMode;
  profile: string;
  profileKey: string;
  length: PostLength;
}

export interface ReplaceUserPrefillPostsInput {
  userId: string;
  posts: StoredPost[];
}

export interface Repository {
  getUser(userId: string): Promise<AppUser | null>;
  getOrCreateUser(input: EnsureUserInput): Promise<AppUser>;
  updateUserProfile(userId: string, input: UpdateUserProfileInput): Promise<AppUser>;
  updateUserPrefillStatus(
    userId: string,
    status: AppUser["prefillStatus"],
    summary?: Partial<UserPrefillSummary>
  ): Promise<AppUser>;
  replaceUserPrefillPosts(input: ReplaceUserPrefillPostsInput): Promise<UserPrefillSummary>;
  listAllPrefillPosts(userId: string): Promise<StoredPost[]>;
  getNextPrefillPost(query: NextPrefillPostQuery): Promise<StoredPost | null>;
  getRecentTitles(query: RecentTitleQuery): Promise<string[]>;
  savePost(input: SavePostInput): Promise<StoredPost>;
  listPosts(query: ListPostsQuery): Promise<ListPostsResult>;
  saveFeedback(input: SaveFeedbackInput): Promise<StoredFeedback>;
  listFeedback(query: ListFeedbackQuery): Promise<ListFeedbackResult>;
  getPromptPreferences(userId: string): Promise<PromptPreferences>;
  setPromptPreferences(userId: string, input: Partial<PromptPreferences>): Promise<PromptPreferences>;
}

export interface LlmGenerationInput {
  mode: FeedMode;
  profile: string;
  length: PostLength;
  recentTitles: string[];
  preferences: PromptPreferences;
  correctiveInstruction?: string;
}

export type StreamChunkHandler = (chunk: string) => void;

export interface LlmGateway {
  generatePost(input: LlmGenerationInput): Promise<GeneratedPost>;
  generatePostStream(input: LlmGenerationInput, onChunk: StreamChunkHandler): Promise<GeneratedPost>;
}
