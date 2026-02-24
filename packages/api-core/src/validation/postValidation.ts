import { z } from "zod";
import { CONFIDENCE_VALUES, FeedMode, GeneratedPost, PostLength } from "../types/domain";
import { countWords } from "../utils/text";

const generatedPostSchema = z.object({
  title: z.string().trim().min(6).max(100),
  body: z.string().trim().min(40).max(2400),
  post_type: z.string().trim().min(3).max(32),
  tags: z.array(z.string().trim().min(2).max(24)).min(1).max(6),
  confidence: z.enum(CONFIDENCE_VALUES),
  uncertainty_note: z.string().trim().min(4).max(300).nullable()
});

const lengthBounds: Record<PostLength, { min: number; max: number }> = {
  short: { min: 50, max: 110 },
  medium: { min: 120, max: 220 }
};

const speculativePattern = /\b(probably|maybe|might have|could have|perhaps|possibly)\b/i;
// Try to catch transcript-like lines such as "Steve Jobs: ...", while avoiding false positives
// like "Result: ..." or other single-word labels.
const dialogueCuePattern = /(^|\n)\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}):\s+/m;
const directQuoteAttributionPattern =
  /"[^"\n]{8,}"\s*(?:,?\s*)?(?:said|asked|replied|told|emailed|wrote)\b|\b(?:said|asked|replied|told|emailed|wrote)\s*"[^"\n]{8,}"/i;
const blandBiographyOpeningPattern = /^\s*[A-Z][A-Za-z .'-]{1,60}\s+(is|was)\s+widely\s+known\b/i;
const leadHookSignalPattern =
  /\b(\d{4}|\$\d+|\d+%|million|billion|deadline|cliff|crisis|near-miss|pivot|bet|turning point|reversal|tradeoff|constraint|however|but|yet|while|instead)\b/i;
const highStakesOpeningPattern =
  /\b(near[- ]collapse|bankrupt|bankruptcy|cash[- ]crunch|deadline|crisis|hostile|proxy|ousted|fired|lawsuit|regulator|investigation|make-or-break|last-minute|hail mary|all-in|burn rate|cash cliff|survival|bottleneck|pressure|high-stakes|44\s*billion|7\.4\s*billion|2\.6\s*billion|5,?000|\$\d+|\d+\s*(million|billion)|bet)\b/i;
const storyProgressionPattern =
  /\b(because|which forced|forcing|so|then|after|until|yet|but|however|instead|as a result|while|when|which led to|so that)\b/i;
const consequencePattern =
  /\b(it mattered|which changed|as a result|this reset|this reshaped|this rewired|that shift|the consequence|the result|result:|that meant|it meant|which meant|it set up|it set the stage|it opened the door|it locked in)\b/i;
const emotionalStakesPattern =
  /\b(almost|nearly|panic|collapse|survive|survival|shock|crash|scramble|desperate|forced|risk|pressure|lawsuit|deadline|backlash|fallout|humiliation|all-in|last-minute|brutal|threatened)\b/i;
const fillerPhrasePattern =
  /\b(in order to|it is important to note|it should be noted|as previously mentioned|at the end of the day|in terms of|the fact that|for the most part|in many ways)\b/i;
const labeledInsightPattern = /(^|\n)\s*(Lesson|Takeaway):\s+\S+/i;
const biographyConsequenceLinePattern = /(^|\n)\s*(That meant|It meant)\b/i;
// Insight is primarily enforced via prompting; keep validation lightweight to avoid brittle failures.

function firstWords(text: string, limit: number): string {
  return text
    .trim()
    .split(/\s+/)
    .slice(0, limit)
    .join(" ");
}

function sentenceCount(text: string): number {
  return splitSentences(text).length;
}

function averageSentenceWordCount(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return 0;
  }
  const totalWords = sentences.reduce((sum, sentence) => sum + countWords(sentence), 0);
  return totalWords / sentences.length;
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasDuplicateSentence(text: string): boolean {
  const seen = new Set<string>();
  for (const sentence of splitSentences(text)) {
    const normalized = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      return true;
    }
    seen.add(normalized);
  }
  return false;
}

function lastNonEmptyLine(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface ValidationOptions {
  strict?: boolean;
}

export function parseGeneratedPost(data: unknown): GeneratedPost {
  return generatedPostSchema.parse(data);
}

export function validatePostContent(
  post: GeneratedPost,
  mode: FeedMode,
  length: PostLength,
  options?: ValidationOptions
): ValidationResult {
  const errors: string[] = [];
  const strict = options?.strict ?? true;

  const wordCount = countWords(post.body);
  const { min, max } = lengthBounds[length];
  if (wordCount < min || wordCount > max) {
    errors.push(`Body must be ${min}-${max} words. Got ${wordCount}.`);
  }

  if (post.tags.length > 6) {
    errors.push("At most 6 tags allowed.");
  }

  for (const tag of post.tags) {
    if (tag.length > 24) {
      errors.push("Tag values must be <= 24 characters.");
      break;
    }
  }

  if (post.confidence === "low" && !post.uncertainty_note) {
    errors.push("Low confidence output must include uncertainty_note.");
  }

  if (!strict) {
    return {
      ok: errors.length === 0,
      errors
    };
  }

  if (fillerPhrasePattern.test(post.body)) {
    errors.push("Body contains filler phrasing; tighten wording.");
  }

  const sentences = splitSentences(post.body);
  const maxSentenceWords = Math.max(...sentences.map((s) => countWords(s)), 0);
  if (maxSentenceWords > 34) {
    errors.push("Body has overly long sentences; keep lines tighter.");
  }

  if (length === "short" && sentences.length > 7) {
    errors.push("Short posts should use fewer sentences for better word economy.");
  }
  if (length === "medium" && sentences.length > 12) {
    errors.push("Medium posts use too many sentences; tighten the flow.");
  }

  if (hasDuplicateSentence(post.body)) {
    errors.push("Body repeats the same sentence; remove redundancy.");
  }

  if (mode === "BIOGRAPHY") {
    const combined = `${post.title}\n${post.body}`;
    if (speculativePattern.test(combined)) {
      errors.push("Biography output contains speculative wording.");
    }

    const looksLikeDialogue = dialogueCuePattern.test(post.body) || directQuoteAttributionPattern.test(post.body);
    if (looksLikeDialogue) {
      errors.push("Biography output appears to include invented dialogue formatting.");
    }

    const opening = firstWords(post.body, 24);
    const openingWindow = firstWords(post.body, 35);
    const storyWindow = firstWords(post.body, 70);
    const totalSentences = sentenceCount(post.body);
    const averageSentenceWords = averageSentenceWordCount(post.body);
    if (blandBiographyOpeningPattern.test(post.body)) {
      errors.push("Biography opening is too generic.");
    } else if (!leadHookSignalPattern.test(opening)) {
      errors.push("Biography opening needs a stronger hook (year/number/stakes/contrast).");
    } else if (!highStakesOpeningPattern.test(openingWindow)) {
      errors.push("Biography opening needs a sharper high-stakes signal.");
    }

    if (totalSentences < 3) {
      errors.push("Biography post should read like a mini-story (at least 3 sentences).");
    }
    if (!storyProgressionPattern.test(storyWindow)) {
      errors.push("Biography post needs clearer story progression (cause/turn language).");
    }
    if (!consequencePattern.test(post.body)) {
      errors.push("Biography post should include a concrete consequence beat.");
    }
    if (averageSentenceWords > 22) {
      errors.push("Biography writing is too dense; use shorter, clearer sentences.");
    }
    if (!emotionalStakesPattern.test(post.body)) {
      errors.push("Biography post feels too emotionally flat; add real stakes and tension.");
    }

    if (labeledInsightPattern.test(post.body)) {
      errors.push("Biography post should not use 'Lesson:' or 'Takeaway:' labels.");
    }

    const lastLine = lastNonEmptyLine(post.body);
    if (/^(That meant|It meant)\b/i.test(lastLine)) {
      errors.push("Biography post must end with a separate insight line after the consequence.");
    }

    const lastLineWords = countWords(lastLine);
    if (lastLineWords < 6 || lastLineWords > 26) {
      errors.push("Biography ending insight should be 6-26 words.");
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
