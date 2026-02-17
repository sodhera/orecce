import { describe, expect, it } from "vitest";
import { SportsNewsService, SportsStory } from "../src/news/sportsNewsService";
import { UserSportsNewsRepository } from "../src/news/userSportsNewsRepository";
import { UserSportsNewsService } from "../src/news/userSportsNewsService";

class InMemoryUserSportsNewsRepository implements UserSportsNewsRepository {
  private readonly rows = new Map<string, SportsStory[]>();

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
  });

  it("rejects unsupported sports", async () => {
    const repository = new InMemoryUserSportsNewsRepository();
    const sportsNewsService = {
      fetchLatestStories: async () => ({
        sport: "football",
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
