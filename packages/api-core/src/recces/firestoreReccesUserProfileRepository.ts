import { Firestore, Timestamp } from "firebase-admin/firestore";
import { FeedbackType } from "../types/domain";
import {
  applyThemeDelta,
  createEmptyReccesUserProfile,
  feedbackDelta,
  ReccesUserProfile,
  ReccesUserProfileRepository
} from "./reccesUserProfileRepository";

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return Date.now();
}

function parseThemeWeights(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const parsed: Record<string, number> = {};
  for (const [key, rawWeight] of Object.entries(value as Record<string, unknown>)) {
    const numeric = Number(rawWeight);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    parsed[key] = numeric;
  }
  return parsed;
}

export class FirestoreReccesUserProfileRepository implements ReccesUserProfileRepository {
  private readonly collection = "userRecommendationProfiles";

  constructor(private readonly db: Firestore) {}

  async getProfile(userId: string): Promise<ReccesUserProfile> {
    const key = String(userId ?? "").trim();
    if (!key) {
      return createEmptyReccesUserProfile("");
    }

    const snap = await this.db.collection(this.collection).doc(key).get();
    if (!snap.exists) {
      return createEmptyReccesUserProfile(key);
    }
    return this.mapProfileDoc(key, snap.data() ?? {});
  }

  async updateThemeWeight(userId: string, theme: string, feedbackType: FeedbackType): Promise<ReccesUserProfile> {
    return this.applyThemeDelta(userId, theme, feedbackDelta(feedbackType));
  }

  async applyThemeDelta(userId: string, theme: string, delta: number): Promise<ReccesUserProfile> {
    const key = String(userId ?? "").trim();
    if (!key) {
      return createEmptyReccesUserProfile("");
    }
    const safeDelta = Number(delta);
    if (!Number.isFinite(safeDelta) || safeDelta === 0) {
      return this.getProfile(key);
    }

    const ref = this.db.collection(this.collection).doc(key);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists
        ? this.mapProfileDoc(key, snap.data() ?? {})
        : createEmptyReccesUserProfile(key);

      const nowMs = Date.now();
      const next: ReccesUserProfile = {
        userId: key,
        themeWeights: applyThemeDelta(current.themeWeights, theme, safeDelta),
        signalCount: current.signalCount + 1,
        updatedAtMs: nowMs
      };

      tx.set(
        ref,
        {
          themeWeights: next.themeWeights,
          signalCount: next.signalCount,
          updatedAt: Timestamp.fromMillis(nowMs)
        },
        { merge: true }
      );

      return next;
    });
  }

  private mapProfileDoc(userId: string, data: Record<string, unknown>): ReccesUserProfile {
    const signalCountRaw = Number(data.signalCount);
    return {
      userId,
      themeWeights: parseThemeWeights(data.themeWeights),
      signalCount: Number.isFinite(signalCountRaw) && signalCountRaw > 0 ? Math.floor(signalCountRaw) : 0,
      updatedAtMs: toMillis(data.updatedAt)
    };
  }
}
