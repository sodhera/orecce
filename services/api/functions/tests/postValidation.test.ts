import { describe, expect, it } from "vitest";
import { validatePostContent } from "../src/validation/postValidation";

const basePost = {
  title: "Apple turnaround moment",
  body: [
    "In 1997, Apple was weeks from a cash cliff.",
    "Because the product line was bloated, Jobs cut it down to a few bets.",
    "Then he made a brutal trade: focus now, ego later.",
    "That meant Apple bought time to ship the iMac and prove it could win again.",
    "Under pressure, survival comes from focus and speed, not more options."
  ].join("\n"),
  post_type: "moment",
  tags: ["apple", "strategy"],
  confidence: "high" as const,
  uncertainty_note: null
};

describe("validatePostContent", () => {
  it("accepts a valid biography short post", () => {
    const result = validatePostContent(basePost, "BIOGRAPHY", "short");
    expect(result.ok).toBe(true);
  });

  it("rejects biography speculation markers", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: "Steve Jobs might have felt pressure before the launch, and he probably thought the team needed a miracle."
      },
      "BIOGRAPHY",
      "short"
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("speculative");
  });

  it("rejects generic biography openings", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: "Steve Jobs is widely known for leading Apple and shaping consumer technology through iconic launches and product design decisions. His public career includes company milestones, product announcements, and executive leadership changes that influenced business strategy and market outcomes across decades."
      },
      "BIOGRAPHY",
      "short"
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("too generic");
  });

  it("rejects biography openings without high-stakes signal", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: "In 2005, Bob Iger became CEO at Disney and continued expanding content strategy across film and television divisions while focusing on long-term growth initiatives and global reach across entertainment markets."
      },
      "BIOGRAPHY",
      "short"
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("high-stakes");
  });

  it("rejects biography posts without consequence beat", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: "In 2018, Tesla faced a 5,000-cars-per-week deadline during severe production pressure. Because automation bottlenecks kept slowing output, teams shifted to temporary lines and revised the workflow under hard constraints. The company kept pushing through the quarter with high operational intensity."
      },
      "BIOGRAPHY",
      "short"
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("consequence");
  });

  it("rejects overly dense biography sentence structure", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: "In 2018, during a severe capital and production constraint period that involved compounding supply chain delays and operational uncertainty across several teams, Tesla leadership pursued a sequence of rapidly changing interventions intended to preserve manufacturing throughput while managing investor pressure and execution risk that continued rising each week."
      },
      "BIOGRAPHY",
      "short"
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("too dense");
  });

  it("rejects emotionally flat biography writing", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: "In 2012, the company announced a new product line and changed internal reporting. Because teams reorganized, the launch process became more structured across departments. It mattered because the update influenced planning for later releases."
      },
      "BIOGRAPHY",
      "short"
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("emotionally flat");
  });

  it("rejects filler phrasing for word economy", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: "In 2008, Tesla faced a cash cliff and had to raise money quickly. It is important to note that the team also had delivery pressure at the same time. It mattered because the company needed to survive long enough to keep shipping cars."
      },
      "BIOGRAPHY",
      "short"
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("filler phrasing");
  });

  it("rejects biography posts missing a final insight line", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: [
          "In 1997, Apple was weeks from a cash cliff.",
          "Because the lineup was bloated, Jobs cut products fast.",
          "Then priorities changed under pressure.",
          "That meant Apple bought time to survive."
        ].join("\n")
      },
      "BIOGRAPHY",
      "short"
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("insight");
  });

  it("does not treat Result: labels as dialogue formatting", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: [
          "In 1997, Apple faced a cash crunch crisis with weeks of runway left.",
          "Because the lineup was bloated, Jobs cut products fast.",
          "Result: the company bought time and stabilized.",
          "That meant it could ship the iMac and rebuild momentum.",
          "Under pressure, focus is the weapon, and complexity is the tax."
        ].join("\n")
      },
      "BIOGRAPHY",
      "short"
    );

    expect(result.errors.join(" ")).not.toContain("dialogue");
  });

  it("rejects body length mismatch", () => {
    const result = validatePostContent(
      {
        ...basePost,
        body: "Too short body."
      },
      "TRIVIA",
      "medium"
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("120-220");
  });
});
