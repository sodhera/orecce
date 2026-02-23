import { describe, expect, it } from "vitest";
import { ReccesEssayDocument, ReccesRepository } from "../src/recces/firestoreReccesRepository";
import {
  ReccesRecommendationService,
  buildReccesPostId
} from "../src/services/reccesRecommendationService";
import { InMemoryRepository } from "./testDoubles";

class FakeReccesRepository implements ReccesRepository {
  constructor(private readonly docsByAuthor: Record<string, ReccesEssayDocument[]>) {}

  async listEssayDocuments(authorId: string): Promise<ReccesEssayDocument[]> {
    return this.docsByAuthor[authorId] ?? [];
  }
}

function buildDocs(): ReccesEssayDocument[] {
  return [
    {
      essayId: "startup",
      sourceTitle: "Startup Essays",
      posts: [
        {
          theme: "Understand users",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Founders should talk to users directly and iterate from support feedback."
            }
          ]
        },
        {
          theme: "Fundraising",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Pitch investors and negotiate term sheets when momentum is strong."
            }
          ]
        }
      ]
    },
    {
      essayId: "startup2",
      sourceTitle: "Startup Follow Ups",
      posts: [
        {
          theme: "Customer support",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Support conversations reveal user pain and help teams iterate."
            }
          ]
        }
      ]
    },
    {
      essayId: "programming",
      sourceTitle: "Programming Essays",
      posts: [
        {
          theme: "Lisp",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Lisp macros help programmers build expressive software and reason about syntax trees."
            }
          ]
        },
        {
          theme: "Compilers",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Compiler design rewards programmers who reason about language semantics."
            }
          ]
        }
      ]
    }
  ];
}

describe("ReccesRecommendationService", () => {
  it("boosts similar posts from user feedback and excludes downvoted content", async () => {
    const repo = new InMemoryRepository();
    const docs = buildDocs();
    const service = new ReccesRecommendationService(
      new FakeReccesRepository({ paul_graham: docs }),
      repo
    );

    const likedPostId = buildReccesPostId("paul_graham", "startup", 0);
    const downvotedPostId = buildReccesPostId("paul_graham", "programming", 0);
    await repo.saveFeedback({
      userId: "u1",
      postId: likedPostId,
      type: "upvote"
    });
    await repo.saveFeedback({
      userId: "u1",
      postId: downvotedPostId,
      type: "downvote"
    });

    const result = await service.recommend({
      userId: "u1",
      authorId: "paul_graham",
      limit: 3
    });

    expect(result.meta.seedsUsed).toBeGreaterThanOrEqual(1);
    expect(result.items.some((item) => item.id === downvotedPostId)).toBe(false);
    expect(result.items[0]?.essayId).toBe("startup2");
  });

  it("uses session seed posts to steer ranking", async () => {
    const repo = new InMemoryRepository();
    const docs = buildDocs();
    const service = new ReccesRecommendationService(
      new FakeReccesRepository({ paul_graham: docs }),
      repo
    );

    const seedPostId = buildReccesPostId("paul_graham", "programming", 0);
    const result = await service.recommend({
      userId: "u2",
      authorId: "paul_graham",
      limit: 2,
      seedPostId
    });

    expect(result.meta.seedsUsed).toBe(1);
    expect(result.items[0]?.essayId).toBe("programming");
    expect(result.items[0]?.id).not.toBe(seedPostId);
  });

  it("respects explicit excludes", async () => {
    const repo = new InMemoryRepository();
    const docs = buildDocs();
    const service = new ReccesRecommendationService(
      new FakeReccesRepository({ paul_graham: docs }),
      repo
    );

    const excludedId = buildReccesPostId("paul_graham", "startup2", 0);
    const result = await service.recommend({
      userId: "u3",
      authorId: "paul_graham",
      limit: 5,
      excludePostIds: [excludedId]
    });

    expect(result.items.some((item) => item.id === excludedId)).toBe(false);
    expect(result.items.length).toBeGreaterThan(0);
  });
});
