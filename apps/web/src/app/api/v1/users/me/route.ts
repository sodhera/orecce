import { NextRequest } from "next/server";
import { authenticate, ensureUserHasPrefills, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { updateUserProfileSchema } from "@api/validation/requestValidation";
import { ApiError } from "@api/types/errors";

export const GET = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    await ensureUserHasPrefills(identity.uid, identity.email);
    const { repository } = getDeps();
    const user = await repository.getOrCreateUser({
        userId: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        photoURL: identity.photoURL
    });
    return ok(user);
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    const body = await req.json();
    const parsed = updateUserProfileSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid user profile payload.", parsed.error.flatten());
    }
    const { repository } = getDeps();
    await repository.getOrCreateUser({
        userId: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        photoURL: identity.photoURL
    });
    const updated = await repository.updateUserProfile(identity.uid, {
        displayName: parsed.data.profile.displayName,
        photoURL: parsed.data.profile.photoURL
    });
    return ok(updated);
});
