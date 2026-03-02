import { describe, expect, it } from "vitest";
import {
  finalizeCuratedLibrary,
  renderCuratedLibraryReviewDoc
} from "../scripts/generate-curated-title-library";

describe("generate-curated-title-library", () => {
  it("rejects duplicate canonical topics", () => {
    expect(() =>
      finalizeCuratedLibrary(
        "historical_nerd",
        {
          category: "historical_nerd",
          pillars: [
            {
              pillar: "state_capacity_and_governance",
              core_topics: [
                {
                  canonical_title: "Grain Doles and Urban Power",
                  tier: "tier_1",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            },
            {
              pillar: "trade_infrastructure_and_commerce",
              core_topics: [
                {
                  canonical_title: "Grain Doles and Urban Power",
                  tier: "tier_2",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            },
            {
              pillar: "fiscal_systems_and_money",
              core_topics: [
                {
                  canonical_title: "Tax Farming and State Reach",
                  tier: "tier_2",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            },
            {
              pillar: "military_logistics_and_war",
              core_topics: [
                {
                  canonical_title: "Victualling Boards and Naval Endurance",
                  tier: "tier_2",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            },
            {
              pillar: "mobility_information_and_control",
              core_topics: [
                {
                  canonical_title: "Postal Monopolies and State Reach",
                  tier: "tier_2",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            }
          ]
        },
        5
      )
    ).toThrow(/duplicate title detected/i);
  });

  it("renders a curated review document with tiers and status tags", () => {
    const markdown = renderCuratedLibraryReviewDoc({
      historical_nerd: finalizeCuratedLibrary(
        "historical_nerd",
        {
          category: "historical_nerd",
          pillars: [
            {
              pillar: "state_capacity_and_governance",
              core_topics: [
                {
                  canonical_title: "Grain Doles and Urban Power",
                  tier: "tier_1",
                  publishability: "user_facing_content_topic",
                  variants: [
                    {
                      title: "Granaries and Famine Politics",
                      publishability: "user_facing_content_topic",
                      disposition: "future_variant"
                    }
                  ]
                }
              ]
            },
            {
              pillar: "trade_infrastructure_and_commerce",
              core_topics: [
                {
                  canonical_title: "Caravanserais and Long-Distance Trade",
                  tier: "tier_2",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            },
            {
              pillar: "fiscal_systems_and_money",
              core_topics: [
                {
                  canonical_title: "Tax Farming and State Reach",
                  tier: "tier_2",
                  publishability: "internal_operating_concept",
                  variants: []
                }
              ]
            },
            {
              pillar: "military_logistics_and_war",
              core_topics: [
                {
                  canonical_title: "Victualling Boards and Naval Endurance",
                  tier: "tier_3",
                  publishability: "needs_reframing_before_publication",
                  variants: []
                }
              ]
            },
            {
              pillar: "mobility_information_and_control",
              core_topics: [
                {
                  canonical_title: "Postal Monopolies and State Reach",
                  tier: "tier_3",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            }
          ]
        },
        6
      ),
      mental_model_library: finalizeCuratedLibrary(
        "mental_model_library",
        {
          category: "mental_model_library",
          pillars: [
            {
              pillar: "decision_making_and_judgment",
              core_topics: [
                {
                  canonical_title: "Base Rates Before Stories",
                  tier: "tier_1",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            },
            {
              pillar: "risk_uncertainty_and_resilience",
              core_topics: [
                {
                  canonical_title: "Tail Risk and Survival",
                  tier: "tier_2",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            },
            {
              pillar: "incentives_power_and_coordination",
              core_topics: [
                {
                  canonical_title: "Principal-Agent Drift",
                  tier: "tier_2",
                  publishability: "user_facing_content_topic",
                  variants: []
                }
              ]
            },
            {
              pillar: "systems_operations_and_constraints",
              core_topics: [
                {
                  canonical_title: "Bottlenecks Over Busywork",
                  tier: "tier_3",
                  publishability: "internal_operating_concept",
                  variants: []
                }
              ]
            },
            {
              pillar: "causality_measurement_and_learning",
              core_topics: [
                {
                  canonical_title: "Counterfactual Thinking",
                  tier: "tier_3",
                  publishability: "needs_reframing_before_publication",
                  variants: [
                    {
                      title: "Counterfactuals Beyond Correlation",
                      publishability: "user_facing_content_topic",
                      disposition: "alternate"
                    }
                  ]
                }
              ]
            }
          ]
        },
        6
      )
    });

    expect(markdown).toContain("# Curated Topic Library Review");
    expect(markdown).toContain("## Historical Nerd");
    expect(markdown).toContain("#### Tier 1");
    expect(markdown).toContain("Grain Doles and Urban Power [U]");
    expect(markdown).toContain("Variants: Granaries and Famine Politics [U] (future variant)");
    expect(markdown).toContain("## Mental Model Library");
    expect(markdown).toContain("Base Rates Before Stories [U]");
  });
});
