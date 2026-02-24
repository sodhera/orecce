import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { reccesInteractionRequestSchema } from "@api/validation/requestValidation";
import { ApiError } from "@api/types/errors";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    const body = await req.json();
    const parsed = reccesInteractionRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid Recces interaction request.", parsed.error.flatten());
    }
    const { reccesRecommendationService } = getDeps();
    await reccesRecommendationService.recordSlideInteractionSignal({
        userId: identity.uid,
        postId: parsed.data.post_id,
        slideFlipCount: parsed.data.slide_flip_count,
        maxSlideIndex: parsed.data.max_slide_index,
        slideCount: parsed.data.slide_count
    });
    return ok({ accepted: true });
});
