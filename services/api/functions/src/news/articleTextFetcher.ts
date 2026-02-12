interface ArticleFetchOptions {
  timeoutMs: number;
  userAgent: string;
}

interface ArticleFetchResult {
  html: string;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTagsToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h1|h2|h3|h4|h5|h6|blockquote|section|article|div)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null = scriptRegex.exec(html);
  while (match) {
    const block = String(match[1] ?? "").trim();
    if (block) {
      blocks.push(block);
    }
    match = scriptRegex.exec(html);
  }
  return blocks;
}

function collectArticleBodyValues(value: unknown, out: string[]): void {
  if (!value) {
    return;
  }
  if (typeof value === "string") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectArticleBodyValues(item, out);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.articleBody === "string" && record.articleBody.trim()) {
    out.push(record.articleBody.trim());
  }
  for (const nested of Object.values(record)) {
    collectArticleBodyValues(nested, out);
  }
}

function tryExtractArticleTextFromJsonLd(html: string): string {
  const blocks = extractJsonLdBlocks(html);
  const articleBodies: string[] = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      collectArticleBodyValues(parsed, articleBodies);
    } catch {
      continue;
    }
  }

  const body = articleBodies
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];

  if (!body) {
    return "";
  }

  return decodeHtmlEntities(
    body
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function tryExtractArticleElement(html: string): string {
  const articleMatch = html.match(/<article\b[\s\S]*?<\/article>/i);
  if (articleMatch?.[0]) {
    return articleMatch[0];
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

export async function fetchArticleHtml(url: string, options: ArticleFetchOptions): Promise<ArticleFetchResult> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": options.userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(options.timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Article request failed with status ${response.status}`);
  }

  const html = await response.text();
  if (!html.trim()) {
    throw new Error("Article response body was empty.");
  }

  return { html };
}

export function extractArticleTextVerbatim(html: string): string {
  const jsonLdText = tryExtractArticleTextFromJsonLd(html);
  if (jsonLdText.length >= 20) {
    return jsonLdText;
  }

  const candidateHtml = tryExtractArticleElement(html);
  const text = stripTagsToText(candidateHtml);
  if (text.length >= 180) {
    return text;
  }

  return stripTagsToText(html);
}

export async function fetchArticleFullText(url: string, options: ArticleFetchOptions): Promise<string> {
  const response = await fetchArticleHtml(url, options);
  const text = extractArticleTextVerbatim(response.html);
  if (!text.trim()) {
    throw new Error("Unable to extract article text from HTML.");
  }
  return text;
}
