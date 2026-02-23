import { FeedbackType } from "../types/domain";

const THEME_WEIGHT_DECAY = 0.985;
const THEME_WEIGHT_MIN_ABS = 0.03;
const THEME_WEIGHT_LIMIT = 6;
const THEME_WEIGHT_MAX_KEYS = 120;

export interface ReccesUserProfile {
  userId: string;
  themeWeights: Record<string, number>;
  signalCount: number;
  updatedAtMs: number;
}

export interface ReccesUserProfileRepository {
  getProfile(userId: string): Promise<ReccesUserProfile>;
  updateThemeWeight(userId: string, theme: string, feedbackType: FeedbackType): Promise<ReccesUserProfile>;
}

export function createEmptyReccesUserProfile(userId: string): ReccesUserProfile {
  return {
    userId,
    themeWeights: {},
    signalCount: 0,
    updatedAtMs: Date.now()
  };
}

export function normalizeThemeKey(theme: string): string {
  const compact = String(theme ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return compact || "untitled";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function feedbackDelta(type: FeedbackType): number {
  if (type === "upvote") {
    return 1;
  }
  if (type === "downvote") {
    return -1;
  }
  return -0.35;
}

function compactThemeWeights(weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights)
    .map(([key, value]) => [key, Number(value)] as const)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => [key, Number(value.toFixed(6))] as const)
    .filter(([, value]) => Math.abs(value) >= THEME_WEIGHT_MIN_ABS)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, THEME_WEIGHT_MAX_KEYS);

  return Object.fromEntries(entries);
}

export function applyThemeFeedback(
  currentWeights: Record<string, number>,
  theme: string,
  feedbackType: FeedbackType
): Record<string, number> {
  const nextWeights: Record<string, number> = {};
  for (const [key, value] of Object.entries(currentWeights)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    nextWeights[key] = clamp(numeric * THEME_WEIGHT_DECAY, -THEME_WEIGHT_LIMIT, THEME_WEIGHT_LIMIT);
  }

  const themeKey = normalizeThemeKey(theme);
  const updated = (nextWeights[themeKey] ?? 0) + feedbackDelta(feedbackType);
  nextWeights[themeKey] = clamp(updated, -THEME_WEIGHT_LIMIT, THEME_WEIGHT_LIMIT);

  return compactThemeWeights(nextWeights);
}

export class InMemoryReccesUserProfileRepository implements ReccesUserProfileRepository {
  private readonly profiles = new Map<string, ReccesUserProfile>();

  async getProfile(userId: string): Promise<ReccesUserProfile> {
    const key = String(userId ?? "").trim();
    if (!key) {
      return createEmptyReccesUserProfile("");
    }
    return this.profiles.get(key) ?? createEmptyReccesUserProfile(key);
  }

  async updateThemeWeight(userId: string, theme: string, feedbackType: FeedbackType): Promise<ReccesUserProfile> {
    const key = String(userId ?? "").trim();
    if (!key) {
      return createEmptyReccesUserProfile("");
    }
    const current = await this.getProfile(key);
    const now = Date.now();
    const next: ReccesUserProfile = {
      userId: key,
      themeWeights: applyThemeFeedback(current.themeWeights, theme, feedbackType),
      signalCount: current.signalCount + 1,
      updatedAtMs: now
    };
    this.profiles.set(key, next);
    return next;
  }
}
