/**
 * Shared auth + error helpers for Next.js API routes.
 */
import { NextRequest, NextResponse } from "next/server";
import { AuthIdentity } from "@orecce/api-core/src/auth/types";
import { ApiError } from "@orecce/api-core/src/types/errors";
import { getDeps } from "./init";

/**
 * Extract and verify the Bearer token, returning the authenticated identity.
 */
export async function authenticate(req: NextRequest): Promise<AuthIdentity> {
    const raw = (req.headers.get("authorization") ?? "").trim();
    if (!raw.toLowerCase().startsWith("bearer ")) {
        throw new ApiError(401, "missing_auth", "Missing Authorization bearer token.");
    }
    const token = raw.slice(7).trim();
    if (!token) {
        throw new ApiError(401, "missing_auth", "Authorization bearer token is empty.");
    }

    const { authVerifier } = getDeps();
    try {
        return await authVerifier.verifyBearerToken(token);
    } catch (error) {
        throw new ApiError(
            401,
            "invalid_auth",
            "Unable to verify access token.",
            error instanceof Error ? error.message : String(error)
        );
    }
}

/**
 * Wraps a handler with standard error handling, returning JSON `{ ok, error }`.
 */
export function withErrorHandler(
    handler: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
) {
    return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
        try {
            return await handler(req, ctx);
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
    };
}

/** JSON success response helper. */
export function ok(data: unknown, headers?: Record<string, string>) {
    return NextResponse.json({ ok: true, data }, { status: 200, headers });
}

