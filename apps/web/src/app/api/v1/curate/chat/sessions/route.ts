import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { ApiError } from "@orecce/api-core/src/types/errors";

type ChatRole = "assistant" | "user";

interface ParsedSessionPayload {
    sessionId: string;
    storedAtMs?: number;
    messages: { role: ChatRole; content: string }[];
}

function toMs(value: string | null | undefined): number {
    if (!value) return Date.now();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
}

function parseSessionPayload(raw: unknown): ParsedSessionPayload | null {
    if (typeof raw !== "string") {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch {
        return null;
    }

    if (!parsed || typeof parsed !== "object") {
        return null;
    }

    const root = parsed as Record<string, unknown>;
    const sessionId = typeof root.sessionId === "string" ? root.sessionId.trim() : "";
    if (!sessionId) {
        return null;
    }

    if (!Array.isArray(root.messages)) {
        return null;
    }

    const messages = root.messages
        .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const role = row.role === "assistant" || row.role === "user" ? row.role : null;
            const content = typeof row.content === "string" ? row.content.trim() : "";
            if (!role || !content) return null;
            return { role, content };
        })
        .filter((message): message is { role: ChatRole; content: string } => Boolean(message));

    if (!messages.length) {
        return null;
    }

    const storedAtMs = typeof root.storedAtMs === "number" && Number.isFinite(root.storedAtMs)
        ? root.storedAtMs
        : undefined;

    return {
        sessionId,
        storedAtMs,
        messages,
    };
}

function previewFor(messages: { role: ChatRole; content: string }[]): string {
    const fromUser = [...messages].reverse().find((message) => message.role === "user");
    const candidate = fromUser?.content ?? messages[messages.length - 1]?.content ?? "Untitled chat";
    return candidate.slice(0, 140);
}

export const GET = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);
    const { supabase } = getDeps();

    const limitRaw = req.nextUrl.searchParams.get("limit");
    const parsedLimit = Number(limitRaw ?? "20");
    const limit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(50, Math.floor(parsedLimit)))
        : 20;

    const { data, error } = await supabase
        .from("user_feedback")
        .select("message, created_at")
        .eq("user_id", identity.uid)
        .eq("category", "Curate Chat")
        .order("created_at", { ascending: false })
        .limit(limit * 4);

    if (error) {
        throw new ApiError(
            500,
            "curate_chat_sessions_list_failed",
            "Failed to load curate chat sessions.",
            error.message,
        );
    }

    const bySession = new Map<string, {
        sessionId: string;
        preview: string;
        createdAtMs: number;
        updatedAtMs: number;
        messages: { role: ChatRole; content: string }[];
    }>();

    for (const row of data ?? []) {
        const parsed = parseSessionPayload(row.message);
        if (!parsed) {
            continue;
        }

        if (bySession.has(parsed.sessionId)) {
            continue;
        }

        const createdAtMs = toMs(row.created_at);
        bySession.set(parsed.sessionId, {
            sessionId: parsed.sessionId,
            preview: previewFor(parsed.messages),
            createdAtMs,
            updatedAtMs: parsed.storedAtMs ?? createdAtMs,
            messages: parsed.messages,
        });

        if (bySession.size >= limit) {
            break;
        }
    }

    return ok({ items: Array.from(bySession.values()) });
});
