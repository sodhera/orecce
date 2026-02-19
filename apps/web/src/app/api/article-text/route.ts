import { NextRequest, NextResponse } from "next/server";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_TEXT_CHARS = 40_000;

const ALLOWED_ARTICLE_HOSTS = [
    "openai.com",
    "deepmind.com",
    "deepmind.google",
    "blog.google",
    "blog.research.google",
    "research.google",
    "ai.stanford.edu",
    "huggingface.co",
    "news.mit.edu",
    "techcrunch.com",
];

export const runtime = "nodejs";

function isAllowedHost(hostname: string): boolean {
    const host = hostname.trim().toLowerCase();
    if (!host) {
        return false;
    }
    return ALLOWED_ARTICLE_HOSTS.some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) =>
            String.fromCodePoint(parseInt(hex, 16)),
        )
        .replace(/&#(\d+);/g, (_match, num) =>
            String.fromCodePoint(parseInt(num, 10)),
        )
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

function normalizeWhitespace(value: string): string {
    const lines = value
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim());

    const normalizedLines: string[] = [];
    let pendingBlankLines = 0;

    for (const line of lines) {
        if (!line) {
            pendingBlankLines = Math.min(2, pendingBlankLines + 1);
            continue;
        }
        if (normalizedLines.length > 0) {
            for (let i = 0; i < pendingBlankLines; i += 1) {
                normalizedLines.push("");
            }
        }
        pendingBlankLines = 0;
        normalizedLines.push(line);
    }

    return normalizedLines.join("\n").trim();
}

function pickPrimaryHtml(html: string): string {
    const articleMatches = Array.from(html.matchAll(/<article\b[\s\S]*?<\/article>/gi));
    if (articleMatches.length > 0) {
        return articleMatches
            .map((match) => match[0])
            .sort((a, b) => b.length - a.length)[0];
    }

    const mainMatch = html.match(/<main\b[\s\S]*?<\/main>/i);
    if (mainMatch?.[0]) {
        return mainMatch[0];
    }

    const bodyMatch = html.match(/<body\b[\s\S]*?<\/body>/i);
    if (bodyMatch?.[0]) {
        return bodyMatch[0];
    }

    return html;
}

function extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match?.[1]) {
        return "";
    }
    const stripped = match[1].replace(/<[^>]+>/g, " ");
    return normalizeWhitespace(decodeHtmlEntities(stripped));
}

function extractReadableText(html: string): string {
    const primary = pickPrimaryHtml(html)
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
        .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, " ")
        .replace(/<li\b[^>]*>/gi, "\n• ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|article|section|li|h[1-6]|blockquote|ul|ol|main)>/gi, "\n\n")
        .replace(/<[^>]+>/g, " ");

    const decoded = decodeHtmlEntities(primary);
    const normalized = normalizeWhitespace(decoded);
    if (normalized.length <= MAX_TEXT_CHARS) {
        return normalized;
    }
    return `${normalized.slice(0, MAX_TEXT_CHARS).trim()}...`;
}

function extractClientRedirectTarget(html: string, baseUrl: string): string | null {
    const metaRefreshMatch = html.match(
        /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>]+)["']/i,
    );
    if (metaRefreshMatch?.[1]) {
        try {
            return new URL(metaRefreshMatch[1].trim(), baseUrl).toString();
        } catch {
            return null;
        }
    }

    const windowLocationMatch = html.match(
        /window\\.location(?:\\.href)?\\s*=\\s*["']([^"']+)["']/i,
    );
    if (windowLocationMatch?.[1]) {
        try {
            return new URL(windowLocationMatch[1].trim(), baseUrl).toString();
        } catch {
            return null;
        }
    }

    return null;
}

async function fetchHtml(url: string): Promise<{ responseUrl: string; body: string }> {
    const response = await fetch(url, {
        method: "GET",
        headers: {
            "User-Agent": "OrecceWebArticleReader/1.0 (+https://orecce.app)",
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        next: {
            revalidate: 300,
        },
    });

    const body = await response.text();
    if (!response.ok) {
        throw new Error(`Article fetch failed with status ${response.status}.`);
    }

    return {
        responseUrl: response.url || url,
        body,
    };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const rawUrl = String(request.nextUrl.searchParams.get("url") ?? "").trim();
    if (!rawUrl) {
        return NextResponse.json(
            { ok: false, error: "Missing url query param." },
            { status: 400 },
        );
    }

    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return NextResponse.json(
            { ok: false, error: "Invalid URL." },
            { status: 400 },
        );
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        return NextResponse.json(
            { ok: false, error: "Only HTTP(S) URLs are allowed." },
            { status: 400 },
        );
    }

    if (!isAllowedHost(parsed.hostname)) {
        return NextResponse.json(
            { ok: false, error: "URL host is not allowed." },
            { status: 403 },
        );
    }

    try {
        let activeUrl = parsed.toString();
        let { responseUrl, body } = await fetchHtml(activeUrl);
        activeUrl = responseUrl;

        let text = extractReadableText(body);
        if (!text || text.length < 120) {
            const redirectTarget = extractClientRedirectTarget(body, activeUrl);
            if (redirectTarget) {
                const redirectUrl = new URL(redirectTarget);
                if (isAllowedHost(redirectUrl.hostname)) {
                    const redirected = await fetchHtml(redirectUrl.toString());
                    activeUrl = redirected.responseUrl;
                    body = redirected.body;
                    text = extractReadableText(body);
                }
            }
        }

        const title = extractTitle(body);
        if (!text || text.length < 120) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "Unable to extract readable article text from source page.",
                },
                { status: 422 },
            );
        }

        return NextResponse.json(
            {
                ok: true,
                data: {
                    url: activeUrl,
                    title,
                    text,
                    textLength: text.length,
                },
            },
            {
                status: 200,
                headers: {
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
                },
            },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch source article.";
        return NextResponse.json(
            {
                ok: false,
                error: message,
            },
            { status: /failed with status/i.test(message) ? 502 : 500 },
        );
    }
}
