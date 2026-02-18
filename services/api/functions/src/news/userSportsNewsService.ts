import { SportId } from "./sportsNewsSources";
import { FetchSportsStoriesInput, SportsNewsService, SportsStory } from "./sportsNewsService";
import { UserSportsNewsRepository, UserSportsSyncState } from "./userSportsNewsRepository";

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

export class UserSportsNewsService {
  private readonly sportsNewsService: SportsNewsService;
  private readonly repository: UserSportsNewsRepository;

  constructor(deps: UserSportsNewsServiceDeps) {
    this.sportsNewsService = deps.sportsNewsService;
    this.repository = deps.repository;
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
    const normalized = String(sport ?? "").trim().toLowerCase();
    if (normalized !== "football") {
      throw new Error("Unsupported sport. Supported sports: football.");
    }
    return "football";
  }

  private async updateSyncState(userId: string, sport: SportId, state: UserSportsSyncState): Promise<void> {
    await this.repository.replaceSyncStateForUser(userId, sport, state);
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
          .filter((story) => story.fullTextStatus === "ready")
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
        mergedStories = existingStories.filter((story) => activeDateKeys.has(story.gameDateKey));
      } else {
        const latestGameIds = new Set(fetched.gameDrafts.map((draft) => draft.gameId));
        const retainedStories = existingStories.filter((story) => latestGameIds.has(story.gameId));
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
        await this.repository.replaceStoriesForUser(input.userId, sport, existingStories);
        return {
          sport,
          stories: existingStories.slice(0, boundedLimit)
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
