import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { ApiError } from "@orecce/api-core/src/types/errors";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);

    const body = await req.json();
    const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const sessionId = typeof payload.session_id === "string" ? payload.session_id.trim() : "";

    if (!sessionId) {
        throw new ApiError(400, "bad_request", "session_id is required.");
    }

    const { supabase } = getDeps();
    const marker = JSON.stringify({
        sessionId,
        deletedAtMs: Date.now(),
        source: "right_sidebar_curate_chat",
    });

    const { error } = await supabase.from("user_feedback").insert({
        user_id: identity.uid,
        category: "Curate Chat Deleted",
        message: marker,
    });

    if (error) {
        throw new ApiError(
            500,
            "curate_chat_delete_failed",
            "Failed to mark curate chat as deleted.",
            error.message,
        );
    }

    return ok({ deleted: true });
});
