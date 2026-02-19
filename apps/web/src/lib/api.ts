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

interface RequestOptions {
    signal?: AbortSignal;
}

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
    options?: RequestOptions,
): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: options?.signal,
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
    options?: RequestOptions,
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
        signal: options?.signal,
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

export const SPORT_IDS = [
    "football",
    "basketball",
    "cricket",
    "american-football",
    "baseball",
    "tennis",
    "motorsport",
    "rugby",
    "ice-hockey",
    "boxing-mma",
] as const;

export type SportId = (typeof SPORT_IDS)[number];

export const SPORT_DISPLAY_NAMES: Record<SportId, string> = {
    football: "Football",
    basketball: "Basketball",
    cricket: "Cricket",
    "american-football": "American Football",
    baseball: "Baseball",
    tennis: "Tennis",
    motorsport: "Formula 1 / Motorsport",
    rugby: "Rugby",
    "ice-hockey": "Ice Hockey",
    "boxing-mma": "Boxing / MMA",
};

export interface SportsStory {
    id: string;
    sport: SportId;
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
    sport: SportId;
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
    sport: SportId;
    state: SportsSyncState;
}

export interface RequestSportsRefreshResult {
    sport: SportId;
    queued: boolean;
}

export interface GetSportsFeedResult {
    items: SportsFeedItem[];
    nextCursor: string | null;
}

export interface SportsFeedItem {
    id: string;
    sport: SportId;
    title: string;
    publishedAtMs?: number;
    importanceScore: number;
    preview: string;
}

export interface GetSportsStoryResult {
    story: SportsStory;
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
    sport: SportId,
    limit: number = 10,
    refresh: boolean = false,
): Promise<GetSportsLatestResult> {
    return get<GetSportsLatestResult>("/news/sports/latest", {
        sport,
        limit,
        refresh: refresh ? "true" : undefined,
    });
}

export async function getSportsFeed(
    limit: number = 5,
    cursor?: string,
    sports?: SportId[],
    options?: RequestOptions,
): Promise<GetSportsFeedResult> {
    return get<GetSportsFeedResult>("/news/sports/feed", {
        limit,
        cursor,
        sports: sports?.length ? sports.join(",") : undefined,
    }, options);
}

export async function getSportsStory(
    storyId: string,
    options?: RequestOptions,
): Promise<GetSportsStoryResult> {
    return get<GetSportsStoryResult>(
        `/news/sports/stories/${encodeURIComponent(storyId)}`,
        undefined,
        options,
    );
}

export async function getSportsStatus(
    sport: SportId,
): Promise<GetSportsStatusResult> {
    return get<GetSportsStatusResult>("/news/sports/status", {
        sport,
    });
}

export async function requestSportsRefresh(
    sport: SportId,
): Promise<RequestSportsRefreshResult> {
    return post<RequestSportsRefreshResult>("/news/sports/refresh", {
        sport,
    });
}
