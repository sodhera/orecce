import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { enforceWebRequestRateLimit } from "@/app/api/rateLimit";
import { setPromptPreferencesSchema } from "@orecce/api-core/src/validation/requestValidation";
import { ApiError } from "@orecce/api-core/src/types/errors";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    enforceWebRequestRateLimit({
        scope: "prompt_preferences_set",
        actorId: identity.uid,
        windowMs: 10 * 60_000,
        maxRequests: 30,
        code: "prompt_preferences_rate_limited",
        message: "Prompt preference updates are temporarily capped. Please try again later.",
    });
    const body = await req.json();
    const parsed = setPromptPreferencesSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid prompt preference payload.", parsed.error.flatten());
    }
    const { repository } = getDeps();
    const preferences = await repository.setPromptPreferences(identity.uid, {
        biographyInstructions: parsed.data.biography_instructions,
        nicheInstructions: parsed.data.niche_instructions
    });
    return ok(preferences);
});
