import { describe, expect, it } from "vitest";
import { SportId } from "../src/news/sportsNewsSources";
import { SportsGameDraft, SportsNewsService, SportsStory } from "../src/news/sportsNewsService";
import { UserSportsFeedItem, UserSportsNewsRepository, UserSportsSyncState } from "../src/news/userSportsNewsRepository";
import { UserSportsNewsService } from "../src/news/userSportsNewsService";

class InMemoryUserSportsNewsRepository implements UserSportsNewsRepository {
  private readonly rows = new Map<string, SportsStory[]>();
  public readonly draftRows = new Map<string, SportsGameDraft[]>();
  public readonly syncRows = new Map<string, UserSportsSyncState>();
  public queuedRefreshes: Array<{ userId: string; sport: SportId }> = [];
  public upsertedStories: SportsStory[] = [];

  async enqueueRefreshForUser(userId: string, sport: SportId): Promise<void> {
    this.queuedRefreshes.push({ userId, sport });
  }

  async claimRefreshForUser(_userId: string, _sport: SportId): Promise<boolean> {
    return true;
  }

  async finishRefreshForUser(
    _userId: string,
    _sport: SportId,
    _input: { success: boolean; errorMessage?: string }
  ): Promise<void> {}

  async replaceSyncStateForUser(userId: string, sport: SportId, state: UserSportsSyncState): Promise<void> {
    this.syncRows.set(`${userId}:${sport}`, { ...state, foundGames: [...state.foundGames] });
  }

  async getSyncStateForUser(userId: string, sport: SportId): Promise<UserSportsSyncState | null> {
    return this.syncRows.get(`${userId}:${sport}`) ?? null;
  }

  async replaceGameDraftsForUser(
    userId: string,
    sport: SportId,
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

  async replaceStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void> {
    this.rows.set(`${userId}:${sport}`, stories.map((story) => ({ ...story })));
  }

  async upsertStoriesForUser(userId: string, sport: SportId, stories: SportsStory[]): Promise<void> {
    const key = `${userId}:${sport}`;
    const current = this.rows.get(key) ?? [];
    const byGameId = new Map(current.map((story) => [story.gameId, { ...story }] as const));
    for (const story of stories) {
      byGameId.set(story.gameId, { ...story });
      this.upsertedStories.push({ ...story });
    }
    this.rows.set(key, Array.from(byGameId.values()));
  }

  async listStoriesForUser(userId: string, sport: SportId, limit: number): Promise<SportsStory[]> {
    const items = this.rows.get(`${userId}:${sport}`) ?? [];
    return items.slice(0, limit);
  }

  async getStoryForUser(userId: string, storyId: string): Promise<SportsStory | null> {
    const found = Array.from(this.rows.entries())
      .filter(([key]) => key.startsWith(`${userId}:`))
      .flatMap(([, stories]) => stories)
      .find((story) => story.id === storyId);
    return found ? { ...found } : null;
  }

  async listFeedStoriesForUser(
    userId: string,
    limit: number,
    cursor?: { publishedAtMs: number | null; docId: string },
    sports?: SportId[]
  ): Promise<{ items: UserSportsFeedItem[]; nextCursor: { publishedAtMs: number | null; docId: string } | null }> {
    const selected = new Set((sports ?? []).map((item) => String(item)));
    const all = Array.from(this.rows.entries())
      .filter(([key]) => key.startsWith(`${userId}:`))
      .flatMap(([, stories]) => stories.map((story) => ({ ...story })));
    const filtered = selected.size
      ? all.filter((story) => selected.has(story.sport))
      : all;
    filtered.sort((a, b) => {
      const byPublished = (b.publishedAtMs ?? 0) - (a.publishedAtMs ?? 0);
      if (byPublished !== 0) {
        return byPublished;
      }
      return b.id.localeCompare(a.id);
    });

    const startIndex = cursor
      ? filtered.findIndex((item) => item.id === cursor.docId) + 1
      : 0;
    const start = Math.max(0, startIndex);
    const page = filtered.slice(start, start + limit);
    const hasMore = start + limit < filtered.length;
    const last = page[page.length - 1];
    return {
      items: page.map((item) => ({
        id: item.id,
        sport: item.sport,
        title: item.title,
        publishedAtMs: item.publishedAtMs,
        importanceScore: item.importanceScore,
        preview: item.story || item.reconstructedArticle || "Open to read the full article."
      })),
      nextCursor: hasMore && last
        ? {
            publishedAtMs: last.publishedAtMs ?? null,
            docId: last.id
          }
        : null
    };
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

    await expect(service.listUserStories("u1", "volleyball", 5)).rejects.toThrow("Unsupported sport");
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

  it("paginates sports feed newest-first across sports", async () => {
    const repository = new InMemoryUserSportsNewsRepository();
    const now = Date.now();
    await repository.replaceStoriesForUser("u1", "football", [
      {
        id: "football-1",
        sport: "football",
        sourceId: "s1",
        sourceName: "S1",
        title: "Football 1",
        canonicalUrl: "https://example.com/f1",
        publishedAtMs: now - 2_000,
        gameId: "g1",
        gameName: "A vs B",
        gameDateKey: "2026-02-19",
        importanceScore: 70,
        bulletPoints: ["p1"],
        reconstructedArticle: "r1",
        story: "story-1",
        fullTextStatus: "ready",
        summarySource: "llm"
      }
    ]);
    await repository.replaceStoriesForUser("u1", "cricket", [
      {
        id: "cricket-1",
        sport: "cricket",
        sourceId: "s2",
        sourceName: "S2",
        title: "Cricket 1",
        canonicalUrl: "https://example.com/c1",
        publishedAtMs: now,
        gameId: "g2",
        gameName: "C vs D",
        gameDateKey: "2026-02-19",
        importanceScore: 60,
        bulletPoints: ["p2"],
        reconstructedArticle: "r2",
        story: "story-2",
        fullTextStatus: "ready",
        summarySource: "llm"
      },
      {
        id: "cricket-2",
        sport: "cricket",
        sourceId: "s3",
        sourceName: "S3",
        title: "Cricket 2",
        canonicalUrl: "https://example.com/c2",
        publishedAtMs: now - 4_000,
        gameId: "g3",
        gameName: "E vs F",
        gameDateKey: "2026-02-19",
        importanceScore: 50,
        bulletPoints: ["p3"],
        reconstructedArticle: "r3",
        story: "story-3",
        fullTextStatus: "ready",
        summarySource: "llm"
      }
    ]);

    const sportsNewsService = {
      fetchLatestStories: async () => ({
        sport: "football",
        gameDateKey: "2026-02-19",
        gameDrafts: [],
        stories: []
      })
    } as unknown as SportsNewsService;

    const service = new UserSportsNewsService({
      repository,
      sportsNewsService
    });

    const first = await service.listUserFeedStories("u1", { limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual(["cricket-1", "football-1"]);
    expect(first.nextCursor).toBeTruthy();

    const second = await service.listUserFeedStories("u1", {
      limit: 2,
      cursor: first.nextCursor ?? undefined
    });
    expect(second.items.map((item) => item.id)).toEqual(["cricket-2"]);
    expect(second.nextCursor).toBeNull();
  });

  it("filters sports feed by selected sports", async () => {
    const repository = new InMemoryUserSportsNewsRepository();
    const now = Date.now();
    await repository.replaceStoriesForUser("u1", "football", [
      {
        id: "football-only",
        sport: "football",
        sourceId: "s1",
        sourceName: "S1",
        title: "Football",
        canonicalUrl: "https://example.com/f",
        publishedAtMs: now,
        gameId: "gf",
        gameName: "A vs B",
        gameDateKey: "2026-02-19",
        importanceScore: 80,
        bulletPoints: ["p1"],
        reconstructedArticle: "r1",
        story: "story-1",
        fullTextStatus: "ready",
        summarySource: "llm"
      }
    ]);
    await repository.replaceStoriesForUser("u1", "cricket", [
      {
        id: "cricket-only",
        sport: "cricket",
        sourceId: "s2",
        sourceName: "S2",
        title: "Cricket",
        canonicalUrl: "https://example.com/c",
        publishedAtMs: now - 1_000,
        gameId: "gc",
        gameName: "C vs D",
        gameDateKey: "2026-02-19",
        importanceScore: 70,
        bulletPoints: ["p2"],
        reconstructedArticle: "r2",
        story: "story-2",
        fullTextStatus: "ready",
        summarySource: "llm"
      }
    ]);

    const sportsNewsService = {
      fetchLatestStories: async () => ({
        sport: "football",
        gameDateKey: "2026-02-19",
        gameDrafts: [],
        stories: []
      })
    } as unknown as SportsNewsService;

    const service = new UserSportsNewsService({
      repository,
      sportsNewsService
    });

    const filtered = await service.listUserFeedStories("u1", {
      limit: 5,
      sports: ["cricket"]
    });
    expect(filtered.items.map((item) => item.id)).toEqual(["cricket-only"]);
    expect(filtered.items.every((item) => item.sport === "cricket")).toBe(true);
  });
});
