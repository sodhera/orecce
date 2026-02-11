import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE_BY_MODE } from "../src/services/prefillBlueprint";
import { COMMON_PREFILL_DATASET_USER_ID, PrefillService } from "../src/services/prefillService";
import { normalizeProfileKey } from "../src/utils/text";
import { FakeGateway, InMemoryRepository } from "./testDoubles";

describe("PrefillService", () => {
  it("generates generic prefills and stores them in the repository", async () => {
    const repo = new InMemoryRepository();
    await repo.getOrCreateUser({ userId: "u1" });

    const gateway = new FakeGateway([
      {
        title: "Bio one",
        body: "Biography post",
        post_type: "biography",
        tags: ["bio"],
        confidence: "high",
        uncertainty_note: null
      },
      {
        title: "Trivia one",
        body: "Trivia post",
        post_type: "fact",
        tags: ["trivia"],
        confidence: "medium",
        uncertainty_note: null
      },
      {
        title: "Niche one",
        body: "Niche post",
        post_type: "insight",
        tags: ["niche"],
        confidence: "low",
        uncertainty_note: null
      }
    ]);

    const service = new PrefillService(repo, gateway);
    const summary = await service.generateGenericPrefills({
      userId: "u1",
      postsPerMode: 1
    });

    expect(summary.postCount).toBe(3);

    const biography = await repo.listPosts({
      userId: "u1",
      mode: "BIOGRAPHY",
      profileRaw: DEFAULT_PROFILE_BY_MODE.BIOGRAPHY,
      profileKey: normalizeProfileKey(DEFAULT_PROFILE_BY_MODE.BIOGRAPHY),
      pageSize: 5
    });
    expect(biography.items.length).toBe(1);

    const fallback = await repo.listPosts({
      userId: "u1",
      mode: "TRIVIA",
      profileRaw: "unknown topic",
      profileKey: normalizeProfileKey("unknown topic"),
      pageSize: 5
    });
    expect(fallback.items.length).toBe(1);
    expect(fallback.items[0].profile).toBe(DEFAULT_PROFILE_BY_MODE.TRIVIA);
  });

  it("builds common dataset once and copies it to each new user", async () => {
    const repo = new InMemoryRepository();
    const gateway = new FakeGateway([
      {
        title: "Bio template",
        body: "Biography template post",
        post_type: "biography",
        tags: ["bio"],
        confidence: "high",
        uncertainty_note: null
      },
      {
        title: "Trivia template",
        body: "Trivia template post",
        post_type: "fact",
        tags: ["trivia"],
        confidence: "medium",
        uncertainty_note: null
      },
      {
        title: "Niche template",
        body: "Niche template post",
        post_type: "insight",
        tags: ["niche"],
        confidence: "low",
        uncertainty_note: null
      }
    ]);

    const service = new PrefillService(repo, gateway);
    await service.ensureUserPrefillsFromCommonDataset({ userId: "u1", postsPerMode: 1 });
    await service.ensureUserPrefillsFromCommonDataset({ userId: "u2", postsPerMode: 1 });

    expect(gateway.calls.length).toBe(3);

    const common = await repo.listAllPrefillPosts(COMMON_PREFILL_DATASET_USER_ID);
    const user1 = await repo.listAllPrefillPosts("u1");
    const user2 = await repo.listAllPrefillPosts("u2");
    const normalizeTitles = (posts: Array<{ title: string }>) => posts.map((post) => post.title).sort();

    expect(common.length).toBe(3);
    expect(normalizeTitles(user1)).toEqual(normalizeTitles(common));
    expect(normalizeTitles(user2)).toEqual(normalizeTitles(common));
  });
});
