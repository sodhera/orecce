import { describe, expect, it } from "vitest";
import { PostGenerationService } from "../src/services/postGenerationService";
import { FakeGateway, InMemoryRepository } from "./testDoubles";

describe("PostGenerationService", () => {
  it("saves first generated post without service-level validation retries", async () => {
    const repo = new InMemoryRepository();
    const gateway = new FakeGateway([
      {
        title: "Fast Bill Gates story",
        body: "Bill Gates made a hard call under pressure, and the outcome changed Microsoft’s trajectory quickly.",
        post_type: "moment",
        tags: ["billgates", "microsoft"],
        confidence: "medium",
        uncertainty_note: null
      }
    ]);

    const service = new PostGenerationService(repo, gateway);
    const post = await service.generateNextPost({
      userId: "u1",
      mode: "BIOGRAPHY",
      profile: "Steve Jobs",
      length: "short"
    });

    expect(post.title).toBe("Fast Bill Gates story");
    expect(gateway.calls.length).toBe(1);
  });

  it("supports stream generation path", async () => {
    const repo = new InMemoryRepository();
    const gateway = new FakeGateway([
      {
        title: "Streamed post",
        body: "This body arrives through the stream path and is stored as the final post.",
        post_type: "moment",
        tags: ["bio"],
        confidence: "high",
        uncertainty_note: null
      }
    ]);

    const service = new PostGenerationService(repo, gateway);
    const chunks: string[] = [];

    const post = await service.generateNextPostStream(
      {
        userId: "u1",
        mode: "BIOGRAPHY",
        profile: "Bill Gates",
        length: "short"
      },
      (chunk) => {
        chunks.push(chunk);
      }
    );

    expect(post.title).toBe("Streamed post");
    expect(chunks.length).toBeGreaterThan(0);
    expect(gateway.calls.length).toBe(1);
    expect(gateway.calls[0]).toMatchObject({
      mode: "BIOGRAPHY",
      profile: "Bill Gates"
    });
  });
});
