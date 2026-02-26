import { SportId } from "./sportsNewsSources";
import { SportsGameDraft, SportsStory } from "./sportsNewsService";

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
