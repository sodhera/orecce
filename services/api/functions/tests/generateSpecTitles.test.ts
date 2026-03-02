import { describe, expect, it } from "vitest";
import { isNovelTitle, renderTitleReviewDoc } from "../scripts/generate-spec-titles";

describe("generate-spec-titles", () => {
  it("rejects duplicate and near-duplicate titles", () => {
    const existing = [
      "Augustus and the Grain Fleet: How logistics remade Roman legitimacy",
      "Optionality vs Commitment Tradeoff"
    ];

    expect(isNovelTitle("Augustus and the Grain Fleet - How logistics remade Roman legitimacy", existing)).toBe(false);
    expect(isNovelTitle("Optionality and commitment tradeoffs in strategy", existing)).toBe(false);
    expect(isNovelTitle("Caravanserais and the long tail of empire", existing)).toBe(true);
  });

  it("renders a titles-only review document", () => {
    const markdown = renderTitleReviewDoc({
      historical_nerd: ["Augustus and the Grain Fleet", "Caravanserais and the Long Tail of Empire"],
      mental_model_library: ["Optionality vs Commitment Tradeoff", "Calibration and Confidence-Interval Mentality"]
    });

    expect(markdown).toContain("# Topic Titles Review");
    expect(markdown).toContain("## Historical Nerd");
    expect(markdown).toContain("1. Augustus and the Grain Fleet");
    expect(markdown).toContain("## Mental Model Library");
    expect(markdown).not.toContain("Primary topic:");
  });
});
