import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import { SpecPostCategory } from "@orecce/api-core/src/recces/specGeneration";
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

interface SampleSelection {
  topic: string;
  template: "historical_slow_build" | "model_breakdown";
  note: string;
}

interface SamplePost {
  title: string;
  category: SpecPostCategory;
  template_used: "historical_slow_build" | "model_breakdown";
  based_on_topic: string;
  slides: Array<{
    slide_number: number;
    heading: string;
    body: string;
  }>;
}

const DEFAULT_MODEL = "gpt-5.2-2025-12-11";
const DEFAULT_OUT_DIR = path.resolve(__dirname, "../../docs/generated-posts/curated-title-libraries");
const OUTPUT_FILE = "tier1-post-samples.md";

const sampleSelections: Record<SpecPostCategory, SampleSelection> = {
  historical_nerd: {
    topic: "The Port as a Customs Machine",
    template: "historical_slow_build",
    note:
      "Focus on the argument that ports became systems for inspection, taxation, quarantine, and intelligence, not just landing places for ships."
  },
  mental_model_library: {
    topic: "Expected value thinking",
    template: "model_breakdown",
    note:
      "Make the model concrete with real-world applications, but keep the mechanism and the misuse slide sharp."
  }
};

const slideSchema = z.object({
  slide_number: z.number().int().min(1).max(9),
  heading: z.string().trim().min(2).max(80),
  body: z.string().trim().min(20).max(900)
});

const samplePostSchema = z.object({
  title: z.string().trim().min(8).max(120),
  category: z.enum(["historical_nerd", "mental_model_library"]),
  template_used: z.enum(["historical_slow_build", "model_breakdown"]),
  based_on_topic: z.string().trim().min(6).max(120),
  slides: z.array(slideSchema).min(6).max(8)
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

function libraryFilePath(outDir: string, category: SpecPostCategory): string {
  return path.join(outDir, `${category}.library.json`);
}

function outputPath(outDir: string): string {
  return path.join(outDir, OUTPUT_FILE);
}

function readLibrary(outDir: string, category: SpecPostCategory): CuratedCategoryLibrary {
  return JSON.parse(fs.readFileSync(libraryFilePath(outDir, category), "utf8")) as CuratedCategoryLibrary;
}

function findTopic(library: CuratedCategoryLibrary, canonicalTitle: string): CoreTopic {
  for (const pillar of library.pillars) {
    const found = pillar.core_topics.find((topic) => topic.canonical_title === canonicalTitle && topic.tier === "tier_1");
    if (found) {
      return found;
    }
  }
  throw new Error(`Could not find Tier 1 topic "${canonicalTitle}" in ${library.category}.`);
}

function parsePost(data: unknown): SamplePost {
  const parsed = samplePostSchema.parse(data);
  const slideNumbers = parsed.slides.map((slide) => slide.slide_number);
  const expected = Array.from({ length: parsed.slides.length }, (_, index) => index + 1);
  if (slideNumbers.some((value, index) => value !== expected[index])) {
    throw new Error("Slides must be sequentially numbered starting at 1.");
  }
  return parsed;
}

function buildPrompts(selection: SampleSelection, topic: CoreTopic, category: SpecPostCategory): { systemPrompt: string; userPrompt: string } {
  if (category === "historical_nerd") {
    return {
      systemPrompt: [
        "Write one production-ready Orecce historical nerd carousel.",
        "Use the Historical Slow Build structure.",
        "The post should feel like a compact explanation of a structural shift, not a trivia list or textbook summary.",
        "Prefer causality over chronology. Use names, places, and examples selectively to sharpen the mechanism.",
        "Every slide must earn its place. No filler, no cinematic fluff, no generic moralizing.",
        "Use 7 or 8 slides.",
        "The writing should feel intelligent, concrete, and worth reading."
      ].join("\n\n"),
      userPrompt: [
        `Canonical Tier 1 topic: ${topic.canonical_title}`,
        `Working angle: ${selection.note}`,
        `Useful variants: ${topic.variants.map((variant) => variant.title).join("; ")}`,
        "",
        "Follow this sequence:",
        "1. Starting condition",
        "2. Early innovation or pressure",
        "3. Scaling phase",
        "4. Overextension or fragility",
        "5. Warning signs",
        "6. Breaking point",
        "7. Aftermath",
        "8. Structural lesson",
        "",
        "Use concrete historical examples where they clarify the mechanism. Keep the conclusion restrained."
      ].join("\n")
    };
  }

  return {
    systemPrompt: [
      "Write one production-ready Orecce mental model library carousel.",
      "Use the Core Model Breakdown structure.",
      "Define before you decorate. Mechanism matters more than slogan quality.",
      "Give concrete applications in more than one domain, and include a real misuse slide.",
      "Link to neighboring models only if the relationship clarifies the concept.",
      "Use 7 slides.",
      "The writing should feel compact, portable, and intellectually clean."
    ].join("\n\n"),
    userPrompt: [
      `Canonical Tier 1 topic: ${topic.canonical_title}`,
      `Working angle: ${selection.note}`,
      `Useful variants: ${topic.variants.map((variant) => variant.title).join("; ")}`,
      "",
      "Follow this sequence:",
      "1. Model name and promise",
      "2. Definition",
      "3. Mechanism",
      "4. Where it applies",
      "5. Common misuse",
      "6. Interaction with other models",
      "7. Durable takeaway",
      "",
      "Use real-world examples where they sharpen the model. Avoid abstract filler and generic productivity tone."
    ].join("\n")
  };
}

async function generateSamplePost(
  gateway: OpenAiGateway,
  selection: SampleSelection,
  topic: CoreTopic,
  category: SpecPostCategory
): Promise<SamplePost> {
  const prompts = buildPrompts(selection, topic, category);
  return gateway.generateStructuredJson({
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: `${category}_tier1_sample_post`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "category", "template_used", "based_on_topic", "slides"],
      properties: {
        title: { type: "string" },
        category: { type: "string", enum: [category] },
        template_used: { type: "string", enum: [selection.template] },
        based_on_topic: { type: "string", enum: [topic.canonical_title] },
        slides: {
          type: "array",
          minItems: category === "historical_nerd" ? 7 : 7,
          maxItems: category === "historical_nerd" ? 8 : 7,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["slide_number", "heading", "body"],
            properties: {
              slide_number: { type: "integer" },
              heading: { type: "string" },
              body: { type: "string" }
            }
          }
        }
      }
    },
    maxOutputTokens: 2800,
    parser: (data) => parsePost(data),
    reasoningEffort: "medium",
    logLabel: {
      mode: `tier1_post_sample:${category}`,
      profile: topic.canonical_title,
      length: "carousel",
      recentTitlesCount: 0
    }
  });
}

function renderMarkdown(posts: SamplePost[]): string {
  const lines: string[] = [
    "# Tier 1 Post Samples",
    "",
    `Generated on ${new Date().toISOString().slice(0, 10)} with \`${process.env.OPENAI_MODEL ?? DEFAULT_MODEL}\`.`,
    ""
  ];

  for (const post of posts) {
    const label = post.category === "historical_nerd" ? "Historical Nerd" : "Mental Model Library";
    lines.push(`## ${label}`);
    lines.push("");
    lines.push(`### ${post.title}`);
    lines.push("");
    lines.push(`- Category: \`${post.category}\``);
    lines.push(`- Template: \`${post.template_used}\``);
    lines.push(`- Based on Tier 1 topic: \`${post.based_on_topic}\``);
    lines.push("");
    post.slides.forEach((slide) => {
      lines.push(`${slide.slide_number}. **${slide.heading}**  `);
      lines.push(`${slide.body}`);
    });
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const outDir = typeof args.out === "string" ? path.resolve(args.out) : DEFAULT_OUT_DIR;
  const model = typeof args.model === "string" && args.model.trim() ? args.model.trim() : DEFAULT_MODEL;
  process.env.OPENAI_MODEL = model;

  const gateway = new OpenAiGateway();
  const posts: SamplePost[] = [];

  for (const category of ["historical_nerd", "mental_model_library"] as const) {
    const library = readLibrary(outDir, category);
    const selection = sampleSelections[category];
    const topic = findTopic(library, selection.topic);
    posts.push(await generateSamplePost(gateway, selection, topic, category));
  }

  fs.writeFileSync(outputPath(outDir), renderMarkdown(posts));
  console.log(`Wrote Tier 1 sample posts to ${outputPath(outDir)}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
