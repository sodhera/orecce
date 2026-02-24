import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API_BASE_URL = "https://api-2ljiuwaa3a-uc.a.run.app";

function normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

function getApiBaseUrl(): string {
    return normalizeBaseUrl(
        process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
    );
}

function readBearerToken(request: NextRequest): string | null {
    const raw = String(request.headers.get("authorization") ?? "").trim();
    if (!raw.toLowerCase().startsWith("bearer ")) {
        return null;
    }
    const token = raw.slice(7).trim();
    return token || null;
}

export async function requireAuth(
    request: NextRequest,
): Promise<{ token: string } | NextResponse> {
    const token = readBearerToken(request);
    if (!token) {
        return NextResponse.json(
            { ok: false, error: "Authentication required." },
            { status: 401 },
        );
    }

    try {
        const verifyResponse = await fetch(`${getApiBaseUrl()}/v1/users/me`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
        });

        if (verifyResponse.status === 401 || verifyResponse.status === 403) {
            return NextResponse.json(
                { ok: false, error: "Invalid or expired authentication token." },
                { status: 401 },
            );
        }

        if (!verifyResponse.ok) {
            return NextResponse.json(
                { ok: false, error: "Auth service unavailable." },
                { status: 503 },
            );
        }

        return { token };
    } catch {
        return NextResponse.json(
            { ok: false, error: "Auth verification failed." },
            { status: 503 },
        );
    }
}
