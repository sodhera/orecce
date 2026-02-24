import { ListFeedbackResult, Repository } from "../types/contracts";
import { FeedbackType, StoredFeedback } from "../types/domain";
import { ReccesEssayDocument, ReccesRepository } from "../recces/types";
import { buildReccesPostId } from "../recces/postId";
import { normalizeThemeKey, ReccesUserProfileRepository } from "../recces/reccesUserProfileRepository";

const MAX_FEEDBACK_PAGES = 4;
const FEEDBACK_PAGE_SIZE = 50;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "but",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "which",
  "with",
  "you",
  "your"
]);

export interface ReccesRecommendationRequest {
  userId: string;
  authorId: string;
  limit: number;
  seedPostId?: string;
  recentPostIds?: string[];
  excludePostIds?: string[];
}

export interface ReccesRecommendationItem {
  id: string;
  authorId: string;
  essayId: string;
  sourceTitle: string;
  postIndex: number;
  theme: string;
  postType: string;
  slideCount: number;
  previewText: string;
  slides: Array<{
    slideNumber: number;
    type: string;
    text: string;
  }>;
  tags: string[];
  score: number;
  reasons: string[];
}

export interface ReccesRecommendationResult {
  items: ReccesRecommendationItem[];
  meta: {
    authorId: string;
    candidates: number;
    seedsUsed: number;
    feedbackSignalsUsed: number;
    profileSignalsUsed: number;
    profileThemesTracked: number;
  };
}

interface FlattenedPost {
  id: string;
  authorId: string;
  essayId: string;
  sourceTitle: string;
  postIndex: number;
  theme: string;
  postType: string;
  slideCount: number;
  previewText: string;
  slides: Array<{
    slideNumber: number;
    type: string;
    text: string;
  }>;
  fullText: string;
  tokens: Map<string, number>;
  tokenNorm: number;
}

interface ScoredCandidate {
  post: FlattenedPost;
  score: number;
  similarityScore: number;
  reasons: string[];
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return matches.filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function buildTermVector(tokens: string[]): Map<string, number> {
  const vector = new Map<string, number>();
  for (const token of tokens) {
    vector.set(token, (vector.get(token) ?? 0) + 1);
  }
  return vector;
}

function vectorNorm(vector: Map<string, number>): number {
  let sum = 0;
  for (const value of vector.values()) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>, normA: number, normB: number): number {
  if (!normA || !normB) {
    return 0;
  }
  let dot = 0;
  for (const [token, aValue] of a.entries()) {
    const bValue = b.get(token);
    if (!bValue) {
      continue;
    }
    dot += aValue * bValue;
  }
  return dot / (normA * normB);
}

function hashToUnitInterval(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0) / 4294967295;
}

function getTopKeywords(tokens: Map<string, number>, maxCount = 3): string[] {
  return Array.from(tokens.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([token]) => token);
}

function normalizePost(document: ReccesEssayDocument, authorId: string): FlattenedPost[] {
  return document.posts.map((post, postIndex) => {
    const slideText = post.slides.map((slide) => slide.text.trim()).filter(Boolean).join(" ");
    const fullText = `${post.theme}. ${slideText}`.trim();
    const tokens = buildTermVector(tokenize(fullText));
    return {
      id: buildReccesPostId(authorId, document.essayId, postIndex),
      authorId,
      essayId: document.essayId,
      sourceTitle: document.sourceTitle,
      postIndex,
      theme: post.theme,
      postType: post.postType,
      slideCount: post.slides.length,
      previewText: slideText.slice(0, 300),
      slides: post.slides.map((slide) => ({
        slideNumber: slide.slideNumber,
        type: slide.type,
        text: slide.text
      })),
      fullText,
      tokens,
      tokenNorm: vectorNorm(tokens)
    };
  });
}

function mergeFeedbackSignals(
  feedback: StoredFeedback[],
  validPostIds: Set<string>
): { positives: Set<string>; negatives: Set<string>; usedSignals: number } {
  const latestByPost = new Map<string, StoredFeedback>();
  for (const item of feedback) {
    if (!validPostIds.has(item.postId)) {
      continue;
    }
    const current = latestByPost.get(item.postId);
    if (!current || item.createdAtMs > current.createdAtMs) {
      latestByPost.set(item.postId, item);
    }
  }

  const positives = new Set<string>();
  const negatives = new Set<string>();
  for (const row of latestByPost.values()) {
    if (row.type === "upvote") {
      positives.add(row.postId);
      continue;
    }
    if (row.type === "downvote" || row.type === "skip") {
      negatives.add(row.postId);
    }
  }

  return { positives, negatives, usedSignals: latestByPost.size };
}

export class ReccesRecommendationService {
  constructor(
    private readonly reccesRepository: ReccesRepository,
    private readonly repository: Repository,
    private readonly userProfileRepository: ReccesUserProfileRepository
  ) {}

  async recordFeedbackSignal(userId: string, postId: string, feedbackType: FeedbackType): Promise<void> {
    const resolved = await this.reccesRepository.getPostById(postId);
    if (!resolved) {
      return;
    }
    await this.userProfileRepository.updateThemeWeight(userId, resolved.theme, feedbackType);
  }

  async recordSlideInteractionSignal(input: {
    userId: string;
    postId: string;
    slideFlipCount: number;
    maxSlideIndex?: number;
    slideCount?: number;
  }): Promise<void> {
    const resolved = await this.reccesRepository.getPostById(input.postId);
    if (!resolved) {
      return;
    }

    const safeFlips = Math.max(0, Math.min(40, Math.floor(Number(input.slideFlipCount) || 0)));
    if (safeFlips === 0) {
      return;
    }

    const inferredSlideCount = Math.max(1, resolved.slides.length);
    const safeSlideCount = Math.max(
      1,
      Math.min(80, Math.floor(Number(input.slideCount) || inferredSlideCount))
    );
    const safeMaxSlide = Math.max(
      0,
      Math.min(safeSlideCount - 1, Math.floor(Number(input.maxSlideIndex) || 0))
    );

    const depthRatio = Math.min(1, (safeMaxSlide + 1) / safeSlideCount);
    const flipStrength = Math.min(1.8, safeFlips * 0.09);
    const depthStrength = depthRatio * 0.7;
    const delta = Number((flipStrength + depthStrength).toFixed(6));
    if (delta <= 0) {
      return;
    }

    await this.userProfileRepository.applyThemeDelta(input.userId, resolved.theme, delta);
  }

  async recommend(input: ReccesRecommendationRequest): Promise<ReccesRecommendationResult> {
    const authorId = String(input.authorId ?? "").trim() || "paul_graham";
    const limit = Math.max(1, Math.min(30, Math.floor(Number(input.limit) || 10)));
    const documents = await this.reccesRepository.listEssayDocuments(authorId);
    const flattened = documents.flatMap((doc) => normalizePost(doc, authorId));

    if (!flattened.length) {
      return {
        items: [],
        meta: {
          authorId,
          candidates: 0,
          seedsUsed: 0,
          feedbackSignalsUsed: 0,
          profileSignalsUsed: 0,
          profileThemesTracked: 0
        }
      };
    }

    const postById = new Map(flattened.map((post) => [post.id, post] as const));
    const validIds = new Set(postById.keys());
    const [feedback, profile] = await Promise.all([
      this.readRecentFeedback(input.userId),
      this.userProfileRepository.getProfile(input.userId)
    ]);
    const signals = mergeFeedbackSignals(feedback, validIds);

    const excluded = new Set(
      (input.excludePostIds ?? [])
        .map((item) => String(item).trim())
        .filter((item) => validIds.has(item))
    );

    for (const id of signals.negatives) {
      excluded.add(id);
    }

    const seedIds: string[] = [];
    if (input.seedPostId && validIds.has(input.seedPostId)) {
      seedIds.push(input.seedPostId);
    }
    for (const id of input.recentPostIds ?? []) {
      if (validIds.has(id) && !seedIds.includes(id)) {
        seedIds.push(id);
      }
    }
    for (const id of signals.positives) {
      if (!seedIds.includes(id)) {
        seedIds.push(id);
      }
    }

    const seedPosts = seedIds.map((id) => postById.get(id)).filter((post): post is FlattenedPost => Boolean(post));
    for (const seed of seedPosts) {
      excluded.add(seed.id);
    }

    const scored = this.scoreCandidates(
      flattened,
      seedPosts,
      excluded,
      input.userId,
      signals.positives,
      profile.themeWeights
    );
    const selected = this.selectWithDiversity(scored, limit);

    return {
      items: selected.map((item) => ({
        id: item.post.id,
        authorId: item.post.authorId,
        essayId: item.post.essayId,
        sourceTitle: item.post.sourceTitle,
        postIndex: item.post.postIndex,
        theme: item.post.theme,
        postType: item.post.postType,
        slideCount: item.post.slideCount,
        previewText: item.post.previewText,
        slides: item.post.slides,
        tags: getTopKeywords(item.post.tokens, 3),
        score: Number(item.score.toFixed(5)),
        reasons: item.reasons
      })),
      meta: {
        authorId,
        candidates: flattened.length,
        seedsUsed: seedPosts.length,
        feedbackSignalsUsed: signals.usedSignals,
        profileSignalsUsed: profile.signalCount,
        profileThemesTracked: Object.keys(profile.themeWeights).length
      }
    };
  }

  private async readRecentFeedback(userId: string): Promise<StoredFeedback[]> {
    let cursor: string | undefined;
    const items: StoredFeedback[] = [];

    for (let i = 0; i < MAX_FEEDBACK_PAGES; i += 1) {
      const page: ListFeedbackResult = await this.repository.listFeedback({
        userId,
        pageSize: FEEDBACK_PAGE_SIZE,
        cursor
      });
      items.push(...page.items);
      if (!page.nextCursor) {
        break;
      }
      cursor = page.nextCursor;
    }

    return items;
  }

  private scoreCandidates(
    posts: FlattenedPost[],
    seedPosts: FlattenedPost[],
    excluded: Set<string>,
    userId: string,
    likedPostIds: Set<string>,
    profileThemeWeights: Record<string, number>
  ): ScoredCandidate[] {
    const scoreWithoutSeeds = seedPosts.length === 0;
    const likedThemes = new Set(
      seedPosts
        .filter((seed) => likedPostIds.has(seed.id))
        .map((seed) => seed.theme)
    );

    return posts
      .filter((post) => !excluded.has(post.id))
      .map((post) => {
        const randomBoost = hashToUnitInterval(`${userId}:${post.id}`) * 0.04;
        const maxSeedSimilarity = seedPosts.reduce((max, seed) => {
          const similarity = cosineSimilarity(post.tokens, seed.tokens, post.tokenNorm, seed.tokenNorm);
          return similarity > max ? similarity : max;
        }, 0);

        const likedThemeBoost = likedThemes.has(post.theme) ? 0.08 : 0;
        const profileThemeWeight = profileThemeWeights[normalizeThemeKey(post.theme)] ?? 0;
        const profileThemeBoost = Math.max(-0.14, Math.min(0.16, profileThemeWeight * 0.06));
        const baseScore = scoreWithoutSeeds
          ? 0.35 + profileThemeBoost + randomBoost
          : maxSeedSimilarity * 0.88 + likedThemeBoost + profileThemeBoost + randomBoost;

        const reasons: string[] = [];
        if (maxSeedSimilarity >= 0.12) {
          reasons.push("similar_to_recent_reads");
        }
        if (likedThemeBoost > 0) {
          reasons.push("matches_liked_theme");
        }
        if (profileThemeBoost >= 0.03) {
          reasons.push("matches_profile_history");
        } else if (profileThemeBoost <= -0.03) {
          reasons.push("downranks_disliked_theme");
        }
        if (!reasons.length) {
          reasons.push("topic_exploration");
        }

        return {
          post,
          score: baseScore,
          similarityScore: maxSeedSimilarity,
          reasons
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private selectWithDiversity(scored: ScoredCandidate[], limit: number): ScoredCandidate[] {
    const remaining = [...scored];
    const selected: ScoredCandidate[] = [];
    const themeCounts = new Map<string, number>();

    while (remaining.length > 0 && selected.length < limit) {
      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const themeCount = themeCounts.get(candidate.post.theme) ?? 0;
        const diversityPenalty = themeCount * 0.1;
        const adjusted = candidate.score - diversityPenalty;
        if (adjusted > bestScore) {
          bestScore = adjusted;
          bestIndex = index;
        }
      }

      const [chosen] = remaining.splice(bestIndex, 1);
      if ((themeCounts.get(chosen.post.theme) ?? 0) > 0) {
        chosen.reasons = [...chosen.reasons, "theme_diversity_balance"];
      }
      selected.push(chosen);
      themeCounts.set(chosen.post.theme, (themeCounts.get(chosen.post.theme) ?? 0) + 1);
    }

    return selected;
  }
}

export { buildReccesPostId };
