import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import {
  parseSpecCarouselPost,
  SPEC_POST_CATEGORIES,
  SpecCarouselPost,
  SpecPostCategory,
  SpecPostTemplate
} from "@orecce/api-core/src/recces/specGeneration";
import { loadDotEnv } from "./loadDotEnv";

type Args = Record<string, string | boolean>;

interface VariantTitle {
  title: string;
  publishability: string;
  disposition: string;
}

interface CoreTopic {
  canonical_title: string;
  tier: "tier_1" | "tier_2" | "tier_3";
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

interface StoredTier1Post extends SpecCarouselPost {
  canonical_topic: string;
  pillar: string;
}

interface Manifest {
  generated_at: string;
  updated_at: string;
  model: string;
  config: {
    out_dir: string;
  };
  categories: Record<string, { tier1_topics: number; generated_posts: number }>;
}

const DEFAULT_MODEL = "gpt-5-mini";
const LIBRARY_DIR = path.resolve(__dirname, "../../docs/generated-posts/curated-title-libraries");
const DEFAULT_OUT_DIR = path.resolve(__dirname, "../../docs/generated-posts/tier1-corpus");

const storedPostSchema = z.object({
  post_type: z.literal("carousel"),
  category: z.enum(SPEC_POST_CATEGORIES),
  template_used: z.enum(["historical_turning_point", "historical_slow_build", "model_breakdown", "model_in_action"]),
  title: z.string().trim().min(8).max(140),
  source_kind: z.enum(["history_book", "essay", "article", "research_paper", "notes", "other"]),
  primary_topic: z.string().trim().min(4).max(160),
  subtopics: z.array(z.string().trim().min(2).max(48)).min(3).max(5),
  slides: z
    .array(
      z.object({
        slide_number: z.number().int().min(1),
        role: z.string().trim().min(2).max(40),
        text: z.string().trim().min(18).max(520)
      })
    )
    .min(5)
    .max(9),
  canonical_topic: z.string().trim().min(4).max(160),
  pillar: z.string().trim().min(3).max(120)
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

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function categoryFilePath(outDir: string, category: SpecPostCategory): string {
  return path.join(outDir, `${category}.posts.ndjson`);
}

function reviewDocPath(outDir: string): string {
  return path.join(outDir, "tier1-post-corpus.md");
}

function manifestPath(outDir: string): string {
  return path.join(outDir, "manifest.json");
}

function readLibrary(category: SpecPostCategory): CuratedCategoryLibrary {
  return JSON.parse(fs.readFileSync(path.join(LIBRARY_DIR, `${category}.library.json`), "utf8")) as CuratedCategoryLibrary;
}

function readNdjson<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function writeNdjson<T>(filePath: string, items: T[]): void {
  const content = items.length ? `${items.map((item) => JSON.stringify(item)).join("\n")}\n` : "";
  fs.writeFileSync(filePath, content);
}

function categoryLabel(category: SpecPostCategory): string {
  return category === "historical_nerd" ? "Historical Nerd" : "Mental Model Library";
}

function pillarLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function tier1Topics(library: CuratedCategoryLibrary): Array<{ pillar: string; topic: CoreTopic }> {
  return library.pillars.flatMap((pillar) =>
    pillar.core_topics
      .filter((topic) => topic.tier === "tier_1")
      .map((topic) => ({ pillar: pillar.pillar, topic }))
  );
}

function buildHistoricalPrompt(topic: CoreTopic, pillar: string): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "Write one production-ready Orecce historical nerd carousel.",
      "Choose the better historical template: turning point or slow build.",
      "The post must feel clear, cumulative, and worth reading by slide 2 or 3.",
      "Prefer causality over chronology. Use examples, dates, and named entities where they sharpen the mechanism.",
      "Avoid trivia lists, museum-plaque writing, hero worship, and cinematic filler.",
      "The visible event should point toward the deeper structural shift."
    ].join("\n\n"),
    userPrompt: [
      `Canonical Tier 1 topic: ${topic.canonical_title}`,
      `Editorial pillar: ${pillarLabel(pillar)}`,
      `Helpful variants: ${topic.variants.map((variant) => variant.title).join("; ") || "None"}`,
      "",
      "Generate one real post, not a list of angles.",
      "If the topic fits a decisive rupture, use historical_turning_point.",
      "If the topic fits accumulation and structural drift, use historical_slow_build.",
      "Set primary_topic exactly to the canonical Tier 1 topic."
    ].join("\n")
  };
}

function buildMentalModelPrompt(topic: CoreTopic, pillar: string): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "Write one production-ready Orecce mental model library carousel.",
      "Choose the better mental-model template: model_breakdown or model_in_action.",
      "Define before you decorate. Mechanism matters more than clever phrasing.",
      "Use real-world examples where they sharpen the model and keep the misuse slide real.",
      "Avoid generic productivity language, inflated abstraction, and internal-ops jargon unless it is made portable."
    ].join("\n\n"),
    userPrompt: [
      `Canonical Tier 1 topic: ${topic.canonical_title}`,
      `Editorial pillar: ${pillarLabel(pillar)}`,
      `Helpful variants: ${topic.variants.map((variant) => variant.title).join("; ") || "None"}`,
      "",
      "Generate one real post, not a list of angles.",
      "If the concept is best explained directly, use model_breakdown.",
      "If the concept is best explained through a situation or case, use model_in_action.",
      "Set primary_topic exactly to the canonical Tier 1 topic."
    ].join("\n")
  };
}

function readExistingPosts(outDir: string, category: SpecPostCategory): StoredTier1Post[] {
  return readNdjson<StoredTier1Post>(categoryFilePath(outDir, category)).map((item) => storedPostSchema.parse(item));
}

function renderMarkdown(postsByCategory: Record<SpecPostCategory, StoredTier1Post[]>): string {
  const lines: string[] = [
    "# Tier 1 Post Corpus",
    "",
    `Generated on ${new Date().toISOString().slice(0, 10)} with \`${process.env.OPENAI_MODEL ?? DEFAULT_MODEL}\`.`,
    ""
  ];

  for (const category of SPEC_POST_CATEGORIES) {
    lines.push(`## ${categoryLabel(category)}`);
    lines.push("");
    for (const post of postsByCategory[category]) {
      lines.push(`### ${post.title}`);
      lines.push("");
      lines.push(`- Canonical topic: \`${post.canonical_topic}\``);
      lines.push(`- Pillar: \`${post.pillar}\``);
      lines.push(`- Template: \`${post.template_used}\``);
      lines.push("");
      for (const slide of post.slides) {
        lines.push(`${slide.slide_number}. **${slide.role}**  `);
        lines.push(slide.text);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function saveState(outDir: string, postsByCategory: Record<SpecPostCategory, StoredTier1Post[]>, model: string): void {
  ensureDir(outDir);
  for (const category of SPEC_POST_CATEGORIES) {
    writeNdjson(categoryFilePath(outDir, category), postsByCategory[category]);
  }

  const manifest: Manifest = {
    generated_at: fs.existsSync(manifestPath(outDir))
      ? (JSON.parse(fs.readFileSync(manifestPath(outDir), "utf8")) as Manifest).generated_at
      : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    model,
    config: {
      out_dir: outDir
    },
    categories: Object.fromEntries(
      SPEC_POST_CATEGORIES.map((category) => {
        const library = readLibrary(category);
        return [
          category,
          {
            tier1_topics: tier1Topics(library).length,
            generated_posts: postsByCategory[category].length
          }
        ];
      })
    )
  };

  fs.writeFileSync(manifestPath(outDir), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(reviewDocPath(outDir), renderMarkdown(postsByCategory));
}

function normalizeTopicTitle(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, "\"")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

async function generatePost(
  gateway: OpenAiGateway,
  category: SpecPostCategory,
  pillar: string,
  topic: CoreTopic
): Promise<StoredTier1Post> {
  const prompts = category === "historical_nerd" ? buildHistoricalPrompt(topic, pillar) : buildMentalModelPrompt(topic, pillar);
  const allowedTemplates: SpecPostTemplate[] =
    category === "historical_nerd"
      ? ["historical_turning_point", "historical_slow_build"]
      : ["model_breakdown", "model_in_action"];

  const post = await gateway.generateStructuredJson({
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: `${category}_tier1_post`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["post_type", "category", "template_used", "title", "source_kind", "primary_topic", "subtopics", "slides"],
      properties: {
        post_type: { type: "string", enum: ["carousel"] },
        category: { type: "string", enum: [category] },
        template_used: { type: "string", enum: allowedTemplates },
        title: { type: "string" },
        source_kind: { type: "string", enum: ["history_book", "essay", "article", "research_paper", "notes", "other"] },
        primary_topic: { type: "string", enum: [topic.canonical_title] },
        subtopics: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: { type: "string" }
        },
        slides: {
          type: "array",
          minItems: category === "historical_nerd" ? 7 : 6,
          maxItems: category === "historical_nerd" ? 8 : 7,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["slide_number", "role", "text"],
            properties: {
              slide_number: { type: "integer" },
              role: { type: "string" },
              text: { type: "string" }
            }
          }
        }
      }
    },
    maxOutputTokens: 3200,
    parser: (data) => {
      const parsed = parseSpecCarouselPost(data);
      if (normalizeTopicTitle(parsed.primary_topic) !== normalizeTopicTitle(topic.canonical_title)) {
        throw new Error(`Expected primary_topic ${topic.canonical_title} but received ${parsed.primary_topic}`);
      }
      return {
        ...parsed,
        primary_topic: topic.canonical_title,
        canonical_topic: topic.canonical_title,
        pillar
      };
    },
    correctiveInstruction: `Return one strict JSON object. Set primary_topic exactly to "${topic.canonical_title}".`,
    reasoningEffort: "low",
    logLabel: {
      mode: `tier1_corpus:${category}`,
      profile: topic.canonical_title,
      length: "carousel",
      recentTitlesCount: 0
    }
  });

  return post;
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const outDir = typeof args.out === "string" ? path.resolve(args.out) : DEFAULT_OUT_DIR;
  const model = typeof args.model === "string" && args.model.trim() ? args.model.trim() : DEFAULT_MODEL;
  process.env.OPENAI_MODEL = model;

  const gateway = new OpenAiGateway();
  const postsByCategory = Object.fromEntries(
    SPEC_POST_CATEGORIES.map((category) => [category, readExistingPosts(outDir, category)])
  ) as Record<SpecPostCategory, StoredTier1Post[]>;

  for (const category of SPEC_POST_CATEGORIES) {
    const library = readLibrary(category);
    const existingByTopic = new Map(postsByCategory[category].map((post) => [post.canonical_topic, post]));
    for (const { pillar, topic } of tier1Topics(library)) {
      if (existingByTopic.has(topic.canonical_title)) {
        continue;
      }
      console.log(`[${category}] generating Tier 1 post for "${topic.canonical_title}"`);
      const post = await generatePost(gateway, category, pillar, topic);
      postsByCategory[category].push(post);
      saveState(outDir, postsByCategory, model);
    }
  }

  saveState(outDir, postsByCategory, model);
  console.log(`Wrote Tier 1 post corpus to ${reviewDocPath(outDir)}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
