import { describe, expect, it } from "vitest";
import { normalizeProfileKey } from "../src/utils/text";
import { PostGenerationService } from "../src/services/postGenerationService";
import { FakeGateway, InMemoryRepository } from "./testDoubles";

describe("integration flow (no network)", () => {
  it("supports prompt prefs, generation, listing, and feedback persistence", async () => {
    const repo = new InMemoryRepository();
    const gateway = new FakeGateway([
      {
        title: "Physics surprise",
        body:
          "In 1915, Einstein published general relativity and reset how people explained gravity. The pressure was huge because Newton’s model worked well but failed on key edge cases. Then new observations matched Einstein’s equations, so the idea spread fast. It mattered because modern GPS and space science now depend on this shift.",
        post_type: "fact",
        tags: ["physics", "todayilearned"],
        confidence: "high",
        uncertainty_note: null
      }
    ]);

    await repo.setPromptPreferences("user-1", {
      biographyInstructions: "Focus on founders from Silicon Valley.",
      nicheInstructions: "More internet-era references."
    });

    const prefs = await repo.getPromptPreferences("user-1");
    expect(prefs.biographyInstructions).toContain("Silicon Valley");

    const service = new PostGenerationService(repo, gateway);
    const post = await service.generateNextPost({
      userId: "user-1",
      mode: "TRIVIA",
      profile: "physics",
      length: "short"
    });

    expect(post.title).toBe("Physics surprise");

    const listed = await repo.listPosts({
      userId: "user-1",
      mode: "TRIVIA",
      profileKey: normalizeProfileKey("physics"),
      pageSize: 10
    });

    expect(listed.items.length).toBe(1);
    expect(listed.items[0].id).toBe(post.id);

    const feedback = await repo.saveFeedback({
      userId: "user-1",
      postId: post.id,
      type: "upvote"
    });

    expect(feedback.type).toBe("upvote");

    const feedbackListed = await repo.listFeedback({
      userId: "user-1",
      pageSize: 10
    });

    expect(feedbackListed.items.length).toBe(1);
    expect(feedbackListed.items[0].postId).toBe(post.id);
  });
});
