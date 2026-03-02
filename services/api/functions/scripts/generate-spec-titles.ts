import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import { SPEC_POST_CATEGORIES, SpecPostCategory } from "@orecce/api-core/src/recces/specGeneration";
import { loadDotEnv } from "./loadDotEnv";

type Args = Record<string, string | boolean>;

interface TitleManifest {
  generated_at: string;
  updated_at: string;
  model: string;
  config: {
    target_per_category: number;
    batch_size: number;
    out_dir: string;
  };
  categories: Record<string, { titles: number }>;
}

const DEFAULT_OUT_DIR = path.resolve(__dirname, "../../docs/generated-posts/title-lists");
const DEFAULT_TARGET = 200;
const DEFAULT_BATCH_SIZE = 20;
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

const titleBatchSchema = z.object({
  titles: z.array(z.string().trim().min(8).max(160)).min(1).max(25)
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
      "  npm --prefix services/api/functions run titles:generate -- --target-per-category 200",
      "",
      "Options:",
      `  --target-per-category <n> (default: ${DEFAULT_TARGET})`,
      `  --batch-size <n>          (default: ${DEFAULT_BATCH_SIZE})`,
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

export function isNovelTitle(candidate: string, existing: string[]): boolean {
  const normalized = normalizeTitle(candidate);
  if (!normalized) {
    return false;
  }
  for (const existingTitle of existing) {
    const normalizedExisting = normalizeTitle(existingTitle);
    if (!normalizedExisting) {
      continue;
    }
    if (normalized === normalizedExisting) {
      return false;
    }
    if (similarity(candidate, existingTitle) >= 0.7) {
      return false;
    }
  }
  return true;
}

function titleFilePath(outDir: string, category: SpecPostCategory): string {
  return path.join(outDir, `${category}.titles.ndjson`);
}

function manifestPath(outDir: string): string {
  return path.join(outDir, "manifest.json");
}

function reviewDocPath(outDir: string): string {
  return path.join(outDir, "topic-titles-review.md");
}

function readNdjson(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string);
}

function writeNdjson(filePath: string, items: string[]): void {
  const content = items.length ? `${items.map((item) => JSON.stringify(item)).join("\n")}\n` : "";
  fs.writeFileSync(filePath, content);
}

function loadTitles(outDir: string, category: SpecPostCategory): string[] {
  return readNdjson(titleFilePath(outDir, category));
}

export function renderTitleReviewDoc(titleMap: Record<SpecPostCategory, string[]>): string {
  const lines: string[] = [
    "# Topic Titles Review",
    "",
    "Titles only. No metadata.",
    ""
  ];

  for (const category of SPEC_POST_CATEGORIES) {
    const label = category === "historical_nerd" ? "Historical Nerd" : "Mental Model Library";
    lines.push(`## ${label}`);
    lines.push("");
    titleMap[category].forEach((title, index) => {
      lines.push(`${index + 1}. ${title}`);
    });
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function saveState(outDir: string, titlesByCategory: Record<SpecPostCategory, string[]>, model: string, target: number, batchSize: number): void {
  ensureDir(outDir);
  for (const category of SPEC_POST_CATEGORIES) {
    writeNdjson(titleFilePath(outDir, category), titlesByCategory[category]);
  }
  const existingManifest = fs.existsSync(manifestPath(outDir))
    ? (JSON.parse(fs.readFileSync(manifestPath(outDir), "utf8")) as TitleManifest)
    : null;
  const manifest: TitleManifest = {
    generated_at: existingManifest?.generated_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    model,
    config: {
      target_per_category: target,
      batch_size: batchSize,
      out_dir: outDir
    },
    categories: Object.fromEntries(
      SPEC_POST_CATEGORIES.map((category) => [category, { titles: titlesByCategory[category].length }])
    )
  };
  fs.writeFileSync(manifestPath(outDir), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(reviewDocPath(outDir), renderTitleReviewDoc(titlesByCategory));
}

function recentTitlesSummary(titles: string[]): string {
  if (!titles.length) {
    return "No accepted titles yet.";
  }
  return titles.slice(-40).map((title) => `- ${title}`).join("\n");
}

function focusGuide(category: SpecPostCategory): string {
  return category === "historical_nerd"
    ? [
        "Focus on historical causality, hidden shifts, logistics, state capacity, trade routes, institutions, fiscal regimes, military systems, ideology, communications, and infrastructure.",
        "Avoid generic biographies, trivia framing, and modern clickbait phrasing."
      ].join("\n")
    : [
        "Focus on reusable mental models, decision tools, systems heuristics, incentive problems, risk models, organizational dynamics, and judgment frameworks.",
        "Avoid vague self-help phrasing, generic productivity slogans, and inflated motivational tone."
      ].join("\n");
}

async function generateTitleBatch(
  gateway: OpenAiGateway,
  category: SpecPostCategory,
  existingTitles: string[],
  batchSize: number
): Promise<string[]> {
  const response = await gateway.generateStructuredJson({
    systemPrompt: [
      `Generate ${batchSize} distinct Orecce ${category === "historical_nerd" ? "historical" : "mental model"} topic titles.`,
      "Return titles only.",
      "No subtitles, no explanations, no metadata, no numbering.",
      "Keep titles specific, varied, and worth reading.",
      "Prefer concise but concrete titles.",
      focusGuide(category)
    ].join("\n\n"),
    userPrompt: [
      "Avoid overlap with these accepted titles:",
      recentTitlesSummary(existingTitles),
      "",
      "Return only materially different titles."
    ].join("\n"),
    schemaName: `${category}_title_batch`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["titles"],
      properties: {
        titles: {
          type: "array",
          minItems: 1,
          maxItems: 25,
          items: {
            type: "string"
          }
        }
      }
    },
    maxOutputTokens: 1800,
    parser: (data) => titleBatchSchema.parse(data),
    reasoningEffort: "low",
    logLabel: {
      mode: `spec_titles:${category}`,
      profile: category,
      length: "titles",
      recentTitlesCount: existingTitles.length
    }
  });

  return response.titles.map((title) =>
    String(title)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, "\"")
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
      .replace(/\u2026/g, "...")
      .trim()
  );
}

async function fillCategory(
  gateway: OpenAiGateway,
  category: SpecPostCategory,
  titlesByCategory: Record<SpecPostCategory, string[]>,
  target: number,
  batchSize: number,
  save: () => void
): Promise<void> {
  while (titlesByCategory[category].length < target) {
    const remaining = target - titlesByCategory[category].length;
    const requested = Math.min(batchSize, remaining);
    console.log(`[${category}] ${titlesByCategory[category].length}/${target} titles accepted. Generating more...`);
    const batch = await generateTitleBatch(gateway, category, titlesByCategory[category], requested);
    let accepted = 0;
    for (const title of batch) {
      if (!isNovelTitle(title, titlesByCategory[category])) {
        continue;
      }
      titlesByCategory[category].push(title);
      accepted += 1;
      console.log(`[${category}] accepted title ${titlesByCategory[category].length}/${target}: ${title}`);
    }
    save();
    if (accepted === 0) {
      console.log(`[${category}] batch produced no novel titles. Retrying with a fresh batch.`);
    }
  }
}

async function main(): Promise<void> {
  loadDotEnv();

  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const target = asPositiveInt(args["target-per-category"], DEFAULT_TARGET);
  const batchSize = Math.min(25, asPositiveInt(args["batch-size"], DEFAULT_BATCH_SIZE));
  const outDir = typeof args.out === "string" ? path.resolve(args.out) : DEFAULT_OUT_DIR;
  const categories = parseCategories(args.categories);
  const model = typeof args.model === "string" && args.model.trim() ? args.model.trim() : DEFAULT_MODEL;

  process.env.OPENAI_MODEL = model;

  ensureDir(outDir);

  const titlesByCategory = Object.fromEntries(
    SPEC_POST_CATEGORIES.map((category) => [category, loadTitles(outDir, category)])
  ) as Record<SpecPostCategory, string[]>;

  const gateway = new OpenAiGateway();
  const save = () => saveState(outDir, titlesByCategory, model, target, batchSize);
  save();

  for (const category of categories) {
    await fillCategory(gateway, category, titlesByCategory, target, batchSize, save);
  }

  save();
  console.log(`Title generation complete. Review doc written to ${reviewDocPath(outDir)}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
