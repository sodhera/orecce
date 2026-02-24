import { NextRequest } from "next/server";
import { authenticate, ensureUserHasPrefills, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { generatePostRequestSchema } from "@api/validation/requestValidation";
import { normalizeProfileKey } from "@api/utils/text";
import { ApiError } from "@api/types/errors";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    const body = await req.json();
    const parsed = generatePostRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid generate request.", parsed.error.flatten());
    }
    await ensureUserHasPrefills(identity.uid, identity.email);
    const { repository } = getDeps();
    const post = await repository.getNextPrefillPost({
        userId: identity.uid,
        mode: parsed.data.mode,
        profile: parsed.data.profile,
        profileKey: normalizeProfileKey(parsed.data.profile),
        length: parsed.data.length
    });
    if (!post) {
        throw new ApiError(404, "no_prefill_posts", "No prefilled posts available for this user/mode.");
    }
    return ok(post);
});
