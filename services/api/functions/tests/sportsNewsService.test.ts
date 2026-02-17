import { describe, expect, it } from "vitest";
import { ParsedFeedArticle } from "../src/news/types";
import { SportsNewsService } from "../src/news/sportsNewsService";

describe("SportsNewsService", () => {
  const yesterdayMs = Date.now() - 24 * 60 * 60 * 1000;

  it("fetches football stories from configured feeds and builds story text", async () => {
    const service = new SportsNewsService({
      feedFetcher: async (url) => ({
        status: 200,
        body: `<feed>${url}</feed>`
      }),
      feedParser: (xml): ParsedFeedArticle[] => {
        if (xml.includes("bbci")) {
          return [
            {
              externalId: "bbc-1",
              canonicalUrl: "https://news.example.com/a",
              title: "A Team Wins",
              summary: "A short summary.",
              categories: ["Football"],
              publishedAtMs: yesterdayMs
            }
          ];
        }
        return [
          {
            externalId: "espn-1",
            canonicalUrl: "https://news.example.com/b",
            title: "B Team Signs Player",
            summary: "B summary.",
            categories: ["Soccer"],
            publishedAtMs: yesterdayMs + 1_000
          }
        ];
      },
      articleTextFetcher: async (url) =>
        `Full report for ${url}. First detail. Second detail. Third detail. Fourth detail. Fifth detail.`,
      gameClusterBuilder: async (input) =>
        input.articles.map((article) => ({
          gameId: `game-${article.itemIndex}`,
          gameName: article.title,
          gameDateKey: input.gameDateKey,
          articleRefs: [article]
        })),
      gameStoryBuilder: async (input) => ({
        importanceScore: input.gameName.includes("B Team") ? 92 : 67,
        bulletPoints: ["Top update", "Second update", "Third update"],
        reconstructedArticle: `Reconstructed article for ${input.gameName}.`,
        summarySource: "llm"
      })
    });

    const result = await service.fetchLatestStories({
      sport: "football",
      limit: 5,
      userAgent: "TestBot/1.0",
      feedTimeoutMs: 3000,
      articleTimeoutMs: 3000,
      timeZone: "UTC"
    });

    expect(result.sport).toBe("football");
    expect(result.gameDrafts.length).toBe(2);
    expect(result.stories.length).toBe(2);
    expect(result.stories[0].title.startsWith("B Team")).toBe(true);
    expect(result.stories[0].importanceScore).toBe(92);
    expect(result.stories[0].bulletPoints[0]).toBe("Top update");
    expect(result.stories[0].reconstructedArticle).toContain("Reconstructed article");
    expect(result.stories[0].fullTextStatus).toBe("ready");
    expect(result.stories[0].summarySource).toBe("llm");
  });

  it("falls back to feed summary when article text fetch fails", async () => {
    const service = new SportsNewsService({
      feedFetcher: async () => ({
        status: 200,
        body: "<rss/>"
      }),
      feedParser: (): ParsedFeedArticle[] => [
        {
          externalId: "bbc-1",
          canonicalUrl: "https://news.example.com/a",
          title: "A Team Wins",
          summary: "Summary used for fallback. Another sentence.",
          categories: ["Football"],
          publishedAtMs: yesterdayMs
        }
      ],
      articleTextFetcher: async () => {
        throw new Error("fetch failed");
      }
    });

    const result = await service.fetchLatestStories({
      sport: "football",
      limit: 1,
      userAgent: "TestBot/1.0",
      feedTimeoutMs: 3000,
      articleTimeoutMs: 3000,
      timeZone: "UTC"
    });

    expect(result.stories.length).toBe(1);
    expect(result.stories[0].fullTextStatus).toBe("fallback");
    expect(result.stories[0].summarySource).toBe("fallback");
    expect(result.stories[0].bulletPoints.length).toBeGreaterThan(0);
    expect(result.stories[0].story).toContain("Summary used for fallback.");
  });

  it("throws on unsupported sports", async () => {
    const service = new SportsNewsService({
      feedFetcher: async () => ({
        status: 200,
        body: "<rss/>"
      }),
      feedParser: () => []
    });

    await expect(
      service.fetchLatestStories({
        sport: "basketball",
        limit: 3,
        userAgent: "TestBot/1.0",
        feedTimeoutMs: 3000,
        articleTimeoutMs: 3000
      })
    ).rejects.toThrow("Unsupported sport");
  });
});
