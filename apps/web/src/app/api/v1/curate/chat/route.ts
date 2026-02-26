import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import {
    getOpenAiApiKey,
    getOpenAiBaseUrl,
    getOpenAiModel,
} from "@orecce/api-core/src/config/runtimeConfig";
import { ApiError } from "@orecce/api-core/src/types/errors";

type ChatRole = "assistant" | "user";

interface ChatMessage {
    role: ChatRole;
    content: string;
}

const MAX_MESSAGES = 14;
const MAX_MESSAGE_CHARS = 700;

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
        .slice(-MAX_MESSAGES);
}

function extractResponseText(payload: unknown): string {
    if (!payload || typeof payload !== "object") {
        return "";
    }

    const record = payload as Record<string, unknown>;

    if (typeof record.output_text === "string" && record.output_text.trim()) {
        return record.output_text.trim();
    }

    if (Array.isArray(record.output)) {
        const joined = record.output
            .flatMap((entry) => {
                if (!entry || typeof entry !== "object") return [];
                const content = (entry as Record<string, unknown>).content;
                if (!Array.isArray(content)) return [];
                return content;
            })
            .map((part) => {
                if (!part || typeof part !== "object") return "";
                const text = (part as Record<string, unknown>).text;
                return typeof text === "string" ? text : "";
            })
            .join("")
            .trim();
        if (joined) return joined;
    }

    if (Array.isArray(record.choices) && record.choices.length > 0) {
        const firstChoice = record.choices[0];
        if (firstChoice && typeof firstChoice === "object") {
            const message = (firstChoice as Record<string, unknown>).message;
            if (message && typeof message === "object") {
                const content = (message as Record<string, unknown>).content;
                if (typeof content === "string") {
                    return content.trim();
                }
                if (Array.isArray(content)) {
                    return content
                        .map((part) => {
                            if (!part || typeof part !== "object") return "";
                            const text = (part as Record<string, unknown>).text;
                            return typeof text === "string" ? text : "";
                        })
                        .join("")
                        .trim();
                }
            }
        }
    }

    return "";
}

function buildSystemPrompt(mode?: string, profile?: string): string {
    const contextBits = [
        mode ? `Current mode: ${mode}.` : null,
        profile ? `Current profile focus: ${profile}.` : null,
    ].filter(Boolean);

    return [
        "You are Orecce Curate Assistant.",
        "You are collecting what users want added, removed, or changed in their feed for Orecce owners.",
        "Talk like a normal human in plain language.",
        "Keep replies concise and natural: usually 1-2 short sentences.",
        "Do not use lists, labels, or jargon.",
        "Keep the conversation open-ended, but do not drag it out.",
        "Ask at most one simple follow-up question when it materially helps clarify the request.",
        "If the user is already clear, acknowledge it briefly and invite anything else they want changed.",
        "Do not mention internal systems, policies, or model behavior.",
        ...contextBits,
    ].join(" ");
}

export const POST = withErrorHandler(async (req: NextRequest) => {
    await authenticate(req);

    const body = await req.json();
    const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const messages = normalizeMessages(payload.messages);

    if (!messages.length || !messages.some((message) => message.role === "user")) {
        throw new ApiError(400, "bad_request", "At least one user message is required.");
    }

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
        throw new ApiError(500, "missing_openai_key", "OpenAI key is missing. Set OPENAI_API_KEY.");
    }

    const model = getOpenAiModel();
    const isGpt5Family = model.toLowerCase().startsWith("gpt-5");

    const upstreamResponse = await fetch(`${getOpenAiBaseUrl()}/responses`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            max_output_tokens: 140,
            ...(isGpt5Family ? { reasoning: { effort: "minimal" } } : { temperature: 0.3 }),
            input: [
                {
                    role: "system",
                    content: buildSystemPrompt(
                        typeof payload.mode === "string" ? payload.mode : undefined,
                        typeof payload.profile === "string" ? payload.profile : undefined,
                    ),
                },
                ...messages.map((message) => ({
                    role: message.role,
                    content: message.content,
                })),
            ],
        }),
        signal: AbortSignal.timeout(20_000),
    });

    if (!upstreamResponse.ok) {
        const upstreamText = await upstreamResponse.text();
        throw new ApiError(
            502,
            "curate_chat_upstream_error",
            "Curate chat generation failed.",
            {
                status: upstreamResponse.status,
                body: upstreamText.slice(0, 1200),
            },
        );
    }

    const responseJson = (await upstreamResponse.json()) as unknown;
    const reply = extractResponseText(responseJson);

    if (!reply) {
        throw new ApiError(
            502,
            "curate_chat_empty_reply",
            "Curate chat generation returned an empty response.",
        );
    }

    return ok({ reply });
});
