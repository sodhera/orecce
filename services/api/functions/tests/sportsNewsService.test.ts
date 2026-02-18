import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ParsedFeedArticle } from "../src/news/types";
import { SportsNewsService } from "../src/news/sportsNewsService";

const ORIGINAL_ENV = { ...process.env };

describe("SportsNewsService", () => {
  beforeEach(() => {
    process.env.SPORTS_NEWS_FETCH_FULL_TEXT = "false";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0);
  const yesterdayMs = todayMs - 24 * 60 * 60 * 1000;
  const twoDaysAgoMs = todayMs - 48 * 60 * 60 * 1000;

  it("fetches football stories from configured feeds and builds story text", async () => {
    process.env.SPORTS_NEWS_FETCH_FULL_TEXT = "true";

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
              title: "A Team 2-1 C Team",
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
            title: "B Team v D Team preview",
            summary: "B summary.",
            categories: ["Soccer"],
            publishedAtMs: yesterdayMs + 1_000
          }
        ];
      },
      articleTextFetcher: async (url) =>
        `Full report for ${url}. First detail with tactical context and player positioning. Second detail covering halftime adjustments and substitutions. Third detail explains key chances and defensive recoveries. Fourth detail captures crowd momentum and late pressure. Fifth detail summarizes final passages and implications for upcoming fixtures.`,
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

  it("falls back to feed summary when article text fetch fails for all related articles", async () => {
    const service = new SportsNewsService({
      feedFetcher: async () => ({
        status: 200,
        body: "<rss/>"
      }),
      feedParser: (): ParsedFeedArticle[] => [
        {
          externalId: "bbc-1",
          canonicalUrl: "https://news.example.com/a",
          title: "A Team 1-0 B Team",
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
  });

  it("skips story generation when full-text mode is enabled and article bodies are unavailable", async () => {
    process.env.SPORTS_NEWS_FETCH_FULL_TEXT = "true";

    const service = new SportsNewsService({
      feedFetcher: async () => ({
        status: 200,
        body: "<rss/>"
      }),
      feedParser: (): ParsedFeedArticle[] => [
        {
          externalId: "bbc-1",
          canonicalUrl: "https://news.example.com/a",
          title: "A Team 1-0 B Team",
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

    expect(result.stories.length).toBe(0);
  });

  it("includes stories from today and yesterday, excluding older dates", async () => {
    const service = new SportsNewsService({
      feedFetcher: async (url) => ({
        status: 200,
        body: `<feed>${url}</feed>`
      }),
      feedParser: (xml): ParsedFeedArticle[] => {
        if (!xml.includes("bbci")) {
          return [];
        }
        return [
          {
            externalId: "today-1",
            canonicalUrl: "https://news.example.com/today",
            title: "Today FC 3-1 Rivals",
            summary: "Today summary.",
            categories: ["Football"],
            publishedAtMs: todayMs
          },
          {
            externalId: "yesterday-1",
            canonicalUrl: "https://news.example.com/yesterday",
            title: "Yesterday FC 1-1 City",
            summary: "Yesterday summary.",
            categories: ["Football"],
            publishedAtMs: yesterdayMs
          },
          {
            externalId: "old-1",
            canonicalUrl: "https://news.example.com/old",
            title: "Old FC 2-0 Town",
            summary: "Old summary.",
            categories: ["Football"],
            publishedAtMs: twoDaysAgoMs
          }
        ];
      },
      articleTextFetcher: async (url) => `Full report for ${url}.`,
      gameClusterBuilder: async (input) =>
        input.articles.map((article) => ({
          gameId: `game-${article.itemIndex}`,
          gameName: article.title,
          gameDateKey: input.gameDateKey,
          articleRefs: [article]
        })),
      gameStoryBuilder: async () => ({
        importanceScore: 70,
        bulletPoints: ["Top update", "Second update", "Third update"],
        reconstructedArticle: "Reconstructed article.",
        summarySource: "llm"
      })
    });

    const result = await service.fetchLatestStories({
      sport: "football",
      limit: 10,
      userAgent: "TestBot/1.0",
      feedTimeoutMs: 3000,
      articleTimeoutMs: 3000,
      timeZone: "UTC"
    });

    expect(result.stories.length).toBe(2);
    expect(result.stories.some((story) => story.title.startsWith("Today FC"))).toBe(true);
    expect(result.stories.some((story) => story.title.startsWith("Yesterday FC"))).toBe(true);
    expect(result.stories.some((story) => story.title.startsWith("Old FC"))).toBe(false);
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

  it("continues when one feed source fails", async () => {
    const service = new SportsNewsService({
      feedFetcher: async (url) => {
        if (url.includes("bbci")) {
          throw new Error("BBC unavailable");
        }
        return {
          status: 200,
          body: `<feed>${url}</feed>`
        };
      },
      feedParser: (): ParsedFeedArticle[] => [
        {
          externalId: "espn-1",
          canonicalUrl: "https://news.example.com/live-game",
          title: "City Team 3-2 River Team",
          summary: "Live summary.",
          categories: ["Soccer"],
          publishedAtMs: yesterdayMs
        }
      ],
      articleTextFetcher: async () => "Full report. Detail one. Detail two. Detail three.",
      gameClusterBuilder: async (input) => [
        {
          gameId: "game-live",
          gameName: "Live Team vs Away Team",
          gameDateKey: input.gameDateKey,
          articleRefs: input.articles
        }
      ],
      gameStoryBuilder: async () => ({
        importanceScore: 77,
        bulletPoints: ["Top update", "Second update", "Third update"],
        reconstructedArticle: "Reconstructed article.",
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

    expect(result.stories.length).toBe(1);
    expect(result.stories[0].gameName).toContain("River Team");
  });

  it("groups multiple source articles into one match draft", async () => {
    const service = new SportsNewsService({
      feedFetcher: async (url) => ({
        status: 200,
        body: `<feed>${url}</feed>`
      }),
      feedParser: (xml): ParsedFeedArticle[] => {
        if (xml.includes("bbci")) {
          return [
            {
              externalId: "bbc-match-1",
              canonicalUrl: "https://news.example.com/match-1-bbc",
              title: "Arsenal 2-1 Chelsea",
              summary: "Match report.",
              categories: ["Football"],
              publishedAtMs: yesterdayMs
            }
          ];
        }
        return [
          {
            externalId: "espn-match-1",
            canonicalUrl: "https://news.example.com/match-1-espn",
            title: "Arsenal vs Chelsea reaction",
            summary: "Post-match analysis.",
            categories: ["Soccer"],
            publishedAtMs: yesterdayMs + 2_000
          }
        ];
      },
      articleTextFetcher: async (url) => `Full report for ${url}. First detail. Second detail. Third detail.`,
      gameStoryBuilder: async () => ({
        importanceScore: 88,
        bulletPoints: ["Top update", "Second update", "Third update"],
        reconstructedArticle: "Combined reconstruction.",
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

    expect(result.gameDrafts.length).toBe(1);
    expect(result.gameDrafts[0].articleRefs.length).toBe(2);
    expect(result.gameDrafts[0].gameName).toContain("Arsenal");
  });
});
