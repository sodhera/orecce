import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { enforceWebRequestRateLimit } from "@/app/api/rateLimit";
import { feedbackRequestSchema } from "@orecce/api-core/src/validation/requestValidation";
import { ApiError } from "@orecce/api-core/src/types/errors";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    enforceWebRequestRateLimit({
        scope: "post_feedback",
        actorId: identity.uid,
        windowMs: 10 * 60_000,
        maxRequests: 120,
        code: "post_feedback_rate_limited",
        message: "Feedback submissions are temporarily capped. Please try again later.",
    });
    const body = await req.json();
    const parsed = feedbackRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid feedback request.", parsed.error.flatten());
    }
    const { repository, reccesRecommendationService } = getDeps();
    const feedback = await repository.saveFeedback({
        userId: identity.uid,
        postId: parsed.data.post_id,
        type: parsed.data.feedback_type
    });

    if (reccesRecommendationService) {
        try {
            await reccesRecommendationService.recordFeedbackSignal(
                identity.uid,
                parsed.data.post_id,
                parsed.data.feedback_type
            );
        } catch {
            // non-blocking
        }
    }

    return ok(feedback);
});
