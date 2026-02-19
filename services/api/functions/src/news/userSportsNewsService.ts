import { parseSportId, SportId, SPORT_IDS, supportedSportsText } from "./sportsNewsSources";
import { FetchSportsStoriesInput, SportsNewsService, SportsStory } from "./sportsNewsService";
import {
  UserSportsFeedCursor,
  UserSportsFeedItem,
  UserSportsNewsRepository,
  UserSportsSyncState
} from "./userSportsNewsRepository";
import { getSportsNewsMinSourcesPerGame } from "../config/runtimeConfig";

interface UserSportsNewsServiceDeps {
  sportsNewsService: SportsNewsService;
  repository: UserSportsNewsRepository;
}

interface RefreshUserSportsStoriesInput {
  userId: string;
  sport: string;
  limit: number;
  userAgent: string;
  feedTimeoutMs: number;
  articleTimeoutMs: number;
  deadlineMs?: number;
}

interface UserSportsFeedResult {
  items: UserSportsFeedItem[];
  nextCursor: string | null;
}

interface ListUserFeedStoriesInput {
  limit: number;
  cursor?: string;
  sports?: string[];
}

interface DecodedFeedCursor {
  cursor: UserSportsFeedCursor;
  sportsKey: string;
}

const FEED_CACHE_TTL_MS = 20_000;
const STORY_CACHE_TTL_MS = 60_000;

export class UserSportsNewsService {
  private readonly sportsNewsService: SportsNewsService;
  private readonly repository: UserSportsNewsRepository;
  private readonly feedCache = new Map<string, { expiresAtMs: number; value: UserSportsFeedResult }>();
  private readonly storyCache = new Map<string, { expiresAtMs: number; value: SportsStory | null }>();

  constructor(deps: UserSportsNewsServiceDeps) {
    this.sportsNewsService = deps.sportsNewsService;
    this.repository = deps.repository;
  }

  private static nowMs(): number {
    return Date.now();
  }

  private static feedCacheKey(userId: string, limit: number, cursor: string | undefined, sportsKey: string): string {
    return `${userId}|${limit}|${cursor ?? ""}|${sportsKey}`;
  }

  private static storyCacheKey(userId: string, storyId: string): string {
    return `${userId}|${storyId}`;
  }

  private clearUserCaches(userId: string): void {
    const feedPrefix = `${userId}|`;
    for (const key of this.feedCache.keys()) {
      if (key.startsWith(feedPrefix)) {
        this.feedCache.delete(key);
      }
    }
    for (const key of this.storyCache.keys()) {
      if (key.startsWith(feedPrefix)) {
        this.storyCache.delete(key);
      }
    }
  }

  private static normalizeSportsFilter(sports?: string[]): SportId[] {
    if (!Array.isArray(sports) || sports.length === 0) {
      return [];
    }
    const normalized: SportId[] = [];
    for (const item of sports) {
      const sport = UserSportsNewsService.normalizeSport(item);
      if (!normalized.includes(sport)) {
        normalized.push(sport);
      }
    }
    if (normalized.length === SPORT_IDS.length) {
      return [];
    }
    return normalized;
  }

  private static sportsFilterKey(sports: SportId[]): string {
    return sports.slice().sort().join("|");
  }

  private static encodeFeedCursor(cursor: UserSportsFeedCursor, sportsKey: string): string {
    const payload = JSON.stringify({
      p: cursor.publishedAtMs,
      d: cursor.docId,
      s: sportsKey
    });
    return Buffer.from(payload, "utf8").toString("base64url");
  }

  private static decodeFeedCursor(value?: string): DecodedFeedCursor | undefined {
    const raw = String(value ?? "").trim();
    if (!raw) {
      return undefined;
    }
    try {
      const decoded = Buffer.from(raw, "base64url").toString("utf8");
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      const docId = String(parsed.d ?? "").trim();
      if (!docId) {
        throw new Error("Invalid sports feed cursor.");
      }
      const sportsKey = String(parsed.s ?? "");
      const publishedRaw = parsed.p;
      const publishedAtMs =
        publishedRaw === null
          ? null
          : typeof publishedRaw === "number" && Number.isFinite(publishedRaw)
            ? Math.floor(publishedRaw)
            : null;
      return {
        cursor: {
          publishedAtMs,
          docId
        },
        sportsKey
      };
    } catch {
      throw new Error("Invalid sports feed cursor.");
    }
  }

  private static resolveDateKey(timestampMs: number, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date(timestampMs));

    const year = parts.find((part) => part.type === "year")?.value ?? "1970";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";
    return `${year}-${month}-${day}`;
  }

  private static currentDateWindow(timeZone: string): { todayKey: string; yesterdayKey: string } {
    const todayKey = this.resolveDateKey(Date.now(), timeZone);
    const yesterdayKey = this.resolveDateKey(Date.now() - 24 * 60 * 60 * 1000, timeZone);
    return { todayKey, yesterdayKey };
  }

  private static normalizeSport(sport: string): SportId {
    const normalized = parseSportId(sport);
    if (!normalized) {
      throw new Error(`Unsupported sport. Supported sports: ${supportedSportsText()}.`);
    }
    return normalized;
  }

  private async updateSyncState(userId: string, sport: SportId, state: UserSportsSyncState): Promise<void> {
    await this.repository.replaceSyncStateForUser(userId, sport, state);
  }

  private static hasRequiredSourceCoverage(story: SportsStory): boolean {
    const minSourcesPerGame = getSportsNewsMinSourcesPerGame();
    const sourceIds = Array.from(
      new Set(
        String(story.sourceId ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
    return sourceIds.length >= minSourcesPerGame;
  }

  private static isAcceptableSportsStory(story: SportsStory): boolean {
    return story.fullTextStatus === "ready" && this.hasRequiredSourceCoverage(story);
  }

  async requestRefresh(userId: string, sport: string): Promise<{ sport: SportId }> {
    const normalized = UserSportsNewsService.normalizeSport(sport);
    const existingState = await this.repository.getSyncStateForUser(userId, normalized);
    if (!existingState || existingState.status !== "running") {
      const now = Date.now();
      await this.updateSyncState(userId, normalized, {
        status: "running",
        step: "looking_games",
        message: "Queued sports refresh.",
        totalGames: 0,
        processedGames: 0,
        foundGames: [],
        startedAtMs: now,
        updatedAtMs: now
      });
    }
    await this.repository.enqueueRefreshForUser(userId, normalized);
    return { sport: normalized };
  }

  async refreshUserStories(input: RefreshUserSportsStoriesInput): Promise<{ sport: SportId; stories: SportsStory[] }> {
    const sport = UserSportsNewsService.normalizeSport(input.sport);
    const timeZone = "America/New_York";
    const boundedLimit = Math.max(1, Math.min(60, Math.floor(input.limit)));
    const { todayKey, yesterdayKey } = UserSportsNewsService.currentDateWindow(timeZone);
    const activeDateKeys = new Set([todayKey, yesterdayKey]);

    const existingStories = await this.repository.listStoriesForUser(input.userId, sport, 200);
    const existingDateKeys = new Set(existingStories.map((story) => story.gameDateKey));
    const hasFreshCoverage = existingDateKeys.has(todayKey) && existingDateKeys.has(yesterdayKey);
    const knownGameIds = hasFreshCoverage
      ? existingStories
          .filter((story) => activeDateKeys.has(story.gameDateKey))
          .filter((story) => UserSportsNewsService.isAcceptableSportsStory(story))
          .map((story) => story.gameId)
      : [];

    const startedAtMs = Date.now();
    await this.updateSyncState(input.userId, sport, {
      status: "running",
      step: "looking_games",
      message: hasFreshCoverage
        ? "Looking at games. Existing coverage found for today and yesterday; checking for newer games."
        : "Looking at games from today and yesterday.",
      totalGames: 0,
      processedGames: 0,
      foundGames: [],
      startedAtMs,
      updatedAtMs: startedAtMs
    });

    try {
      const generatedByGameId = new Map<string, SportsStory>();

      const fetched = await this.sportsNewsService.fetchLatestStories({
        sport: input.sport,
        limit: 60,
        userAgent: input.userAgent,
        feedTimeoutMs: input.feedTimeoutMs,
        articleTimeoutMs: input.articleTimeoutMs,
        deadlineMs: input.deadlineMs,
        timeZone,
        knownGameIds,
        onProgress: async (progress) => {
          await this.updateSyncState(input.userId, sport, {
            status: "running",
            step: progress.step,
            message: progress.message,
            totalGames: progress.totalGames ?? 0,
            processedGames: progress.processedGames ?? 0,
            foundGames: progress.foundGames ?? [],
            startedAtMs,
            updatedAtMs: Date.now()
          });
        },
        onStoryReady: async (story) => {
          generatedByGameId.set(story.gameId, story);
          await this.repository.upsertStoriesForUser(input.userId, sport, [story]);
        }
      } satisfies FetchSportsStoriesInput);

      await this.repository.replaceGameDraftsForUser(input.userId, fetched.sport, fetched.gameDateKey, fetched.gameDrafts);

      let mergedStories: SportsStory[];
      if (!fetched.gameDrafts.length) {
        mergedStories = existingStories
          .filter((story) => activeDateKeys.has(story.gameDateKey))
          .filter((story) => UserSportsNewsService.isAcceptableSportsStory(story));
      } else {
        const latestGameIds = new Set(fetched.gameDrafts.map((draft) => draft.gameId));
        const retainedStories = existingStories
          .filter((story) => latestGameIds.has(story.gameId))
          .filter((story) => UserSportsNewsService.isAcceptableSportsStory(story));
        const byGameId = new Map<string, SportsStory>();
        for (const story of retainedStories) {
          byGameId.set(story.gameId, story);
        }
        for (const story of fetched.stories) {
          byGameId.set(story.gameId, story);
        }
        mergedStories = Array.from(byGameId.values()).sort((a, b) => {
          if (b.importanceScore !== a.importanceScore) {
            return b.importanceScore - a.importanceScore;
          }
          return (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0);
        });
      }
      await this.repository.replaceStoriesForUser(input.userId, fetched.sport, mergedStories);
      this.clearUserCaches(input.userId);
      await this.updateSyncState(input.userId, sport, {
        status: "complete",
        step: "complete",
        message: `Prepared ${mergedStories.length} game summaries.`,
        totalGames: fetched.gameDrafts.length,
        processedGames: Math.min(fetched.gameDrafts.length, mergedStories.length),
        foundGames: fetched.gameDrafts.map((item) => item.gameName).slice(0, 40),
        startedAtMs,
        completedAtMs: Date.now(),
        updatedAtMs: Date.now()
      });

      return {
        sport: fetched.sport,
        stories: mergedStories.slice(0, boundedLimit)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.updateSyncState(input.userId, sport, {
        status: "error",
        step: "error",
        message: "Sports refresh failed. Showing existing stories.",
        errorMessage: message,
        totalGames: 0,
        processedGames: 0,
        foundGames: [],
        startedAtMs,
        completedAtMs: Date.now(),
        updatedAtMs: Date.now()
      });

      if (existingStories.length) {
        const safeExistingStories = existingStories.filter((story) => UserSportsNewsService.isAcceptableSportsStory(story));
        await this.repository.replaceStoriesForUser(input.userId, sport, safeExistingStories);
        this.clearUserCaches(input.userId);
        return {
          sport,
          stories: safeExistingStories.slice(0, boundedLimit)
        };
      }
      throw error;
    }
  }

  async listUserStories(userId: string, sport: string, limit: number): Promise<{ sport: SportId; stories: SportsStory[] }> {
    const normalized = UserSportsNewsService.normalizeSport(sport);
    const stories = await this.repository.listStoriesForUser(userId, normalized, limit);
    return {
      sport: normalized,
      stories
    };
  }

  async listUserFeedStories(userId: string, input: ListUserFeedStoriesInput): Promise<UserSportsFeedResult> {
    const boundedLimit = Math.max(1, Math.min(20, Math.floor(input.limit)));
    const normalizedSports = UserSportsNewsService.normalizeSportsFilter(input.sports);
    const sportsKey = UserSportsNewsService.sportsFilterKey(normalizedSports);
    const decodedCursor = UserSportsNewsService.decodeFeedCursor(input.cursor);
    if (decodedCursor && decodedCursor.sportsKey !== sportsKey) {
      throw new Error("Invalid sports feed cursor.");
    }
    const cacheKey = UserSportsNewsService.feedCacheKey(userId, boundedLimit, input.cursor, sportsKey);
    const cached = this.feedCache.get(cacheKey);
    if (cached && cached.expiresAtMs > UserSportsNewsService.nowMs()) {
      return cached.value;
    }
    const page = await this.repository.listFeedStoriesForUser(
      userId,
      boundedLimit,
      decodedCursor?.cursor,
      normalizedSports
    );
    const result = {
      items: page.items,
      nextCursor: page.nextCursor ? UserSportsNewsService.encodeFeedCursor(page.nextCursor, sportsKey) : null
    };
    this.feedCache.set(cacheKey, {
      value: result,
      expiresAtMs: UserSportsNewsService.nowMs() + FEED_CACHE_TTL_MS
    });
    return result;
  }

  async getUserStory(userId: string, storyId: string): Promise<SportsStory | null> {
    const storyIdTrimmed = String(storyId ?? "").trim();
    if (!storyIdTrimmed) {
      return null;
    }
    const cacheKey = UserSportsNewsService.storyCacheKey(userId, storyIdTrimmed);
    const cached = this.storyCache.get(cacheKey);
    if (cached && cached.expiresAtMs > UserSportsNewsService.nowMs()) {
      return cached.value;
    }
    const story = await this.repository.getStoryForUser(userId, storyIdTrimmed);
    this.storyCache.set(cacheKey, {
      value: story,
      expiresAtMs: UserSportsNewsService.nowMs() + STORY_CACHE_TTL_MS
    });
    return story;
  }

  async getUserSyncState(userId: string, sport: string): Promise<{ sport: SportId; state: UserSportsSyncState }> {
    const normalized = UserSportsNewsService.normalizeSport(sport);
    const existing = await this.repository.getSyncStateForUser(userId, normalized);
    if (existing) {
      return {
        sport: normalized,
        state: existing
      };
    }
    return {
      sport: normalized,
      state: {
        status: "idle",
        step: "idle",
        message: "Idle.",
        totalGames: 0,
        processedGames: 0,
        foundGames: [],
        updatedAtMs: Date.now()
      }
    };
  }
}
