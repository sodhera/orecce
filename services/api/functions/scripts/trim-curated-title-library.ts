import fs from "node:fs";
import path from "node:path";
import { SPEC_POST_CATEGORIES, SpecPostCategory } from "@orecce/api-core/src/recces/specGeneration";
import { renderCuratedLibraryReviewDoc } from "./generate-curated-title-library";

type TopicTier = "tier_1" | "tier_2" | "tier_3";

interface VariantTitle {
  title: string;
  publishability: string;
  disposition: string;
}

interface CoreTopic {
  canonical_title: string;
  tier: TopicTier;
  publishability: string;
  variants: VariantTitle[];
}

interface CuratedPillar {
  pillar: string;
  core_topics: CoreTopic[];
}

interface CuratedCategoryLibrary {
  category: SpecPostCategory;
  pillars: CuratedPillar[];
}

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

type Args = Record<string, string | boolean>;

const DEFAULT_OUT_DIR = path.resolve(__dirname, "../../docs/generated-posts/curated-title-libraries");

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

function parseTiers(value: string | boolean | undefined): Set<TopicTier> {
  const raw = typeof value === "string" && value.trim() ? value : "tier_1";
  const tiers = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item !== "tier_1" && item !== "tier_2" && item !== "tier_3") {
        throw new Error(`Invalid tier: ${item}`);
      }
      return item;
    });
  return new Set<TopicTier>(tiers);
}

function categoryFilePath(outDir: string, category: SpecPostCategory): string {
  return path.join(outDir, `${category}.library.json`);
}

function manifestPath(outDir: string): string {
  return path.join(outDir, "manifest.json");
}

function reviewDocPath(outDir: string): string {
  return path.join(outDir, "curated-topic-library-review.md");
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

function readLibrary(outDir: string, category: SpecPostCategory): CuratedCategoryLibrary {
  return JSON.parse(fs.readFileSync(categoryFilePath(outDir, category), "utf8")) as CuratedCategoryLibrary;
}

function filterLibrary(library: CuratedCategoryLibrary, allowedTiers: Set<TopicTier>): CuratedCategoryLibrary {
  return {
    category: library.category,
    pillars: library.pillars.map((pillar) => ({
      pillar: pillar.pillar,
      core_topics: pillar.core_topics.filter((topic) => allowedTiers.has(topic.tier))
    }))
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const outDir = typeof args.out === "string" ? path.resolve(args.out) : DEFAULT_OUT_DIR;
  const allowedTiers = parseTiers(args.tiers);

  const libraries = Object.fromEntries(
    SPEC_POST_CATEGORIES.map((category) => [category, filterLibrary(readLibrary(outDir, category), allowedTiers)])
  ) as Record<SpecPostCategory, CuratedCategoryLibrary>;

  for (const category of SPEC_POST_CATEGORIES) {
    fs.writeFileSync(categoryFilePath(outDir, category), JSON.stringify(libraries[category], null, 2));
  }

  const existingManifest = JSON.parse(fs.readFileSync(manifestPath(outDir), "utf8")) as CuratedLibraryManifest;
  const manifest: CuratedLibraryManifest = {
    ...existingManifest,
    updated_at: new Date().toISOString(),
    categories: Object.fromEntries(
      SPEC_POST_CATEGORIES.map((category) => [
        category,
        {
          total_titles: countTitles(libraries[category]),
          core_topics: countCoreTopics(libraries[category]),
          variants: countVariants(libraries[category])
        }
      ])
    )
  };

  fs.writeFileSync(manifestPath(outDir), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    reviewDocPath(outDir),
    renderCuratedLibraryReviewDoc(libraries as unknown as Parameters<typeof renderCuratedLibraryReviewDoc>[0])
  );
  console.log(`Trimmed curated libraries to tiers: ${[...allowedTiers].join(", ")}.`);
}

main();
