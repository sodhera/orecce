import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import { SPEC_POST_CATEGORIES, SpecPostCategory } from "@orecce/api-core/src/recces/specGeneration";
import { loadDotEnv } from "./loadDotEnv";

type Args = Record<string, string | boolean>;

type Publishability = "user_facing_content_topic" | "internal_operating_concept" | "needs_reframing_before_publication";
type TopicTier = "tier_1" | "tier_2" | "tier_3";
type VariantDisposition = "sub_angle" | "alternate" | "future_variant" | "merge" | "rewrite";

type HistoricalPillar =
  | "state_capacity_and_governance"
  | "trade_infrastructure_and_commerce"
  | "fiscal_systems_and_money"
  | "military_logistics_and_war"
  | "mobility_information_and_control";

type MentalModelPillar =
  | "decision_making_and_judgment"
  | "risk_uncertainty_and_resilience"
  | "incentives_power_and_coordination"
  | "systems_operations_and_constraints"
  | "causality_measurement_and_learning";

type PillarSlug = HistoricalPillar | MentalModelPillar;

interface CuratedLibraryManifest {
  generated_at: string;
  updated_at: string;
  model: string;
  config: {
    target_per_category: number;
    out_dir: string;
  };
  categories: Record<string, { total_titles: number; core_topics: number; variants: number }>;
}

interface VariantTitle {
  title: string;
  publishability: Publishability;
  disposition: VariantDisposition;
}

interface CoreTopic {
  canonical_title: string;
  tier: TopicTier;
  publishability: Publishability;
  variants: VariantTitle[];
}

interface CuratedPillar {
  pillar: PillarSlug;
  core_topics: CoreTopic[];
}

interface CuratedCategoryLibrary {
  category: SpecPostCategory;
  pillars: CuratedPillar[];
}

const DEFAULT_OUT_DIR = path.resolve(__dirname, "../../docs/generated-posts/curated-title-libraries");
const DEFAULT_TARGET = 300;
const DEFAULT_MODEL = "gpt-5.2-2025-12-11";

const TITLE_STOPWORDS = new Set([
  "and",
  "for",
  "from",
  "how",
  "into",
  "its",
  "of",
  "over",
  "the",
  "their",
  "through",
  "under",
  "versus",
  "with",
  "without"
]);

const HISTORICAL_PILLARS: readonly HistoricalPillar[] = [
  "state_capacity_and_governance",
  "trade_infrastructure_and_commerce",
  "fiscal_systems_and_money",
  "military_logistics_and_war",
  "mobility_information_and_control"
] as const;

const MENTAL_MODEL_PILLARS: readonly MentalModelPillar[] = [
  "decision_making_and_judgment",
  "risk_uncertainty_and_resilience",
  "incentives_power_and_coordination",
  "systems_operations_and_constraints",
  "causality_measurement_and_learning"
] as const;

const publishabilitySchema = z.enum([
  "user_facing_content_topic",
  "internal_operating_concept",
  "needs_reframing_before_publication"
]);

const variantDispositionSchema = z.enum(["sub_angle", "alternate", "future_variant", "merge", "rewrite"]);
const topicTierSchema = z.enum(["tier_1", "tier_2", "tier_3"]);

const variantTitleSchema = z.object({
  title: z.string().trim().min(6).max(100),
  publishability: publishabilitySchema,
  disposition: variantDispositionSchema
});

const coreTopicSchema = z.object({
  canonical_title: z.string().trim().min(6).max(100),
  tier: topicTierSchema,
  publishability: publishabilitySchema,
  variants: z.array(variantTitleSchema).max(6)
});

const curatedPillarSchema = z.object({
  pillar: z.string().trim().min(3).max(80),
  core_topics: z.array(coreTopicSchema).min(1).max(40)
});

const curatedLibrarySchema = z.object({
  category: z.enum(SPEC_POST_CATEGORIES),
  pillars: z.array(curatedPillarSchema).length(5)
});

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      "Usage:",
      "  npm --prefix services/api/functions run titles:curate -- --target-per-category 300",
      "",
      "Options:",
      `  --target-per-category <n> (default: ${DEFAULT_TARGET})`,
      `  --model <name>            (default: ${DEFAULT_MODEL})`,
      `  --out <path>              (default: ${DEFAULT_OUT_DIR})`,
      "  --categories <comma-list> (default: historical_nerd,mental_model_library)"
    ].join("\n")
  );
}

function asPositiveInt(value: string | boolean | undefined, fallback: number): number {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parseCategories(value: string | boolean | undefined): SpecPostCategory[] {
  if (typeof value !== "string" || !value.trim()) {
    return [...SPEC_POST_CATEGORIES];
  }

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item !== "historical_nerd" && item !== "mental_model_library") {
        throw new Error(`Invalid category: ${item}`);
      }
      return item;
    });

  return parsed.length ? parsed : [...SPEC_POST_CATEGORIES];
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function manifestPath(outDir: string): string {
  return path.join(outDir, "manifest.json");
}

function reviewDocPath(outDir: string): string {
  return path.join(outDir, "curated-topic-library-review.md");
}

function categoryFilePath(outDir: string, category: SpecPostCategory): string {
  return path.join(outDir, `${category}.library.json`);
}

function normalizeTitle(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeTitle(value)
    .split(" ")
    .map((token) => {
      if (token.length > 4 && token.endsWith("s")) {
        return token.slice(0, -1);
      }
      return token;
    })
    .filter((token) => token.length >= 3 && !TITLE_STOPWORDS.has(token));
}

function similarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }
  const union = leftTokens.size + rightTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function pillarOrderFor(category: SpecPostCategory): readonly PillarSlug[] {
  return category === "historical_nerd" ? HISTORICAL_PILLARS : MENTAL_MODEL_PILLARS;
}

function pillarLabel(pillar: PillarSlug): string {
  switch (pillar) {
    case "state_capacity_and_governance":
      return "State Capacity and Governance";
    case "trade_infrastructure_and_commerce":
      return "Trade Infrastructure and Commerce";
    case "fiscal_systems_and_money":
      return "Fiscal Systems and Money";
    case "military_logistics_and_war":
      return "Military Logistics and War";
    case "mobility_information_and_control":
      return "Mobility, Information, and Control";
    case "decision_making_and_judgment":
      return "Decision-Making and Judgment";
    case "risk_uncertainty_and_resilience":
      return "Risk, Uncertainty, and Resilience";
    case "incentives_power_and_coordination":
      return "Incentives, Power, and Coordination";
    case "systems_operations_and_constraints":
      return "Systems, Operations, and Constraints";
    case "causality_measurement_and_learning":
      return "Causality, Measurement, and Learning";
  }
}

function tierLabel(tier: TopicTier): string {
  switch (tier) {
    case "tier_1":
      return "Tier 1";
    case "tier_2":
      return "Tier 2";
    case "tier_3":
      return "Tier 3";
  }
}

function publishabilityTag(value: Publishability): string {
  switch (value) {
    case "user_facing_content_topic":
      return "[U]";
    case "internal_operating_concept":
      return "[I]";
    case "needs_reframing_before_publication":
      return "[R]";
  }
}

function publishabilityLabel(value: Publishability): string {
  switch (value) {
    case "user_facing_content_topic":
      return "User-facing content topic";
    case "internal_operating_concept":
      return "Internal operating concept";
    case "needs_reframing_before_publication":
      return "Needs reframing before publication";
  }
}

function categoryLabel(category: SpecPostCategory): string {
  return category === "historical_nerd" ? "Historical Nerd" : "Mental Model Library";
}

function categoryFocusGuide(category: SpecPostCategory): string {
  if (category === "historical_nerd") {
    return [
      "Historical nerd topics should feel like compact explanations of historical causality, turning points, slow builds, institutional shifts, logistical transitions, fiscal changes, military systems, communications, mobility control, or hidden structural changes.",
      "A strong historical topic should obviously support a 6-8 slide post with a hook, setup, mechanism, consequence, and broader pattern.",
      "Prefer concrete historical mechanisms over generic civilizational phrases."
    ].join("\n");
  }

  return [
    "Mental model topics should explain a durable model, judgment tool, or reusable way of thinking that a reader could actually use later.",
    "They should not collapse into generic productivity advice or internal ops jargon unless clearly marked as internal or needing reframing.",
    "A strong mental-model topic should naturally support a sharp explanation with concrete application, tradeoffs, and failure modes."
  ].join("\n");
}

function buildCuratedPrompt(category: SpecPostCategory, targetPerCategory: number): { systemPrompt: string; userPrompt: string } {
  const pillars = pillarOrderFor(category);
  const pillarLines = pillars.map((pillar) => `- ${pillar}: ${pillarLabel(pillar)}`).join("\n");
  const categoryLabelText = category === "historical_nerd" ? "historical nerd" : "mental model library";

  return {
    systemPrompt: [
      `You are curating an Orecce ${categoryLabelText} editorial library.`,
      "This is a curation pass, not a brainstorming pass.",
      "De-duplicate aggressively. Merge near-synonyms under one canonical topic.",
      "Separate core topics from variants. Build a smaller set of canonical topics first, then attach narrower sub-angles, alternates, merges, or future variants.",
      "Mark each topic as one of: user-facing content topic, internal operating concept, or needs reframing before publication.",
      "Standardize abstraction. Canonical topics should feel consistent in granularity and strong enough to become a real multi-slide post.",
      "Shorten titles that sound bureaucratic, memo-like, or dissertation-like.",
      "Tier the list. Tier 1 should contain the strongest, clearest, most reusable ideas. Tier 2 should be good but narrower. Tier 3 should be reserve, merge, or rewrite candidates.",
      "Variants must be meaningfully different sub-angles, not cosmetic renames.",
      "Avoid clickbait, hero-worship, generic self-help language, and empty smart-sounding phrases.",
      "Prefer concise titles. Avoid long subtitle structures unless truly necessary.",
      categoryFocusGuide(category)
    ].join("\n\n"),
    userPrompt: [
      `Return exactly ${targetPerCategory} total titles for ${categoryLabelText}.`,
      "Count total titles as: every canonical title plus every variant title.",
      "Target 70 to 110 canonical topics. The rest should be variants grouped under those canonical topics.",
      "Use these editorial pillars exactly and return them in this order:",
      pillarLines,
      "",
      "Tier guidance:",
      "- Tier 1: strongest public-facing library topics.",
      "- Tier 2: good but narrower or more specialized.",
      "- Tier 3: reserve, merge, rewrite, or strongly internal concepts.",
      "",
      "Publishability guidance:",
      "- user_facing_content_topic: this is already a strong feed object.",
      "- internal_operating_concept: analytically useful but not a strong feed object as-is.",
      "- needs_reframing_before_publication: promising idea, but the title is not ready yet.",
      "",
      "Variant disposition guidance:",
      "- sub_angle: same core topic, different mechanism or case angle.",
      "- alternate: alternate framing worth keeping.",
      "- future_variant: good later follow-up or sequel.",
      "- merge: too narrow on its own and should stay merged under the canonical topic.",
      "- rewrite: the idea is usable but this wording is not ready.",
      "",
      "Keep canonical titles clean, strong, and reviewable. Ask of every title whether it can produce a concrete, readable, idea-dense Orecce post.",
      "Return strict JSON only."
    ].join("\n")
  };
}

function countCoreTopics(library: CuratedCategoryLibrary): number {
  return library.pillars.reduce((sum, pillar) => sum + pillar.core_topics.length, 0);
}

function countVariants(library: CuratedCategoryLibrary): number {
  return library.pillars.reduce(
    (sum, pillar) => sum + pillar.core_topics.reduce((inner, topic) => inner + topic.variants.length, 0),
    0
  );
}

function countTitles(library: CuratedCategoryLibrary): number {
  return countCoreTopics(library) + countVariants(library);
}

function assertNovelTitles(titles: string[], threshold: number, errorPrefix: string): void {
  const normalized = new Map<string, string>();
  for (const title of titles) {
    const normalizedTitle = normalizeTitle(title);
    if (!normalizedTitle) {
      throw new Error(`${errorPrefix}: empty title`);
    }
    const prior = normalized.get(normalizedTitle);
    if (prior) {
      throw new Error(`${errorPrefix}: duplicate title detected: "${title}" vs "${prior}"`);
    }
    normalized.set(normalizedTitle, title);
  }

  for (let index = 0; index < titles.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < titles.length; compareIndex += 1) {
      const score = similarity(titles[index], titles[compareIndex]);
      if (score >= threshold) {
        throw new Error(
          `${errorPrefix}: near-duplicate titles detected (${score.toFixed(2)}): "${titles[index]}" vs "${titles[compareIndex]}"`
        );
      }
    }
  }
}

function validatePillarSet(category: SpecPostCategory, library: CuratedCategoryLibrary): void {
  const expected = [...pillarOrderFor(category)];
  const received = library.pillars.map((pillar) => pillar.pillar);
  if (expected.length !== received.length || expected.some((pillar, index) => pillar !== received[index])) {
    throw new Error(`Expected pillar order ${expected.join(", ")} but received ${received.join(", ")}`);
  }
}

export function finalizeCuratedLibrary(
  category: SpecPostCategory,
  raw: unknown,
  targetPerCategory: number
): CuratedCategoryLibrary {
  const parsed = curatedLibrarySchema.parse(raw);
  if (parsed.category !== category) {
    throw new Error(`Expected category ${category} but received ${parsed.category}`);
  }

  const library: CuratedCategoryLibrary = {
    category: parsed.category,
    pillars: parsed.pillars.map((pillar) => ({
      pillar: pillar.pillar as PillarSlug,
      core_topics: pillar.core_topics.map((topic) => ({
        canonical_title: topic.canonical_title.trim(),
        tier: topic.tier,
        publishability: topic.publishability,
        variants: topic.variants.map((variant) => ({
          title: variant.title.trim(),
          publishability: variant.publishability,
          disposition: variant.disposition
        }))
      }))
    }))
  };

  validatePillarSet(category, library);

  const coreTopics = library.pillars.flatMap((pillar) => pillar.core_topics);
  const canonicalTitles = coreTopics.map((topic) => topic.canonical_title);
  const variantTitles = coreTopics.flatMap((topic) => topic.variants.map((variant) => variant.title));

  const coreTopicCount = canonicalTitles.length;
  const minCoreTopics = targetPerCategory >= 100 ? Math.max(40, Math.floor(targetPerCategory * 0.2)) : 1;
  const maxCoreTopics =
    targetPerCategory >= 100 ? Math.max(minCoreTopics, Math.floor(targetPerCategory * 0.4)) : targetPerCategory;
  if (coreTopicCount < minCoreTopics || coreTopicCount > maxCoreTopics) {
    throw new Error(
      `Expected ${minCoreTopics}-${maxCoreTopics} canonical topics for target ${targetPerCategory}, received ${coreTopicCount}`
    );
  }

  if (countTitles(library) !== targetPerCategory) {
    throw new Error(`Expected exactly ${targetPerCategory} total titles, received ${countTitles(library)}`);
  }

  assertNovelTitles(canonicalTitles, 0.68, "Canonical title validation");
  assertNovelTitles([...canonicalTitles, ...variantTitles], 0.92, "All-title validation");

  for (const topic of coreTopics) {
    for (const variant of topic.variants) {
      if (similarity(topic.canonical_title, variant.title) >= 0.86) {
        throw new Error(
          `Variant too close to canonical topic: "${variant.title}" vs "${topic.canonical_title}"`
        );
      }
    }
  }

  return library;
}

function loadLibrary(outDir: string, category: SpecPostCategory): CuratedCategoryLibrary | null {
  const filePath = categoryFilePath(outDir, category);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as CuratedCategoryLibrary;
}

function statusCounts(library: CuratedCategoryLibrary): Record<Publishability, number> {
  const counts: Record<Publishability, number> = {
    user_facing_content_topic: 0,
    internal_operating_concept: 0,
    needs_reframing_before_publication: 0
  };

  for (const pillar of library.pillars) {
    for (const topic of pillar.core_topics) {
      counts[topic.publishability] += 1;
      for (const variant of topic.variants) {
        counts[variant.publishability] += 1;
      }
    }
  }

  return counts;
}

export function renderCuratedLibraryReviewDoc(libraries: Record<SpecPostCategory, CuratedCategoryLibrary>): string {
  const lines: string[] = [
    "# Curated Topic Library Review",
    "",
    "Legend: [U] User-facing content topic, [I] Internal operating concept, [R] Needs reframing before publication.",
    ""
  ];

  for (const category of SPEC_POST_CATEGORIES) {
    const library = libraries[category];
    const counts = statusCounts(library);
    lines.push(`## ${categoryLabel(category)}`);
    lines.push("");
    lines.push(`- Total titles: ${countTitles(library)}`);
    lines.push(`- Core topics: ${countCoreTopics(library)}`);
    lines.push(`- Variants: ${countVariants(library)}`);
    lines.push(
      `- Status mix: ${counts.user_facing_content_topic} user-facing, ${counts.internal_operating_concept} internal, ${counts.needs_reframing_before_publication} needs reframing`
    );
    lines.push("");

    for (const pillarSlug of pillarOrderFor(category)) {
      const pillar = library.pillars.find((item) => item.pillar === pillarSlug);
      if (!pillar) {
        continue;
      }
      lines.push(`### ${pillarLabel(pillarSlug)}`);
      lines.push("");
      for (const tier of ["tier_1", "tier_2", "tier_3"] as const) {
        const topics = pillar.core_topics.filter((topic) => topic.tier === tier);
        if (!topics.length) {
          continue;
        }
        lines.push(`#### ${tierLabel(tier)}`);
        lines.push("");
        topics.forEach((topic, index) => {
          lines.push(`${index + 1}. ${topic.canonical_title} ${publishabilityTag(topic.publishability)}`);
          if (topic.variants.length) {
            const variants = topic.variants
              .map(
                (variant) =>
                  `${variant.title} ${publishabilityTag(variant.publishability)} (${variant.disposition.replace(/_/g, " ")})`
              )
              .join("; ");
            lines.push(`   Variants: ${variants}`);
          }
        });
        lines.push("");
      }
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function saveState(
  outDir: string,
  libraries: Record<SpecPostCategory, CuratedCategoryLibrary>,
  model: string,
  targetPerCategory: number
): void {
  ensureDir(outDir);

  for (const category of SPEC_POST_CATEGORIES) {
    const library = libraries[category];
    if (!library) {
      continue;
    }
    fs.writeFileSync(categoryFilePath(outDir, category), JSON.stringify(library, null, 2));
  }

  const existingManifest = fs.existsSync(manifestPath(outDir))
    ? (JSON.parse(fs.readFileSync(manifestPath(outDir), "utf8")) as CuratedLibraryManifest)
    : null;
  const manifest: CuratedLibraryManifest = {
    generated_at: existingManifest?.generated_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    model,
    config: {
      target_per_category: targetPerCategory,
      out_dir: outDir
    },
    categories: Object.fromEntries(
      SPEC_POST_CATEGORIES.map((category) => {
        const library = libraries[category];
        return [
          category,
          {
            total_titles: library ? countTitles(library) : 0,
            core_topics: library ? countCoreTopics(library) : 0,
            variants: library ? countVariants(library) : 0
          }
        ];
      })
    )
  };

  fs.writeFileSync(manifestPath(outDir), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(reviewDocPath(outDir), renderCuratedLibraryReviewDoc(libraries));
}

async function generateCategoryLibrary(
  gateway: OpenAiGateway,
  category: SpecPostCategory,
  targetPerCategory: number
): Promise<CuratedCategoryLibrary> {
  const prompts = buildCuratedPrompt(category, targetPerCategory);
  const response = await gateway.generateStructuredJson({
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: `${category}_curated_title_library`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["category", "pillars"],
      properties: {
        category: {
          type: "string",
          enum: [category]
        },
        pillars: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["pillar", "core_topics"],
            properties: {
              pillar: {
                type: "string",
                enum: [...pillarOrderFor(category)]
              },
              core_topics: {
                type: "array",
                minItems: 1,
                maxItems: 40,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["canonical_title", "tier", "publishability", "variants"],
                  properties: {
                    canonical_title: {
                      type: "string"
                    },
                    tier: {
                      type: "string",
                      enum: ["tier_1", "tier_2", "tier_3"]
                    },
                    publishability: {
                      type: "string",
                      enum: [
                        "user_facing_content_topic",
                        "internal_operating_concept",
                        "needs_reframing_before_publication"
                      ]
                    },
                    variants: {
                      type: "array",
                      maxItems: 6,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["title", "publishability", "disposition"],
                        properties: {
                          title: {
                            type: "string"
                          },
                          publishability: {
                            type: "string",
                            enum: [
                              "user_facing_content_topic",
                              "internal_operating_concept",
                              "needs_reframing_before_publication"
                            ]
                          },
                          disposition: {
                            type: "string",
                            enum: ["sub_angle", "alternate", "future_variant", "merge", "rewrite"]
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    maxOutputTokens: 28000,
    parser: (data) => finalizeCuratedLibrary(category, data, targetPerCategory),
    correctiveInstruction: [
      `Return exactly ${targetPerCategory} total titles.`,
      "Do not add near-synonym duplicates.",
      "Keep the pillar order exactly as requested.",
      "Stay within the canonical-topic count range."
    ].join(" "),
    reasoningEffort: "medium",
    logLabel: {
      mode: `curated_titles:${category}`,
      profile: category,
      length: "library",
      recentTitlesCount: 0
    }
  });

  return response;
}

async function main(): Promise<void> {
  loadDotEnv();

  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const targetPerCategory = asPositiveInt(args["target-per-category"], DEFAULT_TARGET);
  const outDir = typeof args.out === "string" ? path.resolve(args.out) : DEFAULT_OUT_DIR;
  const categories = parseCategories(args.categories);
  const model = typeof args.model === "string" && args.model.trim() ? args.model.trim() : DEFAULT_MODEL;

  process.env.OPENAI_MODEL = model;
  ensureDir(outDir);

  const libraries = Object.fromEntries(
    SPEC_POST_CATEGORIES.map((category) => [category, loadLibrary(outDir, category) ?? {
      category,
      pillars: []
    }])
  ) as Record<SpecPostCategory, CuratedCategoryLibrary>;

  const gateway = new OpenAiGateway();

  for (const category of categories) {
    console.log(`[${category}] generating curated title library with one model response...`);
    libraries[category] = await generateCategoryLibrary(gateway, category, targetPerCategory);
    console.log(
      `[${category}] complete: ${countTitles(libraries[category])} titles across ${countCoreTopics(libraries[category])} core topics`
    );
    saveState(outDir, libraries, model, targetPerCategory);
  }

  saveState(outDir, libraries, model, targetPerCategory);
  console.log(`Curated library review doc written to ${reviewDocPath(outDir)}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
