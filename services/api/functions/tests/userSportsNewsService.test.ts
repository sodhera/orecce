import { describe, expect, it } from "vitest";
import { SportsGameDraft, SportsNewsService, SportsStory } from "../src/news/sportsNewsService";
import { UserSportsNewsRepository, UserSportsSyncState } from "../src/news/userSportsNewsRepository";
import { UserSportsNewsService } from "../src/news/userSportsNewsService";

class InMemoryUserSportsNewsRepository implements UserSportsNewsRepository {
  private readonly rows = new Map<string, SportsStory[]>();
  public readonly draftRows = new Map<string, SportsGameDraft[]>();
  public readonly syncRows = new Map<string, UserSportsSyncState>();
  public queuedRefreshes: Array<{ userId: string; sport: "football" }> = [];

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
});
