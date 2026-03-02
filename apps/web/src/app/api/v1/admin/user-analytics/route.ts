import { NextRequest } from "next/server";
import { ApiError } from "@orecce/api-core/src/types/errors";
import { getDeps } from "@/app/api/init";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { assertAdminIdentity } from "@/lib/adminAccess";

interface AnalyticsDailyUserFactRow {
    event_date: string;
    platform: string;
    actor_id: string;
    total_events: number | string | null;
    session_count: number | string | null;
    post_reads: number | string | null;
    saves: number | string | null;
    upvotes: number | string | null;
    follows: number | string | null;
    feedback_submissions: number | string | null;
}

interface AnalyticsFunnelFactRow {
    event_date: string;
    platform: string;
    landing_viewers: number | string | null;
    signup_starters: number | string | null;
    signup_completers: number | string | null;
    login_completers: number | string | null;
    feed_viewers: number | string | null;
    engaged_feed_users: number | string | null;
    activated_users: number | string | null;
}

function parseWindowDays(raw: string | null, fallback: number): number {
    if (!raw) {
        return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 90) {
        throw new ApiError(400, "bad_request", "Analytics window must be between 1 and 90 days.");
    }
    return parsed;
}

function startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function subtractUtcDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() - days);
    return next;
}

function toNumber(value: number | string | null | undefined): number {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

function dateKey(value: string): string {
    return value.slice(0, 10);
}

export const GET = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    assertAdminIdentity(identity);

    const url = new URL(req.url);
    const windowDays = parseWindowDays(url.searchParams.get("days"), 30);
    const trendDays = parseWindowDays(url.searchParams.get("trend_days"), 14);

    const today = startOfUtcDay(new Date());
    const windowStart = subtractUtcDays(today, windowDays - 1).toISOString();
    const trendStart = subtractUtcDays(today, trendDays - 1).toISOString();

    const { supabase } = getDeps();

    const [userFactsResult, funnelFactsResult] = await Promise.all([
        supabase
            .from("analytics_daily_user_facts")
            .select(
                "event_date, platform, actor_id, total_events, session_count, post_reads, saves, upvotes, follows, feedback_submissions",
            )
            .gte("event_date", windowStart)
            .order("event_date", { ascending: false }),
        supabase
            .from("analytics_funnel_facts")
            .select(
                "event_date, platform, landing_viewers, signup_starters, signup_completers, login_completers, feed_viewers, engaged_feed_users, activated_users",
            )
            .gte("event_date", trendStart)
            .order("event_date", { ascending: true }),
    ]);

    if (userFactsResult.error) {
        throw new ApiError(
            500,
            "admin_analytics_query_failed",
            "Could not load user analytics facts.",
            userFactsResult.error.message,
        );
    }

    if (funnelFactsResult.error) {
        throw new ApiError(
            500,
            "admin_funnel_query_failed",
            "Could not load funnel analytics facts.",
            funnelFactsResult.error.message,
        );
    }

    const userFacts = (userFactsResult.data ?? []) as AnalyticsDailyUserFactRow[];
    const funnelFacts = (funnelFactsResult.data ?? []) as AnalyticsFunnelFactRow[];

    const trackedActors = new Set<string>();
    const platformMap = new Map<string, { totalEvents: number; totalSessions: number; trackedActors: Set<string> }>();
    const actorMap = new Map<
        string,
        {
            actorId: string;
            totalEvents: number;
            totalSessions: number;
            postReads: number;
            saves: number;
            upvotes: number;
            follows: number;
            feedbackSubmissions: number;
        }
    >();

    const summary = {
        trackedActors: 0,
        totalEvents: 0,
        totalSessions: 0,
        postReads: 0,
        saves: 0,
        upvotes: 0,
        follows: 0,
        feedbackSubmissions: 0,
    };

    for (const row of userFacts) {
        const actorId = row.actor_id || "unknown";
        const totalEvents = toNumber(row.total_events);
        const totalSessions = toNumber(row.session_count);
        const postReads = toNumber(row.post_reads);
        const saves = toNumber(row.saves);
        const upvotes = toNumber(row.upvotes);
        const follows = toNumber(row.follows);
        const feedbackSubmissions = toNumber(row.feedback_submissions);

        trackedActors.add(actorId);
        summary.totalEvents += totalEvents;
        summary.totalSessions += totalSessions;
        summary.postReads += postReads;
        summary.saves += saves;
        summary.upvotes += upvotes;
        summary.follows += follows;
        summary.feedbackSubmissions += feedbackSubmissions;

        const platformEntry =
            platformMap.get(row.platform) ??
            {
                totalEvents: 0,
                totalSessions: 0,
                trackedActors: new Set<string>(),
            };
        platformEntry.totalEvents += totalEvents;
        platformEntry.totalSessions += totalSessions;
        platformEntry.trackedActors.add(actorId);
        platformMap.set(row.platform, platformEntry);

        const actorEntry =
            actorMap.get(actorId) ??
            {
                actorId,
                totalEvents: 0,
                totalSessions: 0,
                postReads: 0,
                saves: 0,
                upvotes: 0,
                follows: 0,
                feedbackSubmissions: 0,
            };
        actorEntry.totalEvents += totalEvents;
        actorEntry.totalSessions += totalSessions;
        actorEntry.postReads += postReads;
        actorEntry.saves += saves;
        actorEntry.upvotes += upvotes;
        actorEntry.follows += follows;
        actorEntry.feedbackSubmissions += feedbackSubmissions;
        actorMap.set(actorId, actorEntry);
    }

    summary.trackedActors = trackedActors.size;

    const platformBreakdown = [...platformMap.entries()]
        .map(([platform, value]) => ({
            platform,
            totalEvents: value.totalEvents,
            totalSessions: value.totalSessions,
            trackedActors: value.trackedActors.size,
        }))
        .sort((left, right) => right.totalEvents - left.totalEvents);

    const funnelMap = new Map<
        string,
        {
            date: string;
            landingViewers: number;
            signupStarters: number;
            signupCompleters: number;
            loginCompleters: number;
            feedViewers: number;
            engagedFeedUsers: number;
            activatedUsers: number;
        }
    >();

    for (const row of funnelFacts) {
        const key = dateKey(row.event_date);
        const entry =
            funnelMap.get(key) ??
            {
                date: key,
                landingViewers: 0,
                signupStarters: 0,
                signupCompleters: 0,
                loginCompleters: 0,
                feedViewers: 0,
                engagedFeedUsers: 0,
                activatedUsers: 0,
            };
        entry.landingViewers += toNumber(row.landing_viewers);
        entry.signupStarters += toNumber(row.signup_starters);
        entry.signupCompleters += toNumber(row.signup_completers);
        entry.loginCompleters += toNumber(row.login_completers);
        entry.feedViewers += toNumber(row.feed_viewers);
        entry.engagedFeedUsers += toNumber(row.engaged_feed_users);
        entry.activatedUsers += toNumber(row.activated_users);
        funnelMap.set(key, entry);
    }

    const funnelTrend = [...funnelMap.values()].sort((left, right) =>
        left.date.localeCompare(right.date),
    );

    const topActors = [...actorMap.values()]
        .sort((left, right) => {
            if (right.totalEvents !== left.totalEvents) {
                return right.totalEvents - left.totalEvents;
            }
            return right.postReads - left.postReads;
        })
        .slice(0, 12);

    return ok({
        generatedAt: new Date().toISOString(),
        windowDays,
        trendDays,
        summary,
        platformBreakdown,
        funnelTrend,
        topActors,
    });
});
