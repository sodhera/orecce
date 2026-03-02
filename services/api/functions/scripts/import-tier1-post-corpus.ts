import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { toReccesDbPost, SpecPostCategory } from "@orecce/api-core/src/recces/specGeneration";
import { loadDotEnv } from "./loadDotEnv";

type Args = Record<string, string | boolean>;

interface StoredTier1Post {
  post_type: "carousel";
  category: SpecPostCategory;
  template_used: "historical_turning_point" | "historical_slow_build" | "model_breakdown" | "model_in_action";
  title: string;
  source_kind: "history_book" | "essay" | "article" | "research_paper" | "notes" | "other";
  primary_topic: string;
  subtopics: string[];
  slides: Array<{
    slide_number: number;
    role: string;
    text: string;
  }>;
  canonical_topic: string;
  pillar: string;
}

interface AuthorConfig {
  category: SpecPostCategory;
  authorName: string;
  authorBio: string;
  topicName: string;
  reccesAuthorId: string;
}

const DEFAULT_OUT_DIR = path.resolve(__dirname, "../../docs/generated-posts/tier1-corpus");

const AUTHOR_CONFIGS: Record<SpecPostCategory, AuthorConfig> = {
  historical_nerd: {
    category: "historical_nerd",
    authorName: "Orecce Historical Nerd",
    authorBio: "Tier 1 historical posts from the Orecce library: state capacity, trade, logistics, institutions, and structural change.",
    topicName: "History & Biography",
    reccesAuthorId: "orecce_historical_nerd"
  },
  mental_model_library: {
    category: "mental_model_library",
    authorName: "Orecce Mental Model Library",
    authorBio: "Tier 1 mental models from the Orecce library: reusable judgment tools, decision frameworks, incentives, and systems thinking.",
    topicName: "Decision Making & Mental Models",
    reccesAuthorId: "orecce_mental_model_library"
  }
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

function stableUuid(seed: string): string {
  const hex = crypto.createHash("sha1").update(seed).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join("-");
}

function ndjsonPath(outDir: string, category: SpecPostCategory): string {
  return path.join(outDir, `${category}.posts.ndjson`);
}

function reportPath(outDir: string): string {
  return path.join(outDir, "supabase-import-report.md");
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

function feedSlideType(index: number, total: number): "hook" | "body" | "closer" {
  if (index === 0) {
    return "hook";
  }
  if (index === total - 1) {
    return "closer";
  }
  return "body";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function renderReport(input: {
  importedAt: string;
  categories: Record<SpecPostCategory, { authorName: string; topicName: string; posts: number }>;
}): string {
  const lines = [
    "# Tier 1 Supabase Import Report",
    "",
    `Imported at: ${input.importedAt}`,
    "",
    "## Author Mapping",
    "",
    `- Historical Nerd -> ${input.categories.historical_nerd.authorName} -> ${input.categories.historical_nerd.topicName}`,
    `- Mental Model Library -> ${input.categories.mental_model_library.authorName} -> ${input.categories.mental_model_library.topicName}`,
    "",
    "## Imported Counts",
    "",
    `- Historical Nerd posts: ${input.categories.historical_nerd.posts}`,
    `- Mental Model Library posts: ${input.categories.mental_model_library.posts}`,
    "",
    "## Notes",
    "",
    "- Imported into the live feed `posts` table for app visibility.",
    "- Mirrored into `recces_essays` using dedicated text author ids for the Recces recommendation surface.",
    "- Deterministic ids are used so reruns update the same records instead of duplicating them."
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const outDir = typeof args.out === "string" ? path.resolve(args.out) : DEFAULT_OUT_DIR;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const allPosts = Object.fromEntries(
    (["historical_nerd", "mental_model_library"] as const).map((category) => [
      category,
      readNdjson<StoredTier1Post>(ndjsonPath(outDir, category))
    ])
  ) as Record<SpecPostCategory, StoredTier1Post[]>;

  const { data: topics, error: topicsError } = await supabase.from("topics").select("id,name");
  if (topicsError) {
    throw topicsError;
  }
  const topicByName = new Map((topics ?? []).map((topic) => [String(topic.name), String(topic.id)]));

  const authorIdsByCategory = new Map<SpecPostCategory, string>();
  for (const category of ["historical_nerd", "mental_model_library"] as const) {
    const config = AUTHOR_CONFIGS[category];
    const { data: existingAuthor, error: authorLookupError } = await supabase
      .from("authors")
      .select("id,name")
      .eq("name", config.authorName)
      .maybeSingle();
    if (authorLookupError) {
      throw authorLookupError;
    }

    let authorId = existingAuthor?.id ? String(existingAuthor.id) : null;
    if (!authorId) {
      authorId = stableUuid(`author:${config.authorName}`);
      const { error: insertAuthorError } = await supabase.from("authors").upsert(
        [
          {
            id: authorId,
            name: config.authorName,
            bio: config.authorBio,
            avatar_url: null,
            website_url: null
          }
        ],
        { onConflict: "id" }
      );
      if (insertAuthorError) {
        throw insertAuthorError;
      }
    }
    authorIdsByCategory.set(category, authorId);
  }

  for (const category of ["historical_nerd", "mental_model_library"] as const) {
    const config = AUTHOR_CONFIGS[category];
    const topicId = topicByName.get(config.topicName);
    if (!topicId) {
      throw new Error(`Could not find topic "${config.topicName}" in topics table.`);
    }
    const authorId = authorIdsByCategory.get(category);
    if (!authorId) {
      throw new Error(`Missing author id for ${category}.`);
    }

    const feedRows = allPosts[category].map((post, index) => ({
      id: stableUuid(`feed-post:${category}:${post.canonical_topic}`),
      author_id: authorId,
      post_type: post.post_type,
      theme: post.title,
      source_title: post.primary_topic,
      slides: post.slides.map((slide, slideIndex) => ({
        slide_number: slide.slide_number,
        type: feedSlideType(slideIndex, post.slides.length),
        text: slide.text
      })),
      tags: [category, post.pillar, post.template_used],
      global_popularity_score: Number((1 - index * 0.002).toFixed(3)),
      published_at: new Date().toISOString(),
      source_url: null,
      topics: [config.topicName]
    }));

    const { error: upsertPostsError } = await supabase.from("posts").upsert(feedRows, { onConflict: "id" });
    if (upsertPostsError) {
      throw upsertPostsError;
    }

    const postIds = feedRows.map((row) => row.id);
    const { error: deleteLinksError } = await supabase.from("post_topics").delete().in("post_id", postIds);
    if (deleteLinksError) {
      throw deleteLinksError;
    }
    const { error: insertLinksError } = await supabase
      .from("post_topics")
      .insert(postIds.map((postId) => ({ post_id: postId, topic_id: topicId })));
    if (insertLinksError) {
      throw insertLinksError;
    }

    const reccesRows = allPosts[category].map((post) => ({
      author_id: config.reccesAuthorId,
      essay_id: slugify(`${category}-${post.canonical_topic}`),
      source_title: post.title,
      posts: [toReccesDbPost(post)],
      updated_at: new Date().toISOString()
    }));
    const { error: upsertReccesError } = await supabase
      .from("recces_essays")
      .upsert(reccesRows, { onConflict: "author_id,essay_id" });
    if (upsertReccesError) {
      throw upsertReccesError;
    }
  }

  fs.writeFileSync(
    reportPath(outDir),
    renderReport({
      importedAt: new Date().toISOString(),
      categories: {
        historical_nerd: {
          authorName: AUTHOR_CONFIGS.historical_nerd.authorName,
          topicName: AUTHOR_CONFIGS.historical_nerd.topicName,
          posts: allPosts.historical_nerd.length
        },
        mental_model_library: {
          authorName: AUTHOR_CONFIGS.mental_model_library.authorName,
          topicName: AUTHOR_CONFIGS.mental_model_library.topicName,
          posts: allPosts.mental_model_library.length
        }
      }
    })
  );

  console.log(`Imported Tier 1 corpus into Supabase and wrote ${reportPath(outDir)}`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
