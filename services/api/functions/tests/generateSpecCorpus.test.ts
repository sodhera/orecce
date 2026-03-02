import { describe, expect, it } from "vitest";
import type { SpecTopicBrief } from "@orecce/api-core/src/recces/specGeneration";
import {
  buildBriefId,
  parseApprovedBriefIds,
  renderBriefReviewDoc,
  type StoredSpecCarouselPost
} from "../scripts/generate-spec-corpus";

function sampleBrief(overrides?: Partial<SpecTopicBrief>): SpecTopicBrief {
  return {
    category: "mental_model_library",
    template_used: "model_breakdown",
    working_title: "Goodhart's Law in dashboard cultures",
    primary_topic: "Goodhart's Law",
    subtopics: ["metrics", "optimization", "incentives"],
    source_kind: "research_paper",
    angle: "How teams corrupt dashboards when one number becomes sovereign.",
    example_anchors: ["Wells Fargo", "test-score regimes"],
    ...overrides
  };
}

describe("generate-spec-corpus review flow", () => {
  it("builds stable brief ids for identical briefs", () => {
    const first = buildBriefId(sampleBrief());
    const second = buildBriefId(sampleBrief());
    const changed = buildBriefId(sampleBrief({ working_title: "Another title" }));

    expect(first).toBe(second);
    expect(changed).not.toBe(first);
  });

  it("parses approved briefs from the review markdown", () => {
    const markdown = [
      "### 1. Goodhart's Law in dashboard cultures",
      "- Brief ID: `mental-model-library-goodhart-s-law-in-dashboard-cultures-abc123`",
      "- Approval: [x] Approve for rendering",
      "",
      "### 2. Another brief",
      "- Brief ID: `mental-model-library-another-brief-def456`",
      "- Approval: [ ] Approve for rendering"
    ].join("\n");

    const approved = parseApprovedBriefIds(markdown);
    expect([...approved]).toEqual(["mental-model-library-goodhart-s-law-in-dashboard-cultures-abc123"]);
  });

  it("renders a review doc with approval and render status", () => {
    const brief = sampleBrief();
    const briefId = buildBriefId(brief);
    const post: StoredSpecCarouselPost = {
      brief_id: briefId,
      source_working_title: brief.working_title,
      post_type: "carousel",
      category: "mental_model_library",
      template_used: "model_breakdown",
      title: "When KPI targets eat the real goal",
      source_kind: "essay",
      primary_topic: "Goodhart's Law",
      subtopics: ["metrics", "gaming", "incentives"],
      slides: [
        { slide_number: 1, role: "hook", text: "A KPI becomes dangerous when people optimize the score instead of the goal." },
        { slide_number: 2, role: "definition", text: "That is Goodhart's Law in action across teams, firms, and institutions." },
        { slide_number: 3, role: "example", text: "Wells Fargo's account targets rewarded fake openings rather than real customer value." },
        { slide_number: 4, role: "example", text: "Schools can raise test scores without raising learning when the exam becomes the mission." },
        { slide_number: 5, role: "closing", text: "Treat any single metric as a clue, not the whole truth." }
      ]
    };

    const markdown = renderBriefReviewDoc(
      {
        historical_nerd: { briefs: [], posts: [] },
        mental_model_library: { briefs: [brief], posts: [post] }
      },
      new Set<string>([briefId])
    );

    expect(markdown).toContain(`- Brief ID: \`${briefId}\``);
    expect(markdown).toContain("- Approval: [x] Approve for rendering");
    expect(markdown).toContain("- Render status: `rendered`");
  });
});
