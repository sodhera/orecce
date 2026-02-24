import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { listFeedbackRequestSchema } from "@api/validation/requestValidation";
import { ApiError } from "@api/types/errors";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    const body = await req.json();
    const parsed = listFeedbackRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid feedback list request.", parsed.error.flatten());
    }
    const { repository } = getDeps();
    const result = await repository.listFeedback({
        userId: identity.uid,
        postId: parsed.data.post_id,
        pageSize: parsed.data.page_size,
        cursor: parsed.data.cursor
    });
    return ok(result);
});
