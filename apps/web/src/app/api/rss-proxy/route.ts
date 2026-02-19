import { NextRequest, NextResponse } from "next/server";

const ALLOWED_FEED_URLS = new Set<string>([
    "https://openai.com/news/rss.xml",
    "https://deepmind.com/blog/feed/basic",
    "https://blog.research.google/atom.xml",
    "https://ai.stanford.edu/blog/feed.xml",
    "https://huggingface.co/blog/feed.xml",
    "https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "https://techcrunch.com/feed/",
]);

export const runtime = "nodejs";
const FEED_TIMEOUT_MS = 20_000;

function resolveFetchUrl(url: string): string {
    // FeedBurner redirect for Google Research can fail under node fetch in some environments.
    if (url === "https://blog.research.google/atom.xml") {
        return "https://feeds.feedburner.com/blogspot/gJZg";
    }
    return url;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const url = String(request.nextUrl.searchParams.get("url") ?? "").trim();
    if (!url || !ALLOWED_FEED_URLS.has(url)) {
        return NextResponse.json(
            { ok: false, error: "Unsupported feed URL." },
            { status: 400 },
        );
    }

    try {
        const response = await fetch(resolveFetchUrl(url), {
            method: "GET",
            headers: {
                Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
                "User-Agent": "OrecceWebRSSReader/1.0 (+https://orecce.app)",
            },
            signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
            next: {
                revalidate: 300,
            },
        });

        const body = await response.text();
        if (!response.ok) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `Feed request failed with status ${response.status}.`,
                },
                { status: 502 },
            );
        }

        return new NextResponse(body, {
            status: 200,
            headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
            },
        });
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : "Failed to fetch RSS feed.",
            },
            { status: 500 },
        );
    }
}
