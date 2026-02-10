const API_BASE = "/api/v1";

// ── Types ───────────────────────────────────────────────────────

export interface ApiPost {
    id: string;
    userId: string;
    mode: string;
    profile: string;
    profileKey: string;
    length: string;
    title: string;
    body: string;
    post_type: string;
    tags: string[];
    confidence: string;
    uncertainty_note: string | null;
    createdAtMs: number;
}

interface ApiOk<T> {
    ok: true;
    data: T;
}

interface ApiErr {
    ok: false;
    error: { code: string; message: string; details: unknown };
}

type ApiResult<T> = ApiOk<T> | ApiErr;

// ── Helpers ─────────────────────────────────────────────────────

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResult<T>;
    if (!json.ok) {
        throw new Error(json.error?.message ?? "API error");
    }
    return json.data;
}

// ── Public API ──────────────────────────────────────────────────

export async function generatePost(
    userId: string,
    mode: string,
    profile: string,
    length: string = "short",
): Promise<ApiPost> {
    return post<ApiPost>("/posts/generate", {
        user_id: userId,
        mode,
        profile,
        length,
    });
}

export interface ListPostsResult {
    items: ApiPost[];
    nextCursor: string | null;
}

export async function listPosts(
    userId: string,
    mode: string,
    profile: string,
    pageSize: number = 20,
    cursor?: string,
): Promise<ListPostsResult> {
    return post<ListPostsResult>("/posts/list", {
        user_id: userId,
        mode,
        profile,
        page_size: pageSize,
        ...(cursor ? { cursor } : {}),
    });
}
