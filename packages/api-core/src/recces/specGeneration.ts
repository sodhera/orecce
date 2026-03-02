import { z } from "zod";
import { ReccesPost } from "./types";

export const SPEC_POST_CATEGORIES = ["historical_nerd", "mental_model_library"] as const;
export const SPEC_POST_TEMPLATES = [
  "historical_turning_point",
  "historical_slow_build",
  "model_breakdown",
  "model_in_action"
] as const;
export const SPEC_SOURCE_KINDS = ["history_book", "essay", "article", "research_paper", "notes", "other"] as const;

export type SpecPostCategory = (typeof SPEC_POST_CATEGORIES)[number];
export type SpecPostTemplate = (typeof SPEC_POST_TEMPLATES)[number];
export type SpecSourceKind = (typeof SPEC_SOURCE_KINDS)[number];

export const specTopicBriefSchema = z.object({
  category: z.enum(SPEC_POST_CATEGORIES),
  template_used: z.enum(SPEC_POST_TEMPLATES),
  working_title: z.string().trim().min(8).max(140),
  primary_topic: z.string().trim().min(4).max(160),
  subtopics: z.array(z.string().trim().min(2).max(80)).min(3).max(5),
  source_kind: z.enum(SPEC_SOURCE_KINDS),
  angle: z.string().trim().min(12).max(420),
  example_anchors: z.array(z.string().trim().min(2).max(140)).min(2).max(4)
});

export const specTopicBatchSchema = z.object({
  briefs: z.array(specTopicBriefSchema).min(1).max(20)
});

export const specSlideSchema = z.object({
  slide_number: z.number().int().min(1),
  role: z.string().trim().min(2).max(40),
  text: z.string().trim().min(18).max(520)
});

export const specCarouselPostSchema = z.object({
  post_type: z.literal("carousel"),
  category: z.enum(SPEC_POST_CATEGORIES),
  template_used: z.enum(SPEC_POST_TEMPLATES),
  title: z.string().trim().min(8).max(140),
  source_kind: z.enum(SPEC_SOURCE_KINDS),
  primary_topic: z.string().trim().min(4).max(160),
  subtopics: z.array(z.string().trim().min(2).max(48)).min(3).max(5),
  slides: z.array(specSlideSchema).min(5).max(9)
});

export type SpecTopicBrief = z.infer<typeof specTopicBriefSchema>;
export type SpecTopicBatch = z.infer<typeof specTopicBatchSchema>;
export type SpecCarouselSlide = z.infer<typeof specSlideSchema>;
export type SpecCarouselPost = z.infer<typeof specCarouselPostSchema>;

export interface NoveltyMatch<T> {
  item: T;
  score: number;
  exactTitleMatch: boolean;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "why",
  "with"
]);

function normalizeText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toAsciiPlainText(value: string): string {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function tokenSet(values: string[]): Set<string> {
  return new Set(values.flatMap((value) => tokenize(value)));
}

function bigramSet(values: string[]): Set<string> {
  const result = new Set<string>();
  const tokens = values.flatMap((value) => tokenize(value));
  for (let index = 0; index < tokens.length - 1; index += 1) {
    result.add(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function exactMatch(left: string, right: string): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a) && a === b;
}

function briefFields(brief: SpecTopicBrief): string[] {
  return [
    brief.working_title,
    brief.primary_topic,
    ...brief.subtopics,
    brief.angle,
    ...brief.example_anchors
  ];
}

function postFields(post: SpecCarouselPost): string[] {
  return [
    post.title,
    post.primary_topic,
    ...post.subtopics,
    ...post.slides.map((slide) => slide.text)
  ];
}

function combinedSimilarity(values: string[], otherValues: string[]): number {
  const tokenScore = jaccard(tokenSet(values), tokenSet(otherValues));
  const bigramScore = jaccard(bigramSet(values), bigramSet(otherValues));
  return tokenScore * 0.65 + bigramScore * 0.35;
}

export function parseSpecTopicBatch(data: unknown): SpecTopicBatch {
  const parsed = specTopicBatchSchema.parse(data);
  return {
    briefs: parsed.briefs.map((brief) => ({
      ...brief,
      working_title: toAsciiPlainText(brief.working_title),
      primary_topic: toAsciiPlainText(brief.primary_topic),
      subtopics: brief.subtopics.map((subtopic) => toAsciiPlainText(subtopic)),
      angle: toAsciiPlainText(brief.angle),
      example_anchors: brief.example_anchors.map((anchor) => toAsciiPlainText(anchor))
    }))
  };
}

export function parseSpecCarouselPost(data: unknown): SpecCarouselPost {
  const parsed = specCarouselPostSchema.parse(data);
  return {
    ...parsed,
    title: toAsciiPlainText(parsed.title),
    primary_topic: toAsciiPlainText(parsed.primary_topic),
    subtopics: parsed.subtopics.map((subtopic) => toAsciiPlainText(subtopic)),
    slides: parsed.slides.map((slide, index) => ({
      ...slide,
      role: toAsciiPlainText(slide.role),
      text: toAsciiPlainText(slide.text),
      slide_number: index + 1
    }))
  };
}

export function toReccesPost(post: SpecCarouselPost): ReccesPost {
  return {
    theme: post.title,
    postType: post.post_type,
    slides: post.slides.map((slide) => ({
      slideNumber: slide.slide_number,
      type: slide.role,
      text: slide.text
    }))
  };
}

export function toReccesDbPost(post: SpecCarouselPost): {
  theme: string;
  post_type: string;
  slides: Array<{ slide_number: number; type: string; text: string }>;
} {
  return {
    theme: post.title,
    post_type: post.post_type,
    slides: post.slides.map((slide) => ({
      slide_number: slide.slide_number,
      type: slide.role,
      text: slide.text
    }))
  };
}

export function findClosestBriefMatch(
  candidate: SpecTopicBrief,
  existing: SpecTopicBrief[]
): NoveltyMatch<SpecTopicBrief> | null {
  let best: NoveltyMatch<SpecTopicBrief> | null = null;
  for (const item of existing) {
    const score = combinedSimilarity(briefFields(candidate), briefFields(item));
    const exactTitleMatch = exactMatch(candidate.working_title, item.working_title) ||
      exactMatch(candidate.primary_topic, item.primary_topic);
    if (!best || score > best.score || (exactTitleMatch && !best.exactTitleMatch)) {
      best = { item, score, exactTitleMatch };
    }
  }
  return best;
}

export function findClosestPostMatch(
  candidate: SpecCarouselPost,
  existing: SpecCarouselPost[]
): NoveltyMatch<SpecCarouselPost> | null {
  let best: NoveltyMatch<SpecCarouselPost> | null = null;
  for (const item of existing) {
    const score = combinedSimilarity(postFields(candidate), postFields(item));
    const exactTitleMatch = exactMatch(candidate.title, item.title) ||
      exactMatch(candidate.primary_topic, item.primary_topic);
    if (!best || score > best.score || (exactTitleMatch && !best.exactTitleMatch)) {
      best = { item, score, exactTitleMatch };
    }
  }
  return best;
}

export function isBriefNovel(candidate: SpecTopicBrief, existing: SpecTopicBrief[]): boolean {
  const match = findClosestBriefMatch(candidate, existing);
  if (!match) {
    return true;
  }
  if (match.exactTitleMatch) {
    return false;
  }
  return match.score < 0.72;
}

export function isPostNovel(candidate: SpecCarouselPost, existing: SpecCarouselPost[]): boolean {
  const match = findClosestPostMatch(candidate, existing);
  if (!match) {
    return true;
  }
  if (match.exactTitleMatch) {
    return false;
  }
  return match.score < 0.76;
}

export function describeBriefMatch(match: NoveltyMatch<SpecTopicBrief> | null): string {
  if (!match) {
    return "No prior similar brief found.";
  }
  return `${match.item.working_title} (topic: ${match.item.primary_topic}, score=${match.score.toFixed(2)})`;
}

export function describePostMatch(match: NoveltyMatch<SpecCarouselPost> | null): string {
  if (!match) {
    return "No prior similar post found.";
  }
  return `${match.item.title} (topic: ${match.item.primary_topic}, score=${match.score.toFixed(2)})`;
}
