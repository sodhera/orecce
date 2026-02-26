import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";

interface RawTranscriptMessage {
    role: unknown;
    content: unknown;
}

function toMs(value: string | null | undefined): number {
    if (!value) return Date.now();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
}

function parseTranscript(raw: unknown): { role: "assistant" | "user"; content: string }[] {
    let payload = raw;
    if (typeof payload === "string") {
        try {
            payload = JSON.parse(payload) as unknown;
        } catch {
            return [];
        }
    }

    if (!payload || typeof payload !== "object") {
        return [];
    }

    const root = payload as Record<string, unknown>;
    if (!Array.isArray(root.messages)) {
        return [];
    }

    return root.messages
        .map((item) => {
            const row = item as RawTranscriptMessage;
            const role = row?.role === "assistant" || row?.role === "user" ? row.role : null;
            const content = typeof row?.content === "string" ? row.content.trim() : "";
            if (!role || !content) return null;
            return { role, content };
        })
        .filter((message): message is { role: "assistant" | "user"; content: string } => Boolean(message));
}

function previewFor(messages: { role: "assistant" | "user"; content: string }[]): string {
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
        .from("curate_chat_sessions")
        .select("session_id, transcript, created_at, updated_at")
        .eq("user_id", identity.uid)
        .order("updated_at", { ascending: false })
        .limit(limit);

    if (error) {
        throw error;
    }

    const items = (data ?? [])
        .map((row) => {
            const transcript = parseTranscript(row.transcript);
            if (!transcript.length) {
                return null;
            }

            return {
                sessionId: String(row.session_id ?? ""),
                preview: previewFor(transcript),
                createdAtMs: toMs(row.created_at),
                updatedAtMs: toMs(row.updated_at),
                messages: transcript,
            };
        })
        .filter((item): item is {
            sessionId: string;
            preview: string;
            createdAtMs: number;
            updatedAtMs: number;
            messages: { role: "assistant" | "user"; content: string }[];
        } => Boolean(item));

    return ok({ items });
});
