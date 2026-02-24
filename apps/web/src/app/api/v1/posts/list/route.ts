import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { listPostsRequestSchema } from "@api/validation/requestValidation";
import { normalizeProfileKey } from "@api/utils/text";
import { ApiError } from "@api/types/errors";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    const body = await req.json();
    const parsed = listPostsRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid list request.", parsed.error.flatten());
    }
    const { repository } = getDeps();
    const result = await repository.listPosts({
        userId: identity.uid,
        mode: parsed.data.mode,
        profileRaw: parsed.data.profile,
        profileKey: normalizeProfileKey(parsed.data.profile),
        pageSize: parsed.data.page_size,
        cursor: parsed.data.cursor
    });
    return ok(result);
});
