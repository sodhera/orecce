import { SupabaseClient } from "@supabase/supabase-js";
import { FeedbackType } from "../types/domain";
import {
    applyThemeDelta,
    createEmptyReccesUserProfile,
    feedbackDelta,
    ReccesUserProfile,
    ReccesUserProfileRepository
} from "./reccesUserProfileRepository";

function parseThemeWeights(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object") return {};
    const parsed: Record<string, number> = {};
    for (const [key, rawWeight] of Object.entries(value as Record<string, unknown>)) {
        const numeric = Number(rawWeight);
        if (!Number.isFinite(numeric)) continue;
        parsed[key] = numeric;
    }
    return parsed;
}

export class PostgresReccesUserProfileRepository implements ReccesUserProfileRepository {
    constructor(private readonly supabase: SupabaseClient) { }

    async getProfile(userId: string): Promise<ReccesUserProfile> {
        const key = String(userId ?? "").trim();
        if (!key) return createEmptyReccesUserProfile("");

        const { data, error } = await this.supabase
            .from("user_recommendation_profiles")
            .select("*")
            .eq("user_id", key)
            .maybeSingle();

        if (error) throw error;
        if (!data) return createEmptyReccesUserProfile(key);

        return this.mapProfileRow(key, data);
    }

    async updateThemeWeight(
        userId: string,
        theme: string,
        feedbackType: FeedbackType
    ): Promise<ReccesUserProfile> {
        return this.applyThemeDelta(userId, theme, feedbackDelta(feedbackType));
    }

    async applyThemeDelta(
        userId: string,
        theme: string,
        delta: number
    ): Promise<ReccesUserProfile> {
        const key = String(userId ?? "").trim();
        if (!key) return createEmptyReccesUserProfile("");

        const safeDelta = Number(delta);
        if (!Number.isFinite(safeDelta) || safeDelta === 0) {
            return this.getProfile(key);
        }

        const current = await this.getProfile(key);
        const nowMs = Date.now();
        const now = new Date(nowMs).toISOString();

        const next: ReccesUserProfile = {
            userId: key,
            themeWeights: applyThemeDelta(current.themeWeights, theme, safeDelta),
            signalCount: current.signalCount + 1,
            updatedAtMs: nowMs
        };

        await this.supabase.from("user_recommendation_profiles").upsert({
            user_id: key,
            theme_weights: next.themeWeights,
            signal_count: next.signalCount,
            updated_at: now
        });

        return next;
    }

    private mapProfileRow(userId: string, data: Record<string, unknown>): ReccesUserProfile {
        const signalCountRaw = Number(data.signal_count);
        return {
            userId,
            themeWeights: parseThemeWeights(data.theme_weights),
            signalCount: Number.isFinite(signalCountRaw) && signalCountRaw > 0 ? Math.floor(signalCountRaw) : 0,
            updatedAtMs: data.updated_at ? new Date(data.updated_at as string).getTime() : Date.now()
        };
    }
}
