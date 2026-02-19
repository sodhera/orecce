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
              title: "Manchester City 2-1 River Plate",
              summary: "BBC match report summary.",
              categories: ["Football"],
              publishedAtMs: yesterdayMs
            }
          ];
        }
        return [
          {
            externalId: "espn-1",
            canonicalUrl: "https://www.espn.com/soccer/report/_/gameId/10001",
            title: "Manchester City vs River Plate reaction",
            summary: "Manchester City beat River Plate 2-1 in the match report.",
            categories: ["Soccer"],
            publishedAtMs: yesterdayMs + 1_000
          }
        ];
      },
      articleTextFetcher: async (url) =>
        `Full report for ${url}. First detail with tactical context and player positioning. Second detail covering halftime adjustments and substitutions. Third detail explains key chances and defensive recoveries. Fourth detail captures crowd momentum and late pressure. Fifth detail summarizes final passages and implications for upcoming fixtures.`,
      gameClusterBuilder: async (input) => [
        {
          gameId: "game-city-river",
          gameName: "Manchester City vs River Plate",
          gameDateKey: input.gameDateKey,
          articleRefs: input.articles
        }
      ],
      gameStoryBuilder: async () => ({
        importanceScore: 92,
        bulletPoints: ["Top update", "Second update", "Third update"],
        reconstructedArticle: "Reconstructed article for Manchester City vs River Plate.",
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
    expect(result.gameDrafts.length).toBe(1);
    expect(result.stories.length).toBe(1);
    expect(result.stories[0].importanceScore).toBe(92);
    expect(result.stories[0].bulletPoints[0]).toBe("Top update");
    expect(result.stories[0].reconstructedArticle).toContain("Reconstructed article");
    expect(result.stories[0].fullTextStatus).toBe("ready");
    expect(result.stories[0].summarySource).toBe("llm");
    expect(result.stories[0].sourceName).toContain("BBC Football");
    expect(
      result.stories[0].sourceName.includes("ESPN Soccer") || result.stories[0].sourceName.includes("Yahoo Soccer")
    ).toBe(true);
  });

  it("fetches basketball stories from configured feeds and builds story text", async () => {
    const service = new SportsNewsService({
      feedFetcher: async (url) => ({
        status: 200,
        body: `<feed>${url}</feed>`
      }),
      feedParser: (xml): ParsedFeedArticle[] => {
        if (xml.includes("/nba/news")) {
          return [
            {
              externalId: "espn-nba-1",
              canonicalUrl: "https://www.espn.com/nba/recap/_/gameId/401000001",
              title: "Los Angeles Lakers 110-104 Boston Celtics",
              summary: "Lakers beat Celtics with a late run in overtime.",
              categories: ["NBA"],
              publishedAtMs: yesterdayMs
            }
          ];
        }
        if (xml.includes("sports.yahoo.com/nba")) {
          return [
            {
              externalId: "yahoo-nba-1",
              canonicalUrl: "https://sports.yahoo.com/nba/news/lakers-celtics-recap-123",
              title: "Los Angeles Lakers vs Boston Celtics recap",
              summary: "Lakers won 110-104 and closed with strong defense.",
              categories: ["NBA"],
              publishedAtMs: yesterdayMs + 1_000
            }
          ];
        }
        return [];
      },
      articleTextFetcher: async (url) =>
        `Full game report for ${url}. First key run. Defensive stops. Final possession execution.`,
      gameClusterBuilder: async (input) => [
        {
          gameId: "game-lakers-celtics",
          gameName: "Los Angeles Lakers vs Boston Celtics",
          gameDateKey: input.gameDateKey,
          articleRefs: input.articles
        }
      ],
      gameStoryBuilder: async () => ({
        importanceScore: 85,
        bulletPoints: ["Top update", "Second update", "Third update"],
        reconstructedArticle: "Reconstructed basketball article.",
        summarySource: "llm"
      })
    });

    const result = await service.fetchLatestStories({
      sport: "basketball",
      limit: 5,
      userAgent: "TestBot/1.0",
      feedTimeoutMs: 3000,
      articleTimeoutMs: 3000,
      timeZone: "UTC"
    });

    expect(result.sport).toBe("basketball");
    expect(result.gameDrafts.length).toBe(1);
    expect(result.stories.length).toBe(1);
    expect(result.stories[0].sourceName).toContain("ESPN NBA");
    expect(result.stories[0].sourceName).toContain("Yahoo NBA");
  });

  it("falls back to feed summary when article text fetch fails for all related articles", async () => {
    const service = new SportsNewsService({
      feedFetcher: async (url) => ({
        status: 200,
        body: `<rss>${url}</rss>`
      }),
      feedParser: (xml): ParsedFeedArticle[] =>
        xml.includes("bbci")
          ? [
              {
                externalId: "bbc-1",
                canonicalUrl: "https://news.example.com/a",
                title: "A Team 1-0 B Team",
                summary: "Summary used for fallback. Another sentence.",
                categories: ["Football"],
                publishedAtMs: yesterdayMs
              }
            ]
          : [
              {
                externalId: "espn-1",
                canonicalUrl: "https://news.example.com/b",
                title: "A Team vs B Team recap",
                summary: "Additional source summary sentence.",
                categories: ["Soccer"],
                publishedAtMs: yesterdayMs + 1_000
              }
            ],
      gameClusterBuilder: async (input) => [
        {
          gameId: "game-fallback",
          gameName: "A Team vs B Team",
          gameDateKey: input.gameDateKey,
          articleRefs: input.articles
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
      feedFetcher: async (url) => ({
        status: 200,
        body: `<rss>${url}</rss>`
      }),
      feedParser: (xml): ParsedFeedArticle[] =>
        xml.includes("bbci")
          ? [
              {
                externalId: "bbc-1",
                canonicalUrl: "https://news.example.com/a",
                title: "A Team 1-0 B Team",
                summary: "Summary used for fallback. Another sentence.",
                categories: ["Football"],
                publishedAtMs: yesterdayMs
              }
            ]
          : [
              {
                externalId: "espn-1",
                canonicalUrl: "https://news.example.com/b",
                title: "A Team vs B Team recap",
                summary: "Additional source summary sentence.",
                categories: ["Soccer"],
                publishedAtMs: yesterdayMs + 1_000
              }
            ],
      gameClusterBuilder: async (input) => [
        {
          gameId: "game-fulltext-skip",
          gameName: "A Team vs B Team",
          gameDateKey: input.gameDateKey,
          articleRefs: input.articles
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

  it("keeps BBC match narrative when metadata text includes published markers", async () => {
    process.env.SPORTS_NEWS_FETCH_FULL_TEXT = "true";

    const service = new SportsNewsService({
      feedFetcher: async (url) => ({
        status: 200,
        body: `<rss>${url}</rss>`
      }),
      feedParser: (xml): ParsedFeedArticle[] =>
        xml.includes("bbci")
          ? [
              {
                externalId: "bbc-clip-1",
                canonicalUrl: "https://news.example.com/bbc-clip",
                title: "Dundee United 2-1 Spartans",
                summary: "Dundee United advanced after a late scare.",
                categories: ["Football"],
                publishedAtMs: yesterdayMs
              }
            ]
          : [],
      gameClusterBuilder: async (input) => [
        {
          gameId: "dundee-vs-spartans",
          gameName: "Dundee United vs Spartans",
          gameDateKey: input.gameDateKey,
          articleRefs: input.articles
        }
      ],
      articleTextFetcher: async () =>
        [
          "Watch: Dundee United edge out Spartans in Scottish Cup.",
          "Media caption, Highlights: Dundee United 2-1 Spartans.",
          "Published 8 hours ago.",
          "Watch as Dundee United survived an early red card and a late comeback from Spartans to win 2-1.",
          "The result sends Dundee United into the quarter-finals after they held on through sustained pressure."
        ].join(" "),
      gameStoryBuilder: async () => ({
        importanceScore: 70,
        bulletPoints: ["Top update", "Second update", "Third update"],
        reconstructedArticle: "Reconstructed article.",
        summarySource: "llm"
      })
    });

    const result = await service.fetchLatestStories({
      sport: "football",
      limit: 2,
      userAgent: "TestBot/1.0",
      feedTimeoutMs: 3000,
      articleTimeoutMs: 3000,
      timeZone: "UTC"
    });

    expect(result.stories.length).toBe(1);
    expect(result.stories[0].fullTextStatus).toBe("ready");
  });

  it("includes stories from today and yesterday, excluding older dates", async () => {
    const service = new SportsNewsService({
      feedFetcher: async (url) => ({
        status: 200,
        body: `<feed>${url}</feed>`
      }),
      feedParser: (xml): ParsedFeedArticle[] => {
        if (xml.includes("bbci")) {
          return [
            {
              externalId: "today-bbc-1",
              canonicalUrl: "https://news.example.com/today-bbc",
              title: "Today FC 3-1 Rivals",
              summary: "Today summary from BBC.",
              categories: ["Football"],
              publishedAtMs: todayMs
            },
            {
              externalId: "yesterday-bbc-1",
              canonicalUrl: "https://news.example.com/yesterday-bbc",
              title: "Yesterday FC 1-1 City",
              summary: "Yesterday summary from BBC.",
              categories: ["Football"],
              publishedAtMs: yesterdayMs
            },
            {
              externalId: "old-bbc-1",
              canonicalUrl: "https://news.example.com/old-bbc",
              title: "Old FC 2-0 Town",
              summary: "Old summary.",
              categories: ["Football"],
              publishedAtMs: twoDaysAgoMs
            }
          ];
        }
        return [
          {
            externalId: "today-espn-1",
            canonicalUrl: "https://news.example.com/today-espn",
            title: "Today FC vs Rivals reaction",
            summary: "Today summary from ESPN.",
            categories: ["Soccer"],
            publishedAtMs: todayMs + 1_000
          },
          {
            externalId: "yesterday-espn-1",
            canonicalUrl: "https://news.example.com/yesterday-espn",
            title: "Yesterday FC vs City analysis",
            summary: "Yesterday summary from ESPN.",
            categories: ["Soccer"],
            publishedAtMs: yesterdayMs + 1_000
          }
        ];
      },
      articleTextFetcher: async (url) => `Full report for ${url}.`,
      gameClusterBuilder: async (input) => [
        {
          gameId: `game-${input.gameDateKey}`,
          gameName: input.articles[0]?.title ?? `Game ${input.gameDateKey}`,
          gameDateKey: input.gameDateKey,
          articleRefs: input.articles
        }
      ],
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
        sport: "volleyball",
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
            canonicalUrl: "https://www.espn.com/soccer/report/_/gameId/10002",
            title: "Arsenal vs Chelsea reaction",
            summary: "Arsenal beat Chelsea 2-1 in a tense match report.",
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

  it("excludes pre-match fixture pieces that do not report a completed match", async () => {
    const service = new SportsNewsService({
      feedFetcher: async (url) => ({
        status: 200,
        body: `<feed>${url}</feed>`
      }),
      feedParser: (xml): ParsedFeedArticle[] =>
        xml.includes("bbci")
          ? [
              {
                externalId: "bbc-preview-1",
                canonicalUrl: "https://news.example.com/preview-1",
                title: "Man City vs Newcastle",
                summary:
                  "The sides have been drawn together again and will face each other on Saturday after City won 5-1 on aggregate in a previous cup tie.",
                categories: ["Football"],
                publishedAtMs: yesterdayMs
              }
            ]
          : [],
      articleTextFetcher: async () => "preview text"
    });

    const result = await service.fetchLatestStories({
      sport: "football",
      limit: 5,
      userAgent: "TestBot/1.0",
      feedTimeoutMs: 3000,
      articleTimeoutMs: 3000,
      timeZone: "UTC"
    });

    expect(result.gameDrafts.length).toBe(0);
    expect(result.stories.length).toBe(0);
  });
});
