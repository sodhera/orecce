import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";

export const GET = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    const { repository } = getDeps();
    const preferences = await repository.getPromptPreferences(identity.uid);
    return ok(preferences);
});
