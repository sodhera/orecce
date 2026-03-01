import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { enforceWebRequestRateLimit } from "@/app/api/rateLimit";
import { recommendReccesRequestSchema } from "@orecce/api-core/src/validation/requestValidation";
import { ApiError } from "@orecce/api-core/src/types/errors";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    enforceWebRequestRateLimit({
        scope: "recces_recommendations",
        actorId: identity.uid,
        windowMs: 60_000,
        maxRequests: 90,
        code: "recommendation_rate_limited",
        message: "Recommendation refresh is temporarily capped. Please try again shortly.",
    });
    const body = await req.json();
    const parsed = recommendReccesRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid recommendation request.", parsed.error.flatten());
    }
    const { reccesRecommendationService } = getDeps();
    const recommendations = await reccesRecommendationService.recommend({
        userId: identity.uid,
        authorId: parsed.data.author_id,
        limit: parsed.data.limit,
        seedPostId: parsed.data.seed_post_id,
        recentPostIds: parsed.data.recent_post_ids,
        excludePostIds: parsed.data.exclude_post_ids
    });
    return ok(recommendations);
});
