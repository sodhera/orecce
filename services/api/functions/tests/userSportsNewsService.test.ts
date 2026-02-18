import { describe, expect, it } from "vitest";
import { SportsGameDraft, SportsNewsService, SportsStory } from "../src/news/sportsNewsService";
import { UserSportsNewsRepository, UserSportsSyncState } from "../src/news/userSportsNewsRepository";
import { UserSportsNewsService } from "../src/news/userSportsNewsService";

class InMemoryUserSportsNewsRepository implements UserSportsNewsRepository {
  private readonly rows = new Map<string, SportsStory[]>();
  public readonly draftRows = new Map<string, SportsGameDraft[]>();
  public readonly syncRows = new Map<string, UserSportsSyncState>();
  public queuedRefreshes: Array<{ userId: string; sport: "football" }> = [];
  public upsertedStories: SportsStory[] = [];

  async enqueueRefreshForUser(userId: string, sport: "football"): Promise<void> {
    this.queuedRefreshes.push({ userId, sport });
  }

  async claimRefreshForUser(_userId: string, _sport: "football"): Promise<boolean> {
    return true;
  }

  async finishRefreshForUser(
    _userId: string,
    _sport: "football",
    _input: { success: boolean; errorMessage?: string }
  ): Promise<void> {}

  async replaceSyncStateForUser(userId: string, sport: "football", state: UserSportsSyncState): Promise<void> {
    this.syncRows.set(`${userId}:${sport}`, { ...state, foundGames: [...state.foundGames] });
  }

  async getSyncStateForUser(userId: string, sport: "football"): Promise<UserSportsSyncState | null> {
    return this.syncRows.get(`${userId}:${sport}`) ?? null;
  }

  async replaceGameDraftsForUser(
    userId: string,
    sport: "football",
    _gameDateKey: string,
    drafts: SportsGameDraft[]
  ): Promise<void> {
    this.draftRows.set(
      `${userId}:${sport}`,
      drafts.map((draft) => ({
        ...draft,
        articleRefs: draft.articleRefs.map((item) => ({ ...item }))
      }))
    );
  }

  async replaceStoriesForUser(userId: string, sport: "football", stories: SportsStory[]): Promise<void> {
    this.rows.set(`${userId}:${sport}`, stories.map((story) => ({ ...story })));
  }

  async upsertStoriesForUser(userId: string, sport: "football", stories: SportsStory[]): Promise<void> {
    const key = `${userId}:${sport}`;
    const current = this.rows.get(key) ?? [];
    const byGameId = new Map(current.map((story) => [story.gameId, { ...story }] as const));
    for (const story of stories) {
      byGameId.set(story.gameId, { ...story });
      this.upsertedStories.push({ ...story });
    }
    this.rows.set(key, Array.from(byGameId.values()));
  }

  async listStoriesForUser(userId: string, sport: "football", limit: number): Promise<SportsStory[]> {
    const items = this.rows.get(`${userId}:${sport}`) ?? [];
    return items.slice(0, limit);
  }
}

describe("UserSportsNewsService", () => {
  it("replaces existing user stories on refresh", async () => {
    const repository = new InMemoryUserSportsNewsRepository();
    const generated: SportsStory[] = [
      {
        id: "s1",
        sport: "football",
        sourceId: "bbc-football",
        sourceName: "BBC Football",
        title: "Title 1",
        canonicalUrl: "https://news.example.com/1",
        publishedAtMs: Date.now(),
        gameId: "game-1",
        gameName: "Team A vs Team B",
        gameDateKey: "2026-02-16",
        importanceScore: 80,
        bulletPoints: ["Point 1", "Point 2"],
        reconstructedArticle: "Reconstructed article 1",
        story: "Story 1",
        fullTextStatus: "ready",
        summarySource: "llm"
      }
    ];

    const sportsNewsService = {
      fetchLatestStories: async () => ({
        sport: "football",
        gameDateKey: "2026-02-16",
        gameDrafts: [
          {
            gameId: "game-1",
            gameName: "Team A vs Team B",
            gameDateKey: "2026-02-16",
            articleRefs: []
          }
        ],
        stories: generated
      })
    } as unknown as SportsNewsService;

    const service = new UserSportsNewsService({
      repository,
      sportsNewsService
    });

    await service.refreshUserStories({
      userId: "u1",
      sport: "football",
      limit: 10,
      userAgent: "Test",
      feedTimeoutMs: 1000,
      articleTimeoutMs: 1000
    });

    const listed = await service.listUserStories("u1", "football", 10);
    expect(listed.sport).toBe("football");
    expect(listed.stories.length).toBe(1);
    expect(listed.stories[0].title).toBe("Title 1");
    expect(repository.draftRows.get("u1:football")?.length).toBe(1);
    expect(repository.syncRows.get("u1:football")?.status).toBe("complete");
  });

  it("rejects unsupported sports", async () => {
    const repository = new InMemoryUserSportsNewsRepository();
    const sportsNewsService = {
      fetchLatestStories: async () => ({
        sport: "football",
        gameDateKey: "2026-02-16",
        gameDrafts: [],
        stories: []
      })
    } as unknown as SportsNewsService;

    const service = new UserSportsNewsService({
      repository,
      sportsNewsService
    });

    await expect(service.listUserStories("u1", "basketball", 5)).rejects.toThrow("Unsupported sport");
  });

  it("resets progress counts when queuing a new refresh", async () => {
    const repository = new InMemoryUserSportsNewsRepository();
    repository.syncRows.set("u1:football", {
      status: "complete",
      step: "complete",
      message: "Prepared 26 game summaries.",
      totalGames: 28,
      processedGames: 26,
      foundGames: ["A vs B"],
      updatedAtMs: Date.now()
    });
    const sportsNewsService = {
      fetchLatestStories: async () => ({
        sport: "football",
        gameDateKey: "2026-02-16",
        gameDrafts: [],
        stories: []
      })
    } as unknown as SportsNewsService;

    const service = new UserSportsNewsService({
      repository,
      sportsNewsService
    });

    await service.requestRefresh("u1", "football");

    const state = repository.syncRows.get("u1:football");
    expect(state?.status).toBe("running");
    expect(state?.totalGames).toBe(0);
    expect(state?.processedGames).toBe(0);
    expect(state?.foundGames).toEqual([]);
    expect(repository.queuedRefreshes.length).toBe(1);
  });

  it("includes fallback stories when listing user sports feed", async () => {
    const repository = new InMemoryUserSportsNewsRepository();
    await repository.replaceStoriesForUser("u1", "football", [
      {
        id: "ready",
        sport: "football",
        sourceId: "bbc-football",
        sourceName: "BBC Football",
        title: "Ready Story",
        canonicalUrl: "https://news.example.com/ready",
        publishedAtMs: Date.now(),
        gameId: "game-ready",
        gameName: "Team A vs Team B",
        gameDateKey: "2026-02-16",
        importanceScore: 90,
        bulletPoints: ["Point 1"],
        reconstructedArticle: "Ready content",
        story: "Ready content",
        fullTextStatus: "ready",
        summarySource: "llm"
      },
      {
        id: "fallback",
        sport: "football",
        sourceId: "espn-soccer",
        sourceName: "ESPN Soccer",
        title: "Fallback Story",
        canonicalUrl: "https://news.example.com/fallback",
        publishedAtMs: Date.now() - 1000,
        gameId: "game-fallback",
        gameName: "Team C vs Team D",
        gameDateKey: "2026-02-16",
        importanceScore: 80,
        bulletPoints: ["Point 1"],
        reconstructedArticle: "Fallback content",
        story: "Fallback content",
        fullTextStatus: "fallback",
        summarySource: "fallback"
      }
    ]);

    const sportsNewsService = {
      fetchLatestStories: async () => ({
        sport: "football",
        gameDateKey: "2026-02-16",
        gameDrafts: [],
        stories: []
      })
    } as unknown as SportsNewsService;

    const service = new UserSportsNewsService({
      repository,
      sportsNewsService
    });

    const listed = await service.listUserStories("u1", "football", 10);
    expect(listed.stories.length).toBe(2);
    expect(listed.stories.some((story) => story.id === "ready")).toBe(true);
    expect(listed.stories.some((story) => story.id === "fallback")).toBe(true);
  });

  it("drops stale fallback stories for active games when refresh skips regeneration", async () => {
    const repository = new InMemoryUserSportsNewsRepository();
    const now = Date.now();
    const timeZone = "America/New_York";
    const todayKey = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(new Date(now))
      .reduce(
        (acc, part) => {
          if (part.type === "year" || part.type === "month" || part.type === "day") {
            acc[part.type] = part.value;
          }
          return acc;
        },
        {} as Record<string, string>
      );
    const todayDateKey = `${todayKey.year ?? "1970"}-${todayKey.month ?? "01"}-${todayKey.day ?? "01"}`;

    await repository.replaceStoriesForUser("u1", "football", [
      {
        id: "fallback-old",
        sport: "football",
        sourceId: "bbc-football",
        sourceName: "BBC Football",
        title: "Old fallback",
        canonicalUrl: "https://news.example.com/old-fallback",
        publishedAtMs: now,
        gameId: "game-active",
        gameName: "Team A vs Team B",
        gameDateKey: todayDateKey,
        importanceScore: 65,
        bulletPoints: ["Old point"],
        reconstructedArticle: "Old fallback content",
        story: "Old fallback content",
        fullTextStatus: "fallback",
        summarySource: "fallback"
      }
    ]);

    const sportsNewsService = {
      fetchLatestStories: async () => ({
        sport: "football",
        gameDateKey: todayDateKey,
        gameDrafts: [
          {
            gameId: "game-active",
            gameName: "Team A vs Team B",
            gameDateKey: todayDateKey,
            articleRefs: []
          }
        ],
        stories: []
      })
    } as unknown as SportsNewsService;

    const service = new UserSportsNewsService({
      repository,
      sportsNewsService
    });

    await service.refreshUserStories({
      userId: "u1",
      sport: "football",
      limit: 10,
      userAgent: "Test",
      feedTimeoutMs: 1000,
      articleTimeoutMs: 1000
    });

    const listed = await service.listUserStories("u1", "football", 10);
    expect(listed.stories.length).toBe(0);
  });
});
