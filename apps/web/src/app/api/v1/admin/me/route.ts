import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { isAdminIdentity } from "@/lib/adminAccess";

export const GET = withErrorHandler(async (req) => {
    const identity = await authenticate(req);
    return ok({
        isAdmin: isAdminIdentity(identity),
    });
});
