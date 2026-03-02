import { describe, expect, it } from "vitest";
import {
  findClosestBriefMatch,
  findClosestPostMatch,
  isBriefNovel,
  isPostNovel,
  parseSpecCarouselPost,
  parseSpecTopicBatch
} from "@orecce/api-core/src/recces/specGeneration";

describe("specGeneration novelty", () => {
  it("rejects overly similar topic briefs", () => {
    const existing = parseSpecTopicBatch({
      briefs: [
        {
          category: "mental_model_library",
          template_used: "model_breakdown",
          working_title: "Goodhart's Law in product dashboards",
          primary_topic: "Goodhart's Law",
          subtopics: ["metrics", "dashboards", "incentives"],
          source_kind: "research_paper",
          angle: "Why product teams corrupt one-number dashboards when optimization pressure rises.",
          example_anchors: ["click-through rate", "call center handling time"]
        }
      ]
    }).briefs;

    const candidate = parseSpecTopicBatch({
      briefs: [
        {
          category: "mental_model_library",
          template_used: "model_breakdown",
          working_title: "When dashboard targets break the metric",
          primary_topic: "Goodhart's Law",
          subtopics: ["metrics", "optimization", "incentives"],
          source_kind: "research_paper",
          angle: "How single dashboard targets distort the system they were supposed to measure.",
          example_anchors: ["click-through rate", "hospital coding"]
        }
      ]
    }).briefs[0];

    expect(isBriefNovel(candidate, existing)).toBe(false);
    expect(findClosestBriefMatch(candidate, existing)?.exactTitleMatch).toBe(true);
  });

  it("accepts distinct rendered posts and renumbers slides", () => {
    const existing = [
      parseSpecCarouselPost({
        post_type: "carousel",
        category: "historical_nerd",
        template_used: "historical_turning_point",
        title: "Why Constantinople's fall reshaped Europe",
        source_kind: "history_book",
        primary_topic: "Fall of Constantinople (1453)",
        subtopics: ["trade", "state capacity", "gunpowder"],
        slides: [
          { slide_number: 1, role: "hook", text: "Constantinople fell in 1453, but the real story was structural." },
          { slide_number: 2, role: "setup", text: "Byzantium had already narrowed into a fragile urban core with thin reserves." },
          { slide_number: 3, role: "mechanism", text: "Ottoman artillery and logistics converged at exactly the wrong moment for the old walls." },
          { slide_number: 4, role: "consequence", text: "Trade and power shifted under a different imperial order in the eastern Mediterranean." },
          { slide_number: 5, role: "pattern", text: "A siege can look sudden even when the deciding forces have been compounding for decades." }
        ]
      })
    ];

    const candidate = parseSpecCarouselPost({
      post_type: "carousel",
      category: "historical_nerd",
      template_used: "historical_slow_build",
      title: "Containerization and the quiet remaking of global trade",
      source_kind: "article",
      primary_topic: "Containerization and global trade",
      subtopics: ["ports", "shipping costs", "supply chains"],
      slides: [
        { slide_number: 4, role: "hook", text: "A metal box changed global trade by changing where friction lived." },
        { slide_number: 8, role: "setup", text: "Break-bulk shipping made cargo slow, theft-prone, and expensive to coordinate." },
        { slide_number: 12, role: "mechanism", text: "Standardized containers let ships, rail, and trucks share the same unit of movement." },
        { slide_number: 20, role: "example", text: "Ports like Rotterdam scaled with cranes and deeper berths while older ports lost share." },
        { slide_number: 31, role: "consequence", text: "Global manufacturing chains stretched farther because transport costs fell and reliability rose." }
      ]
    });

    expect(candidate.slides.map((slide) => slide.slide_number)).toEqual([1, 2, 3, 4, 5]);
    expect(isPostNovel(candidate, existing)).toBe(true);
    expect(findClosestPostMatch(candidate, existing)?.exactTitleMatch).toBe(false);
  });
});
