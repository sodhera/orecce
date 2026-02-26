import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { ApiError } from "@orecce/api-core/src/types/errors";

type ChatRole = "assistant" | "user";

interface ChatMessage {
    role: ChatRole;
    content: string;
}

const MAX_MESSAGES = 120;
const MAX_MESSAGE_CHARS = 1000;

function normalizeMessages(raw: unknown): ChatMessage[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const role = row.role === "assistant" || row.role === "user" ? row.role : null;
            if (!role) return null;

            const content = typeof row.content === "string" ? row.content.trim() : "";
            if (!content) return null;

            return {
                role,
                content: content.slice(0, MAX_MESSAGE_CHARS),
            } satisfies ChatMessage;
        })
        .filter((message): message is ChatMessage => Boolean(message))
        .slice(0, MAX_MESSAGES);
}

function buildStoragePayload(messages: ChatMessage[]): Record<string, unknown> {
    return {
        source: "right_sidebar_curate_chat",
        storedAtMs: Date.now(),
        messages,
    };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);

    const body = await req.json();
    const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const sessionId = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
    const messages = normalizeMessages(payload.messages);

    if (!sessionId) {
        throw new ApiError(400, "bad_request", "session_id is required.");
    }

    if (!messages.length || !messages.some((message) => message.role === "user")) {
        return ok({ storedCount: 0 });
    }

    const { supabase } = getDeps();
    const nowIso = new Date().toISOString();
    const transcriptPayload = buildStoragePayload(messages);

    const { data: updatedRows, error: updateError } = await supabase
        .from("curate_chat_sessions")
        .update({
            transcript: transcriptPayload,
            updated_at: nowIso,
        })
        .eq("user_id", identity.uid)
        .eq("session_id", sessionId)
        .select("id")
        .limit(1);

    if (updateError) {
        throw new ApiError(
            500,
            "curate_chat_flush_failed",
            "Failed to persist curate chat session.",
            updateError.message,
        );
    }

    if ((updatedRows ?? []).length === 0) {
        let { error: insertError } = await supabase.from("curate_chat_sessions").insert({
            user_id: identity.uid,
            session_id: sessionId,
            transcript: transcriptPayload,
            updated_at: nowIso,
        });

        // If the user row is missing, create a minimal app_users row and retry once.
        if (insertError?.code === "23503") {
            const { error: userUpsertError } = await supabase
                .from("app_users")
                .upsert(
                    {
                        id: identity.uid,
                        email: identity.email,
                        display_name: identity.displayName,
                        updated_at: nowIso,
                    },
                    {
                        onConflict: "id",
                        ignoreDuplicates: false,
                    },
                );

            if (!userUpsertError) {
                const retry = await supabase.from("curate_chat_sessions").insert({
                    user_id: identity.uid,
                    session_id: sessionId,
                    transcript: transcriptPayload,
                    updated_at: nowIso,
                });
                insertError = retry.error ?? null;
            }
        }

        if (insertError) {
            throw new ApiError(
                500,
                "curate_chat_flush_failed",
                "Failed to persist curate chat session.",
                insertError.message,
            );
        }
    }

    return ok({ storedCount: messages.length });
});
