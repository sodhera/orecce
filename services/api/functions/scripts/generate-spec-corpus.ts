import fs from "node:fs";
import path from "node:path";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import {
  SPEC_POST_CATEGORIES,
  SpecCarouselPost,
  SpecPostCategory,
  SpecPostTemplate,
  SpecTopicBrief,
  describeBriefMatch,
  describePostMatch,
  findClosestBriefMatch,
  findClosestPostMatch,
  isBriefNovel,
  isPostNovel,
  parseSpecCarouselPost,
  parseSpecTopicBatch,
  toReccesDbPost
} from "@orecce/api-core/src/recces/specGeneration";
import { getOpenAiModel } from "@orecce/api-core/src/config/runtimeConfig";
import { loadDotEnv } from "./loadDotEnv";

type Args = Record<string, string | boolean>;

interface CategoryState {
  briefs: SpecTopicBrief[];
  posts: SpecCarouselPost[];
}

interface Manifest {
  generated_at: string;
  updated_at: string;
  model: string;
  config: {
    target_per_category: number;
    seed_batch_size: number;
    max_attempts_per_post: number;
    shard_size: number;
    author_id: string;
  };
  categories: Record<string, { briefs: number; posts: number }>;
}

const DEFAULT_OUT_DIR = path.resolve(__dirname, "../../docs/generated-posts/corpus");
const DEFAULT_AUTHOR_ID = "orecce_spec_library";
const DEFAULT_TARGET = 1000;
const DEFAULT_SEED_BATCH_SIZE = 12;
const DEFAULT_MAX_ATTEMPTS_PER_POST = 4;
const DEFAULT_SHARD_SIZE = 100;

const TEMPLATES_BY_CATEGORY: Record<SpecPostCategory, SpecPostTemplate[]> = {
  historical_nerd: ["historical_turning_point", "historical_slow_build"],
  mental_model_library: ["model_breakdown", "model_in_action"]
};

const FOCUS_BUCKETS: Record<SpecPostCategory, string[]> = {
  historical_nerd: [
    "ancient mediterranean",
    "late antiquity",
    "medieval trade and state formation",
    "steppe empires and frontiers",
    "islamic world and exchange networks",
    "maritime empires",
    "gunpowder states",
    "financial revolutions",
    "industrialization",
    "imperial administration",
    "infrastructure and logistics",
    "twentieth-century state capacity"
  ],
  mental_model_library: [
    "incentives and principal-agent problems",
    "probability and uncertainty",
    "systems and bottlenecks",
    "strategy and competition",
    "organizations and management",
    "learning and feedback",
    "measurement and decision quality",
    "markets and coordination",
    "technology and adoption",
    "psychology and judgment",
    "communication and trust",
    "risk and resilience"
  ]
};

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
      "  npm --prefix services/api/functions run corpus:generate -- --target-per-category 1000",
      "",
      "Options:",
      `  --target-per-category <n>   (default: ${DEFAULT_TARGET})`,
      `  --seed-batch-size <n>       (default: ${DEFAULT_SEED_BATCH_SIZE})`,
      `  --max-attempts-per-post <n> (default: ${DEFAULT_MAX_ATTEMPTS_PER_POST})`,
      `  --shard-size <n>            (default: ${DEFAULT_SHARD_SIZE})`,
      `  --author-id <id>            (default: ${DEFAULT_AUTHOR_ID})`,
      `  --out <path>                (default: ${DEFAULT_OUT_DIR})`,
      "  --categories <comma-list>   (default: historical_nerd,mental_model_library)"
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

function ndjsonPath(outDir: string, category: SpecPostCategory, suffix: "briefs" | "posts"): string {
  return path.join(outDir, `${category}.${suffix}.ndjson`);
}

function manifestPath(outDir: string): string {
  return path.join(outDir, "manifest.json");
}

function reccesEssayPath(outDir: string): string {
  return path.join(outDir, "recces-essays.json");
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

function loadCategoryState(outDir: string, category: SpecPostCategory): CategoryState {
  return {
    briefs: readNdjson<SpecTopicBrief>(ndjsonPath(outDir, category, "briefs")),
    posts: readNdjson<SpecCarouselPost>(ndjsonPath(outDir, category, "posts"))
  };
}

function pad(value: number): string {
  return String(value).padStart(3, "0");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildEssayDocuments(
  states: Record<SpecPostCategory, CategoryState>,
  shardSize: number
): Array<{
  essayId: string;
  sourceTitle: string;
  posts: Array<{
    theme: string;
    post_type: string;
    slides: Array<{ slide_number: number; type: string; text: string }>;
  }>;
}> {
  const documents: Array<{
    essayId: string;
    sourceTitle: string;
    posts: Array<{
      theme: string;
      post_type: string;
      slides: Array<{ slide_number: number; type: string; text: string }>;
    }>;
  }> = [];
  for (const category of SPEC_POST_CATEGORIES) {
    const posts = states[category].posts;
    for (let index = 0; index < posts.length; index += shardSize) {
      const chunk = posts.slice(index, index + shardSize);
      const shard = Math.floor(index / shardSize) + 1;
      const label = category === "historical_nerd" ? "Historical Nerd" : "Mental Model Library";
      documents.push({
        essayId: `${slugify(category)}-${pad(shard)}`,
        sourceTitle: `Orecce ${label} Corpus Part ${pad(shard)}`,
        posts: chunk.map(toReccesDbPost)
      });
    }
  }
  return documents;
}

function saveCorpus(
  outDir: string,
  states: Record<SpecPostCategory, CategoryState>,
  config: Manifest["config"]
): void {
  ensureDir(outDir);
  for (const category of SPEC_POST_CATEGORIES) {
    writeNdjson(ndjsonPath(outDir, category, "briefs"), states[category].briefs);
    writeNdjson(ndjsonPath(outDir, category, "posts"), states[category].posts);
  }

  const manifest: Manifest = {
    generated_at: fs.existsSync(manifestPath(outDir))
      ? JSON.parse(fs.readFileSync(manifestPath(outDir), "utf8")).generated_at
      : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    model: getOpenAiModel(),
    config,
    categories: Object.fromEntries(
      SPEC_POST_CATEGORIES.map((category) => [
        category,
        {
          briefs: states[category].briefs.length,
          posts: states[category].posts.length
        }
      ])
    )
  };

  fs.writeFileSync(manifestPath(outDir), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    reccesEssayPath(outDir),
    JSON.stringify(
      {
        author_id: config.author_id,
        documents: buildEssayDocuments(states, config.shard_size).map((doc) => ({
          author_id: config.author_id,
          essay_id: doc.essayId,
          source_title: doc.sourceTitle,
          posts: doc.posts
        }))
      },
      null,
      2
    )
  );
}

function templateMixForBatch(
  category: SpecPostCategory,
  posts: SpecCarouselPost[],
  batchSize: number,
  targetPerCategory: number
): SpecPostTemplate[] {
  const templates = TEMPLATES_BY_CATEGORY[category];
  const targetPerTemplate = Math.ceil(targetPerCategory / templates.length);
  const counts = new Map<SpecPostTemplate, number>(
    templates.map((template) => [template, posts.filter((post) => post.template_used === template).length])
  );

  const mix: SpecPostTemplate[] = [];
  for (let index = 0; index < batchSize; index += 1) {
    const nextTemplate = templates
      .slice()
      .sort((left, right) => {
        const leftRemaining = targetPerTemplate - (counts.get(left) ?? 0);
        const rightRemaining = targetPerTemplate - (counts.get(right) ?? 0);
        return rightRemaining - leftRemaining;
      })[0];
    mix.push(nextTemplate);
    counts.set(nextTemplate, (counts.get(nextTemplate) ?? 0) + 1);
  }
  return mix;
}

function focusSuggestions(category: SpecPostCategory, count: number): string[] {
  const buckets = FOCUS_BUCKETS[category];
  const start = count % buckets.length;
  return [0, 1, 2].map((offset) => buckets[(start + offset) % buckets.length]);
}

function recentBriefSummary(briefs: SpecTopicBrief[]): string {
  if (!briefs.length) {
    return "No accepted briefs yet.";
  }
  return briefs
    .slice(-24)
    .map((brief) => `- ${brief.working_title} | ${brief.primary_topic} | ${brief.angle}`)
    .join("\n");
}

function recentPostSummary(posts: SpecCarouselPost[]): string {
  if (!posts.length) {
    return "No accepted posts yet.";
  }
  return posts
    .slice(-20)
    .map((post) => `- ${post.title} | ${post.primary_topic} | ${post.template_used}`)
    .join("\n");
}

const briefBatchJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["briefs"],
  properties: {
    briefs: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "template_used",
          "working_title",
          "primary_topic",
          "subtopics",
          "source_kind",
          "angle",
          "example_anchors"
        ],
        properties: {
          category: { type: "string", enum: [...SPEC_POST_CATEGORIES] },
          template_used: { type: "string", enum: ["historical_turning_point", "historical_slow_build", "model_breakdown", "model_in_action"] },
          working_title: { type: "string" },
          primary_topic: { type: "string" },
          subtopics: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: { type: "string" }
          },
          source_kind: { type: "string", enum: ["history_book", "essay", "article", "research_paper", "notes", "other"] },
          angle: { type: "string" },
          example_anchors: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: { type: "string" }
          }
        }
      }
    }
  }
};

const carouselPostJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "post_type",
    "category",
    "template_used",
    "title",
    "source_kind",
    "primary_topic",
    "subtopics",
    "slides"
  ],
  properties: {
    post_type: { type: "string", enum: ["carousel"] },
    category: { type: "string", enum: [...SPEC_POST_CATEGORIES] },
    template_used: { type: "string", enum: ["historical_turning_point", "historical_slow_build", "model_breakdown", "model_in_action"] },
    title: { type: "string" },
    source_kind: { type: "string", enum: ["history_book", "essay", "article", "research_paper", "notes", "other"] },
    primary_topic: { type: "string" },
    subtopics: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string" }
    },
    slides: {
      type: "array",
      minItems: 5,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slide_number", "role", "text"],
        properties: {
          slide_number: { type: "integer", minimum: 1 },
          role: { type: "string" },
          text: { type: "string" }
        }
      }
    }
  }
};

function buildBriefPrompts(
  category: SpecPostCategory,
  state: CategoryState,
  batchSize: number,
  targetPerCategory: number
): { systemPrompt: string; userPrompt: string } {
  const templateMix = templateMixForBatch(category, state.posts, batchSize, targetPerCategory);
  const focus = focusSuggestions(category, state.posts.length);
  const categoryInstructions =
    category === "historical_nerd"
      ? [
          "Plan historical nerd post briefs.",
          "Prefer turning points, slow builds, hidden shifts, state capacity, logistics, ideology, trade, or institutional change.",
          "Use broad geographic and temporal coverage. Avoid over-clustering around Europe unless the angle is genuinely distinct.",
          "Every brief should carry at least two concrete example anchors such as named cities, people, firms, routes, policies, or incidents."
        ]
      : [
          "Plan mental model library briefs.",
          "Prefer reusable concepts with clear mechanism, misuse, and real-world visibility.",
          "Models may repeat only if the application case is materially different and easy to distinguish.",
          "Every brief should include at least two concrete example anchors from real organizations, systems, industries, or public cases."
        ];

  return {
    systemPrompt: [
      "You are planning a very large Orecce corpus.",
      "Return only topic briefs, not full posts.",
      "The brief list must be materially non-overlapping at the subject-plus-angle level.",
      "Avoid filler topics, vague titles, and generic examples.",
      "Keep subtopics and example anchors short noun phrases, not long sentences.",
      "Keep the angle compact and concrete.",
      ...categoryInstructions,
      `Category for this batch: ${category}.`,
      `Need ${batchSize} new briefs.`,
      `Preferred template mix for this batch: ${templateMix.join(", ")}.`,
      `Current focus suggestions: ${focus.join(", ")}.`
    ].join("\n\n"),
    userPrompt: [
      "Avoid topics too similar to these accepted briefs:",
      recentBriefSummary(state.briefs),
      "",
      "Avoid rendered posts too similar to these accepted titles:",
      recentPostSummary(state.posts),
      "",
      "Return strong briefs that would still feel distinct after 1000 posts in this category."
    ].join("\n")
  };
}

function buildPostPrompts(
  brief: SpecTopicBrief,
  acceptedPosts: SpecCarouselPost[],
  correctiveInstruction?: string
): { systemPrompt: string; userPrompt: string } {
  const categoryInstructions =
    brief.category === "historical_nerd"
      ? [
          "Write a historical nerd Orecce carousel.",
          "Prioritize causality, structure, hidden shifts, and concrete examples where they sharpen the mechanism.",
          "Avoid trivia tone, vague lessons, and generic moralizing."
        ]
      : [
          "Write a mental model library Orecce carousel.",
          "Define the model clearly, explain the mechanism, use real-world examples naturally, show misuse, and end with a durable recognition rule.",
          "Avoid abstraction without application."
        ];

  return {
    systemPrompt: [
      "You are generating one Orecce carousel post from a topic brief.",
      "The output must feel publishable, compressed, and worth reading.",
      "Each slide must add something new.",
      "Examples must be integrated into the reasoning, not dumped as a list.",
      "Keep each slide tight: usually 1-3 sentences, roughly under 70 words.",
      "Use 6-8 slides unless the brief clearly needs 5 or 9.",
      ...categoryInstructions
    ].join("\n\n"),
    userPrompt: [
      "Render a post from this brief:",
      JSON.stringify(brief, null, 2),
      "",
      "Avoid overlap with these recent accepted posts:",
      recentPostSummary(acceptedPosts),
      correctiveInstruction ? `\nCorrective instruction:\n${correctiveInstruction}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  };
}

async function generateBriefBatch(
  gateway: OpenAiGateway,
  category: SpecPostCategory,
  state: CategoryState,
  batchSize: number,
  targetPerCategory: number
): Promise<SpecTopicBrief[]> {
  const prompts = buildBriefPrompts(category, state, batchSize, targetPerCategory);
  const response = await gateway.generateStructuredJson({
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: `${category}_brief_batch`,
    schema: briefBatchJsonSchema,
    maxOutputTokens: 3200,
    parser: (data) => parseSpecTopicBatch(data),
    reasoningEffort: "low",
    logLabel: {
      mode: `spec_briefs:${category}`,
      profile: category,
      length: "batch",
      recentTitlesCount: state.posts.length
    }
  });
  return response.briefs.filter((brief) => brief.category === category);
}

async function generatePostFromBrief(
  gateway: OpenAiGateway,
  brief: SpecTopicBrief,
  acceptedPosts: SpecCarouselPost[],
  correctiveInstruction?: string
): Promise<SpecCarouselPost> {
  const prompts = buildPostPrompts(brief, acceptedPosts, correctiveInstruction);
  return gateway.generateStructuredJson({
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: `${brief.category}_post`,
    schema: carouselPostJsonSchema,
    maxOutputTokens: 2600,
    parser: (data) => parseSpecCarouselPost(data),
    reasoningEffort: "low",
    logLabel: {
      mode: `spec_post:${brief.category}`,
      profile: brief.primary_topic,
      length: "carousel",
      recentTitlesCount: acceptedPosts.length
    }
  });
}

async function fillCategory(
  gateway: OpenAiGateway,
  category: SpecPostCategory,
  state: CategoryState,
  targetPerCategory: number,
  seedBatchSize: number,
  maxAttemptsPerPost: number,
  save: () => void
): Promise<void> {
  while (state.posts.length < targetPerCategory) {
    console.log(`[${category}] ${state.posts.length}/${targetPerCategory} posts accepted. Generating briefs...`);
    const candidateBriefs = await generateBriefBatch(gateway, category, state, seedBatchSize, targetPerCategory);
    let acceptedBriefs = 0;

    for (const brief of candidateBriefs) {
      if (state.posts.length >= targetPerCategory) {
        break;
      }

      const briefMatch = findClosestBriefMatch(brief, state.briefs);
      if (!isBriefNovel(brief, state.briefs)) {
        console.log(`[${category}] skipped brief as duplicate: ${describeBriefMatch(briefMatch)}`);
        continue;
      }

      state.briefs.push(brief);
      acceptedBriefs += 1;

      let correctiveInstruction = "";
      let accepted = false;
      for (let attempt = 1; attempt <= maxAttemptsPerPost; attempt += 1) {
        const post = await generatePostFromBrief(gateway, brief, state.posts, correctiveInstruction);
        const postMatch = findClosestPostMatch(post, state.posts);
        if (isPostNovel(post, state.posts)) {
          state.posts.push(post);
          accepted = true;
          console.log(`[${category}] accepted post ${state.posts.length}/${targetPerCategory}: ${post.title}`);
          save();
          break;
        }

        correctiveInstruction = [
          "Previous draft was too similar to an accepted post.",
          `Closest match: ${describePostMatch(postMatch)}`,
          "Change the angle, examples, structure, and title materially. Keep the same core brief but make the reader experience clearly different."
        ].join("\n");
      }

      if (!accepted) {
        console.log(`[${category}] exhausted retries for brief: ${brief.working_title}`);
      }
    }

    if (acceptedBriefs === 0) {
      console.log(`[${category}] batch produced no novel briefs. Retrying with another batch.`);
    }
    save();
  }
}

async function main(): Promise<void> {
  loadDotEnv();

  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const outDir = typeof args.out === "string" ? path.resolve(args.out) : DEFAULT_OUT_DIR;
  const targetPerCategory = asPositiveInt(args["target-per-category"], DEFAULT_TARGET);
  const seedBatchSize = asPositiveInt(args["seed-batch-size"], DEFAULT_SEED_BATCH_SIZE);
  const maxAttemptsPerPost = asPositiveInt(args["max-attempts-per-post"], DEFAULT_MAX_ATTEMPTS_PER_POST);
  const shardSize = asPositiveInt(args["shard-size"], DEFAULT_SHARD_SIZE);
  const authorId = typeof args["author-id"] === "string" ? args["author-id"] : DEFAULT_AUTHOR_ID;
  const categories = parseCategories(args.categories);

  ensureDir(outDir);

  const gateway = new OpenAiGateway();
  const states = Object.fromEntries(
    SPEC_POST_CATEGORIES.map((category) => [category, loadCategoryState(outDir, category)])
  ) as Record<SpecPostCategory, CategoryState>;

  const save = () =>
    saveCorpus(outDir, states, {
      target_per_category: targetPerCategory,
      seed_batch_size: seedBatchSize,
      max_attempts_per_post: maxAttemptsPerPost,
      shard_size: shardSize,
      author_id: authorId
    });

  save();

  for (const category of categories) {
    await fillCategory(gateway, category, states[category], targetPerCategory, seedBatchSize, maxAttemptsPerPost, save);
  }

  save();
  console.log(`Corpus generation complete. Output written to ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
