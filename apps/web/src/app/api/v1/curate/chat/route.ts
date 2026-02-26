import { NextRequest } from "next/server";
import { authenticate, ok, withErrorHandler } from "@/app/api/middleware";
import {
    getOpenAiApiKey,
    getOpenAiBaseUrl,
} from "@orecce/api-core/src/config/runtimeConfig";
import { ApiError } from "@orecce/api-core/src/types/errors";

type ChatRole = "assistant" | "user";

interface ChatMessage {
    role: ChatRole;
    content: string;
}

interface UpstreamAttemptFailure {
    model: string;
    status: number | null;
    body: string;
}

interface TokenUsageEvent {
    atMs: number;
    tokens: number;
}

interface UserUsageBucket {
    requestTimestampsMs: number[];
    tokenUsage: TokenUsageEvent[];
}

const MAX_MESSAGES = 14;
const MAX_MESSAGE_CHARS = 700;
const MAX_INPUT_TOKENS_PER_REQUEST = 1_600;
const MAX_INPUT_TOKENS_PER_WINDOW = 5_500;
const TOKEN_WINDOW_MS = 5 * 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const REQUEST_WINDOW_MS = 60_000;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const CURATE_CHAT_MODEL = "gpt-5-mini";
const FALLBACK_MODELS = ["gpt-4.1-mini"] as const;
const usageByUser = new Map<string, UserUsageBucket>();

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

function estimateInputTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, message) => {
        const contentTokens = Math.ceil(message.content.length / ESTIMATED_CHARS_PER_TOKEN);
        // Small fixed overhead per chat message for role and serialization.
        return sum + contentTokens + 4;
    }, 0);
}

function pruneUsageBucket(bucket: UserUsageBucket, nowMs: number): UserUsageBucket {
    bucket.requestTimestampsMs = bucket.requestTimestampsMs.filter(
        (timestampMs) => nowMs - timestampMs < REQUEST_WINDOW_MS,
    );
    bucket.tokenUsage = bucket.tokenUsage.filter(
        (event) => nowMs - event.atMs < TOKEN_WINDOW_MS,
    );
    return bucket;
}

function pruneStaleUsageBuckets(nowMs: number): void {
    for (const [userId, bucket] of usageByUser.entries()) {
        const pruned = pruneUsageBucket(bucket, nowMs);
        if (!pruned.requestTimestampsMs.length && !pruned.tokenUsage.length) {
            usageByUser.delete(userId);
        }
    }
}

function enforceCurateLimits(userId: string, inputTokens: number): void {
    if (inputTokens > MAX_INPUT_TOKENS_PER_REQUEST) {
        throw new ApiError(
            413,
            "curate_chat_input_too_large",
            "Curate message is too long. Please shorten it and try again.",
        );
    }

    const nowMs = Date.now();
    pruneStaleUsageBuckets(nowMs);

    const bucket = pruneUsageBucket(
        usageByUser.get(userId) ?? { requestTimestampsMs: [], tokenUsage: [] },
        nowMs,
    );

    if (bucket.requestTimestampsMs.length >= MAX_REQUESTS_PER_WINDOW) {
        throw new ApiError(
            429,
            "curate_chat_rate_limited",
            "Too many curate requests right now. Please wait a minute and try again.",
        );
    }

    const usedTokensInWindow = bucket.tokenUsage.reduce((sum, event) => sum + event.tokens, 0);
    if (usedTokensInWindow + inputTokens > MAX_INPUT_TOKENS_PER_WINDOW) {
        throw new ApiError(
            429,
            "curate_chat_token_limited",
            "Curate usage is temporarily capped. Please try again in a few minutes.",
        );
    }

    bucket.requestTimestampsMs.push(nowMs);
    bucket.tokenUsage.push({ atMs: nowMs, tokens: inputTokens });
    usageByUser.set(userId, bucket);
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
        "When confirming a request, use wording like: I'll let Orecce know you want ...",
        "Do not imply you will personally make product changes.",
        "Do not mention internal systems, policies, or model behavior.",
        ...contextBits,
    ].join(" ");
}

function getLastUserMessage(messages: ChatMessage[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index]?.role === "user") {
            return messages[index].content;
        }
    }
    return "";
}

function buildLocalFallbackReply(messages: ChatMessage[]): string {
    const latestUserMessage = getLastUserMessage(messages).replace(/\s+/g, " ").trim();
    if (!latestUserMessage) {
        return "I'll let Orecce know you want changes to your feed. Anything else you want adjusted?";
    }

    const withoutTrailingPunctuation = latestUserMessage.replace(/[.!?]+$/g, "").trim();
    const compactMessage = withoutTrailingPunctuation.length > 180
        ? `${withoutTrailingPunctuation.slice(0, 177).trimEnd()}...`
        : withoutTrailingPunctuation;

    return `I'll let Orecce know you want ${compactMessage}. Anything else you want changed?`;
}

function getModelCandidates(): string[] {
    const seen = new Set<string>();
    const models: string[] = [];

    for (const candidate of [CURATE_CHAT_MODEL, ...FALLBACK_MODELS]) {
        const model = candidate.trim();
        if (!model) continue;
        const key = model.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        models.push(model);
    }

    return models;
}

function buildUpstreamRequestBody(
    model: string,
    payload: Record<string, unknown>,
    messages: ChatMessage[],
): Record<string, unknown> {
    const isGpt5Family = model.toLowerCase().startsWith("gpt-5");
    return {
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
    };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticate(req);

    const body = await req.json();
    const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const messages = normalizeMessages(payload.messages);

    if (!messages.length || !messages.some((message) => message.role === "user")) {
        throw new ApiError(400, "bad_request", "At least one user message is required.");
    }

    const inputTokens = estimateInputTokens(messages);
    enforceCurateLimits(identity.uid, inputTokens);

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
        return ok({ reply: buildLocalFallbackReply(messages), degraded: true });
    }

    const failures: UpstreamAttemptFailure[] = [];
    const openAiBaseUrl = getOpenAiBaseUrl().replace(/\/+$/, "");

    for (const model of getModelCandidates()) {
        try {
            const upstreamResponse = await fetch(`${openAiBaseUrl}/responses`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(buildUpstreamRequestBody(model, payload, messages)),
                signal: AbortSignal.timeout(20_000),
            });

            if (!upstreamResponse.ok) {
                failures.push({
                    model,
                    status: upstreamResponse.status,
                    body: (await upstreamResponse.text()).slice(0, 1200),
                });
                continue;
            }

            const responseJson = (await upstreamResponse.json()) as unknown;
            const reply = extractResponseText(responseJson);
            if (reply) {
                return ok({ reply });
            }

            failures.push({
                model,
                status: upstreamResponse.status,
                body: "empty_response_text",
            });
        } catch (error) {
            failures.push({
                model,
                status: null,
                body: error instanceof Error ? error.message : String(error),
            });
        }
    }

    console.error("Curate chat upstream failed; using fallback response.", failures);
    return ok({ reply: buildLocalFallbackReply(messages), degraded: true });
});
