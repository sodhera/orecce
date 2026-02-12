import { describe, expect, it } from "vitest";
import { NewsIngestionService } from "../src/news/newsIngestionService";
import {
  NewsSourceConfig,
  NewsSyncRepository,
  NewsSyncRunInput,
  NewsUpsertResult,
  ParsedFeedArticle,
  SourceSyncStateInput
} from "../src/news/types";

class FakeNewsRepository implements NewsSyncRepository {
  public readonly sourceStates: SourceSyncStateInput[] = [];
  public readonly runInputs: NewsSyncRunInput[] = [];
  private readonly storage = new Map<string, ParsedFeedArticle>();

  async upsertArticles(_: NewsSourceConfig, articles: ParsedFeedArticle[]): Promise<NewsUpsertResult> {
    let insertedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const article of articles) {
      const existing = this.storage.get(article.canonicalUrl);
      if (!existing) {
        insertedCount += 1;
        this.storage.set(article.canonicalUrl, article);
        continue;
      }

      const isChanged =
        existing.title !== article.title ||
        existing.summary !== article.summary ||
        existing.externalId !== article.externalId;
      if (isChanged) {
        updatedCount += 1;
      } else {
        unchangedCount += 1;
      }
      this.storage.set(article.canonicalUrl, article);
    }

    return {
      fetchedCount: articles.length,
      insertedCount,
      updatedCount,
      unchangedCount
    };
  }

  async recordSourceSyncState(input: SourceSyncStateInput): Promise<void> {
    this.sourceStates.push(input);
  }

  async recordSyncRun(input: NewsSyncRunInput): Promise<void> {
    this.runInputs.push(input);
  }
}

describe("NewsIngestionService", () => {
  it("syncs sources and records run/source state", async () => {
    const repo = new FakeNewsRepository();
    const sources: NewsSourceConfig[] = [
      {
        id: "source-a",
        name: "Source A",
        homepageUrl: "https://a.example.com",
        feedUrl: "https://a.example.com/rss",
        language: "en"
      }
    ];

    const service = new NewsIngestionService({
      repository: repo,
      sources,
      feedFetcher: async () => ({
        status: 200,
        body: "<rss/>"
      }),
      feedParser: () => [
        {
          externalId: "1",
          canonicalUrl: "https://a.example.com/story-1",
          title: "Story 1",
          summary: "Summary 1",
          categories: ["World"]
        },
        {
          externalId: "2",
          canonicalUrl: "https://a.example.com/story-2",
          title: "Story 2",
          summary: "Summary 2",
          categories: ["Tech"]
        }
      ]
    });

    const run = await service.syncAllSources({
      schedule: "every 3 hours",
      maxArticlesPerSource: 10,
      sourceConcurrency: 2,
      feedTimeoutMs: 3000,
      articleTimeoutMs: 3000,
      articleConcurrency: 1,
      fetchFullText: false,
      userAgent: "TestBot/1.0"
    });

    expect(run.sourceResults.length).toBe(1);
    expect(run.totalFetchedCount).toBe(2);
    expect(run.totalInsertedCount).toBe(2);
    expect(run.totalUpdatedCount).toBe(0);
    expect(repo.sourceStates.length).toBe(1);
    expect(repo.sourceStates[0].status).toBe("success");
    expect(repo.runInputs.length).toBe(1);
    expect(repo.runInputs[0].schedule).toBe("every 3 hours");
  });

  it("marks source as skipped when deadline budget is exhausted", async () => {
    const repo = new FakeNewsRepository();
    const source: NewsSourceConfig = {
      id: "source-b",
      name: "Source B",
      homepageUrl: "https://b.example.com",
      feedUrl: "https://b.example.com/rss",
      language: "en"
    };

    const service = new NewsIngestionService({
      repository: repo,
      sources: [source],
      feedFetcher: async () => ({
        status: 200,
        body: "<rss/>"
      }),
      feedParser: () => []
    });

    const run = await service.syncAllSources({
      schedule: "every 3 hours",
      maxArticlesPerSource: 10,
      sourceConcurrency: 1,
      feedTimeoutMs: 3000,
      articleTimeoutMs: 3000,
      articleConcurrency: 1,
      fetchFullText: false,
      userAgent: "TestBot/1.0",
      deadlineMs: Date.now()
    });

    expect(run.sourceResults[0].status).toBe("skipped");
    expect(repo.sourceStates[0].status).toBe("skipped");
  });

  it("records non-http failures without undefined httpStatus field", async () => {
    const repo = new FakeNewsRepository();
    const source: NewsSourceConfig = {
      id: "source-c",
      name: "Source C",
      homepageUrl: "https://c.example.com",
      feedUrl: "https://c.example.com/rss",
      language: "en"
    };

    const service = new NewsIngestionService({
      repository: repo,
      sources: [source],
      feedFetcher: async () => {
        throw new Error("network timeout");
      }
    });

    const run = await service.syncAllSources({
      schedule: "every 3 hours",
      maxArticlesPerSource: 10,
      sourceConcurrency: 1,
      feedTimeoutMs: 3000,
      articleTimeoutMs: 3000,
      articleConcurrency: 1,
      fetchFullText: false,
      userAgent: "TestBot/1.0"
    });

    expect(run.sourceResults[0].status).toBe("error");
    expect(Object.prototype.hasOwnProperty.call(run.sourceResults[0], "httpStatus")).toBe(false);
    expect(repo.runInputs.length).toBe(1);
  });
});
