import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import { SPEC_POST_CATEGORIES, SpecCarouselPost, SpecPostCategory } from "@orecce/api-core/src/recces/specGeneration";
import { loadDotEnv } from "./loadDotEnv";

type Args = Record<string, string | boolean>;

interface StoredTier1Post extends SpecCarouselPost {
  canonical_topic: string;
  pillar: string;
}

interface LiveSlide {
  slide_number?: number;
  type?: string;
  text?: string;
}

interface LivePostRow {
  id: string;
  theme: string | null;
  source_title: string | null;
  slides: LiveSlide[] | null;
}

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_OUT_DIR = path.resolve(__dirname, "../../docs/generated-posts/tier1-corpus");

const AUTHOR_NAMES: Record<SpecPostCategory, string> = {
  historical_nerd: "Orecce Historical Nerd",
  mental_model_library: "Orecce Mental Model Library"
};

const rewriteSchema = z.object({
  title: z.string().trim().min(8).max(100),
  slides: z.array(
    z.object({
      slide_number: z.number().int().min(1),
      text: z.string().trim().min(18).max(420)
    })
  )
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

function categoryFilePath(outDir: string, category: SpecPostCategory): string {
  return path.join(outDir, `${category}.posts.ndjson`);
}

function reviewDocPath(outDir: string): string {
  return path.join(outDir, "tier1-post-corpus.md");
}

function manifestPath(outDir: string): string {
  return path.join(outDir, "manifest.json");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
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

function normalizeAscii(value: string): string {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[×✕]/g, "x")
    .replace(/[→⟶⟹⇒]/g, "->")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .trim();
}

function wordCount(value: string): number {
  return normalizeAscii(value)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function readStoredPosts(outDir: string, category: SpecPostCategory): StoredTier1Post[] {
  return readNdjson<StoredTier1Post>(categoryFilePath(outDir, category)).map((post) => ({
    ...post,
    title: normalizeAscii(post.title),
    primary_topic: normalizeAscii(post.primary_topic),
    canonical_topic: normalizeAscii(post.canonical_topic),
    pillar: normalizeAscii(post.pillar),
    subtopics: post.subtopics.map((subtopic) => normalizeAscii(subtopic)),
    slides: post.slides.map((slide, index) => ({
      slide_number: index + 1,
      role: normalizeAscii(slide.role),
      text: normalizeAscii(slide.text)
    }))
  }));
}

function renderMarkdown(postsByCategory: Record<SpecPostCategory, StoredTier1Post[]>, model: string): string {
  const lines: string[] = [
    "# Tier 1 Post Corpus",
    "",
    `Last tightened on ${new Date().toISOString().slice(0, 10)} with \`${model}\`.`,
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
        lines.push(`${slide.slide_number}. **${slide.role}**`);
        lines.push("");
        lines.push(slide.text);
        lines.push("");
      }
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

async function fetchLivePostsByTopic(
  outDir: string,
  category: SpecPostCategory
): Promise<Map<string, LivePostRow>> {
  loadDotEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const { data: author, error: authorError } = await supabase
    .from("authors")
    .select("id,name")
    .eq("name", AUTHOR_NAMES[category])
    .maybeSingle();
  if (authorError) {
    throw authorError;
  }
  if (!author?.id) {
    throw new Error(`Could not find author row for ${AUTHOR_NAMES[category]}.`);
  }

  const expectedTopics = new Set(readStoredPosts(outDir, category).map((post) => post.primary_topic));
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id,theme,source_title,slides")
    .eq("author_id", String(author.id))
    .order("source_title", { ascending: true });
  if (postsError) {
    throw postsError;
  }

  const rows = (posts ?? []) as LivePostRow[];
  const byTopic = new Map<string, LivePostRow>();
  for (const row of rows) {
    const topic = normalizeAscii(String(row.source_title ?? ""));
    if (!topic || !expectedTopics.has(topic)) {
      continue;
    }
    byTopic.set(topic, row);
  }
  return byTopic;
}

function promptExamples(category: SpecPostCategory): string {
  if (category === "historical_nerd") {
    return [
      "Bad slide:",
      "The Port processed goods, assessed customs, enforced quarantine, verified manifests, and linked merchants to the fiscal machinery of the state.",
      "",
      "Better slide:",
      "**Why ports mattered**",
      "",
      "1. They checked cargo.",
      "2. They priced duties.",
      "3. They turned trade into revenue."
    ].join("\n");
  }

  return [
    "Bad slide:",
    "Colliders are variables caused by two variables on a path, and conditioning on a collider can create a spurious association between its causes.",
    "",
    "Better slide:",
    "**Collider trap**",
    "",
    "- A and B both affect hospitalization",
    "- Filter on hospitalization",
    "- A and B now look falsely linked"
  ].join("\n");
}

function buildRewritePrompts(post: StoredTier1Post): { systemPrompt: string; userPrompt: string } {
  const categorySpecific =
    post.category === "historical_nerd"
      ? [
          "For history slides, prefer one named example, institution, place, or date per slide.",
          "Do not stack multiple eras or cases into one dense paragraph."
        ]
      : [
          "For mental-model slides, define cleanly and use one example at a time.",
          "Do not bury the model inside jargon or edge-case caveats."
        ];

  return {
    systemPrompt: [
      "You are lightly polishing an existing Orecce carousel for a square feed card.",
      "Keep the same meaning, structure, factual claims, and overall voice.",
      "Trim only what feels padded, repetitive, or harder to scan on mobile.",
      "Preserve natural sentence flow. Do not force every slide into bullets or list formatting.",
      "Avoid wall-of-text paragraphs, but also avoid robotic fragment stacks.",
      "Use ASCII only.",
      ...categorySpecific
    ].join("\n\n"),
    userPrompt: [
      `Category: ${post.category}`,
      `Template: ${post.template_used}`,
      `Canonical topic: ${post.canonical_topic}`,
      `Current title: ${post.title}`,
      `Subtopics: ${post.subtopics.join("; ")}`,
      "",
      "Rewrite rules:",
      "- Keep the same number of slides.",
      "- Keep the same slide numbers and roles.",
      "- Keep the current voice unless a sentence is clearly bloated.",
      "- Make the title cleaner if needed, but do not oversimplify it.",
      "- Hook slide: 1 to 2 sentences with some shape, not a clipped slogan.",
      "- Body slides: 1 to 3 sentences, or bullets only when they genuinely improve clarity.",
      "- Closer slide: keep the payoff concise, but let it sound like a human conclusion.",
      "- Each slide should hold one idea only.",
      "- Target roughly 24 to 60 words per slide.",
      "- Trim by about 10 to 20 percent when possible, not by half.",
      "- Prefer cleaner phrasing over artificial line breaks.",
      "",
      "Current slides:",
      ...post.slides.flatMap((slide) => [
        `${slide.slide_number}. [${slide.role}]`,
        slide.text,
        ""
      ]),
      "Formatting example:",
      promptExamples(post.category),
      "",
      "Return JSON with: title, slides[{slide_number, text}]"
    ].join("\n")
  };
}

async function rewritePost(gateway: OpenAiGateway, post: StoredTier1Post): Promise<StoredTier1Post> {
  const prompts = buildRewritePrompts(post);
  const rewritten = await gateway.generateStructuredJson({
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    schemaName: `${post.category}_tightened_carousel`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "slides"],
      properties: {
        title: { type: "string" },
        slides: {
          type: "array",
          minItems: post.slides.length,
          maxItems: post.slides.length,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["slide_number", "text"],
            properties: {
              slide_number: { type: "integer" },
              text: { type: "string" }
            }
          }
        }
      }
    },
    maxOutputTokens: 2200,
    parser: (data) => {
      const parsed = rewriteSchema.parse(data);
      if (parsed.slides.length !== post.slides.length) {
        throw new Error(`Expected ${post.slides.length} slides but received ${parsed.slides.length}`);
      }

      return {
        ...post,
        title: normalizeAscii(parsed.title),
        slides: parsed.slides.map((slide, index) => {
          const expected = post.slides[index];
          if (slide.slide_number !== expected.slide_number) {
            throw new Error(
              `Expected slide_number ${expected.slide_number} but received ${slide.slide_number} for ${post.canonical_topic}`
            );
          }
          if (wordCount(slide.text) > 60) {
            throw new Error(`Slide ${slide.slide_number} is too verbose for ${post.canonical_topic}`);
          }
          return {
            slide_number: expected.slide_number,
            role: expected.role,
            text: normalizeAscii(slide.text)
          };
        })
      };
    },
    correctiveInstruction: `Return one JSON object with the same ${post.slides.length} slides, same roles, shorter title, and shorter markdown-friendly slide text.`,
    reasoningEffort: "low",
    logLabel: {
      mode: `tier1_rewrite:${post.category}`,
      profile: post.canonical_topic,
      length: "carousel",
      recentTitlesCount: 0
    }
  });

  return rewritten;
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const outDir = typeof args.out === "string" ? path.resolve(args.out) : DEFAULT_OUT_DIR;
  const model = typeof args.model === "string" ? args.model : DEFAULT_MODEL;
  process.env.OPENAI_MODEL = model;
  const selectedCategory =
    typeof args.category === "string" && SPEC_POST_CATEGORIES.includes(args.category as SpecPostCategory)
      ? (args.category as SpecPostCategory)
      : null;
  const limit = typeof args.limit === "string" ? Number(args.limit) : null;
  const skipCount = typeof args["skip-count"] === "string" ? Number(args["skip-count"]) : 0;
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid --limit value: ${String(args.limit)}`);
  }
  if (!Number.isFinite(skipCount) || skipCount < 0) {
    throw new Error(`Invalid --skip-count value: ${String(args["skip-count"])}`);
  }

  const gateway = new OpenAiGateway();
  const postsByCategory = Object.fromEntries(
    SPEC_POST_CATEGORIES.map((category) => [category, readStoredPosts(outDir, category)])
  ) as Record<SpecPostCategory, StoredTier1Post[]>;

  let skipped = 0;
  for (const category of SPEC_POST_CATEGORIES) {
    if (selectedCategory && category !== selectedCategory) {
      continue;
    }

    const liveByTopic = await fetchLivePostsByTopic(outDir, category);
    let rewrittenCount = 0;
    for (let index = 0; index < postsByCategory[category].length; index += 1) {
      if (skipped < skipCount) {
        skipped += 1;
        continue;
      }
      if (limit !== null && rewrittenCount >= limit) {
        break;
      }

      const existing = postsByCategory[category][index];
      const live = liveByTopic.get(existing.primary_topic);
      if (!live) {
        throw new Error(`Missing live post for topic ${existing.primary_topic}`);
      }
      const liveSlides = Array.isArray(live.slides) ? live.slides : [];
      if (liveSlides.length !== existing.slides.length) {
        throw new Error(
          `Slide count mismatch for ${existing.primary_topic}: live=${liveSlides.length}, local=${existing.slides.length}`
        );
      }

      const sourcePost: StoredTier1Post = {
        ...existing,
        title: normalizeAscii(String(live.theme ?? existing.title)),
        slides: existing.slides.map((slide, slideIndex) => ({
          ...slide,
          text: normalizeAscii(String(liveSlides[slideIndex]?.text ?? slide.text))
        }))
      };

      console.log(`[${category}] tightening ${sourcePost.canonical_topic}`);
      postsByCategory[category][index] = await rewritePost(gateway, sourcePost);
      rewrittenCount += 1;

      ensureDir(outDir);
      writeNdjson(categoryFilePath(outDir, category), postsByCategory[category]);
      fs.writeFileSync(reviewDocPath(outDir), renderMarkdown(postsByCategory, model));
    }
  }

  const previousManifest = fs.existsSync(manifestPath(outDir))
    ? JSON.parse(fs.readFileSync(manifestPath(outDir), "utf8"))
    : {};
  fs.writeFileSync(
    manifestPath(outDir),
    JSON.stringify(
      {
        ...previousManifest,
        updated_at: new Date().toISOString(),
        rewrite: {
          model,
          source: "live_supabase_posts",
          rewritten_at: new Date().toISOString()
        }
      },
      null,
      2
    )
  );

  fs.writeFileSync(reviewDocPath(outDir), renderMarkdown(postsByCategory, model));
  console.log(`Rewrote Tier 1 post corpus in ${outDir}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
