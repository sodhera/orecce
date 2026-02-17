import { auth } from "./firebaseConfig";

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

async function getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    const user = auth.currentUser;
    if (user) {
        const token = await user.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
}

async function post<T>(
    path: string,
    body: Record<string, unknown>,
): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResult<T>;
    if (!json.ok) {
        throw new Error(json.error?.message ?? "API error");
    }
    return json.data;
}

async function get<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
): Promise<T> {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined) {
                params.set(key, String(value));
            }
        }
    }
    const queryString = params.toString();
    const fullPath = queryString
        ? `${API_BASE}${path}?${queryString}`
        : `${API_BASE}${path}`;

    const res = await fetch(fullPath, {
        method: "GET",
        headers,
    });
    const json = (await res.json()) as ApiResult<T>;
    if (!json.ok) {
        throw new Error(json.error?.message ?? "API error");
    }
    return json.data;
}

// ── Public API ──────────────────────────────────────────────────

export async function generatePost(
    mode: string,
    profile: string,
    length: string = "short",
): Promise<ApiPost> {
    return post<ApiPost>("/posts/generate", {
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
    mode: string,
    profile: string,
    pageSize: number = 20,
    cursor?: string,
): Promise<ListPostsResult> {
    return post<ListPostsResult>("/posts/list", {
        mode,
        profile,
        page_size: pageSize,
        ...(cursor ? { cursor } : {}),
    });
}

export interface NewsSource {
    id: string;
    name: string;
    homepageUrl: string;
    language: string;
    countryCode?: string;
    articleCount: number;
    lastStatus?: string;
    lastRunAtMs?: number;
    lastSuccessAtMs?: number;
}

export interface ListNewsSourcesResult {
    sources: NewsSource[];
}

export interface NewsArticleListItem {
    id: string;
    sourceId: string;
    sourceName: string;
    title: string;
    summary: string;
    canonicalUrl: string;
    publishedAtMs?: number;
    fullTextStatus?: string;
}

export interface ListNewsArticlesResult {
    items: NewsArticleListItem[];
}

export interface NewsArticleDetail extends NewsArticleListItem {
    fullText?: string;
    fullTextError?: string;
    fullTextLength?: number;
    fullTextChunkCount?: number;
}

export interface GetNewsArticleResult {
    article: NewsArticleDetail;
}

export interface SportsStory {
    id: string;
    sport: "football";
    sourceId: string;
    sourceName: string;
    title: string;
    canonicalUrl: string;
    publishedAtMs?: number;
    importanceScore: number;
    bulletPoints: string[];
    reconstructedArticle: string;
    story: string;
    fullTextStatus: "ready" | "fallback";
    summarySource: "llm" | "fallback";
}

export interface GetSportsLatestResult {
    sport: "football";
    stories: SportsStory[];
}

export interface SportsSyncState {
    status: "idle" | "running" | "complete" | "error";
    step:
        | "idle"
        | "looking_games"
        | "games_found"
        | "preparing_articles"
        | "complete"
        | "error";
    message: string;
    totalGames: number;
    processedGames: number;
    foundGames: string[];
    updatedAtMs: number;
    startedAtMs?: number;
    completedAtMs?: number;
    errorMessage?: string;
}

export interface GetSportsStatusResult {
    sport: "football";
    state: SportsSyncState;
}

export async function listNewsSources(): Promise<ListNewsSourcesResult> {
    return get<ListNewsSourcesResult>("/news/sources");
}

export async function listNewsArticles(
    sourceId: string,
    limit: number = 20,
): Promise<ListNewsArticlesResult> {
    return get<ListNewsArticlesResult>("/news/articles", {
        source_id: sourceId,
        limit,
    });
}

export async function getNewsArticle(
    articleId: string,
): Promise<GetNewsArticleResult> {
    return get<GetNewsArticleResult>(
        `/news/articles/${encodeURIComponent(articleId)}`,
    );
}

export async function getSportsLatest(
    sport: "football",
    limit: number = 10,
    refresh: boolean = false,
): Promise<GetSportsLatestResult> {
    return get<GetSportsLatestResult>("/news/sports/latest", {
        sport,
        limit,
        refresh: refresh ? "true" : undefined,
    });
}

export async function getSportsStatus(
    sport: "football",
): Promise<GetSportsStatusResult> {
    return get<GetSportsStatusResult>("/news/sports/status", {
        sport,
    });
}
