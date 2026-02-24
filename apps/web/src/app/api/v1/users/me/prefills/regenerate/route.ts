import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { regeneratePrefillsRequestSchema } from "@api/validation/requestValidation";
import { ApiError } from "@api/types/errors";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    const body = await req.json();
    const parsed = regeneratePrefillsRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid prefill regeneration request.", parsed.error.flatten());
    }
    const { prefillService, repository, defaultPrefillPostsPerMode } = getDeps();
    const summary = await prefillService.regenerateCommonDatasetAndCopyToUser({
        userId: identity.uid,
        postsPerMode: parsed.data.posts_per_mode ?? defaultPrefillPostsPerMode
    });
    const user = await repository.getOrCreateUser({
        userId: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        photoURL: identity.photoURL
    });
    return ok({ user, summary });
});
