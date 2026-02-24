import { NextRequest, NextResponse } from "next/server";
import { authenticate, ensureUserHasPrefills } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { generatePostRequestSchema } from "@api/validation/requestValidation";
import { normalizeProfileKey } from "@api/utils/text";
import { ApiError } from "@api/types/errors";

export async function POST(req: NextRequest) {
    try {
        const identity = await authenticate(req);
        const body = await req.json();
        const parsed = generatePostRequestSchema.safeParse(body);
        if (!parsed.success) {
            throw new ApiError(400, "bad_request", "Invalid generate request.", parsed.error.flatten());
        }
        await ensureUserHasPrefills(identity.uid, identity.email);
        const { repository } = getDeps();
        const post = await repository.getNextPrefillPost({
            userId: identity.uid,
            mode: parsed.data.mode,
            profile: parsed.data.profile,
            profileKey: normalizeProfileKey(parsed.data.profile),
            length: parsed.data.length
        });
        if (!post) {
            throw new ApiError(404, "no_prefill_posts", "No prefilled posts available for this user/mode.");
        }

        // SSE stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                const writeSse = (event: string, payload: unknown) => {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
                };

                writeSse("start", { mode: parsed.data.mode, profile: parsed.data.profile, length: parsed.data.length });

                const chunkSize = 70;
                for (let i = 0; i < post.body.length; i += chunkSize) {
                    writeSse("chunk", { delta: post.body.slice(i, i + chunkSize) });
                }

                writeSse("post", { ok: true, data: post });
                writeSse("done", { ok: true });
                controller.close();
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive"
            }
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return NextResponse.json(
                { ok: false, error: { code: err.code, message: err.message, details: err.details ?? null } },
                { status: err.status }
            );
        }
        const message = err instanceof Error ? err.message : "Unknown server error.";
        return NextResponse.json(
            { ok: false, error: { code: "internal_error", message } },
            { status: 500 }
        );
    }
}
