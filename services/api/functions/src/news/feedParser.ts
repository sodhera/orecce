import { XMLParser } from "fast-xml-parser";
import { ParsedFeedArticle } from "./types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  textNodeName: "text"
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function readText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (!value) {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = readText(item);
      if (text) {
        return text;
      }
    }
    return "";
  }
  if (isRecord(value)) {
    const textCandidate = readText(value.text ?? value["#text"] ?? value.cdata);
    if (textCandidate) {
      return textCandidate;
    }
    return "";
  }
  return "";
}

function pickFirstText(values: unknown[]): string {
  for (const value of values) {
    const text = readText(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

function parseDateMs(raw: string): number | undefined {
  if (!raw) {
    return undefined;
  }
  const millis = Date.parse(raw);
  return Number.isFinite(millis) ? millis : undefined;
}

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.delete("utm_source");
    url.searchParams.delete("utm_medium");
    url.searchParams.delete("utm_campaign");
    url.searchParams.delete("utm_term");
    url.searchParams.delete("utm_content");
    return url.toString();
  } catch {
    return value;
  }
}

function readLinkCandidate(linkValue: unknown): string {
  if (typeof linkValue === "string") {
    return linkValue.trim();
  }

  if (Array.isArray(linkValue)) {
    const preferred = linkValue.find((entry) => {
      if (!isRecord(entry)) {
        return false;
      }
      const rel = String(entry.rel ?? "").toLowerCase();
      return !rel || rel === "alternate";
    });
    if (preferred) {
      return readLinkCandidate(preferred);
    }
    return pickFirstText(linkValue);
  }

  if (!isRecord(linkValue)) {
    return "";
  }

  const href = readText(linkValue.href);
  if (href) {
    return href;
  }

  return readText(linkValue.text ?? linkValue["#text"]);
}

function extractCategories(value: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const pushCategory = (candidate: string) => {
    const normalized = candidate.trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  };

  const list = asArray(value);
  for (const category of list) {
    if (isRecord(category)) {
      pushCategory(readText(category.term));
      pushCategory(readText(category.text ?? category["#text"]));
      continue;
    }
    pushCategory(readText(category));
  }

  return result;
}

function parseRssItems(root: Record<string, unknown>): ParsedFeedArticle[] {
  const rss = isRecord(root.rss) ? root.rss : null;
  const channelRaw = rss && isRecord(rss.channel) ? rss.channel : null;
  if (!channelRaw) {
    return [];
  }

  const itemsRaw = asArray(channelRaw.item);
  const items: ParsedFeedArticle[] = [];
  for (const rawItem of itemsRaw) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const title = pickFirstText([rawItem.title]);
    const link = normalizeUrl(readLinkCandidate(rawItem.link) || pickFirstText([rawItem.guid]));
    if (!title || !link) {
      continue;
    }

    const summary = stripHtml(
      pickFirstText([rawItem.description, rawItem.summary, rawItem.encoded, rawItem.content])
    );
    const guid = pickFirstText([rawItem.guid, rawItem.id]);
    const publishedAtMs = parseDateMs(
      pickFirstText([rawItem.pubDate, rawItem.published, rawItem.updated, rawItem.date])
    );

    items.push({
      externalId: guid || link,
      canonicalUrl: link,
      title,
      summary,
      categories: extractCategories(rawItem.category),
      author: pickFirstText([rawItem.creator, rawItem.author]) || undefined,
      publishedAtMs
    });
  }
  return items;
}

function parseAtomEntries(root: Record<string, unknown>): ParsedFeedArticle[] {
  const feed = isRecord(root.feed) ? root.feed : null;
  if (!feed) {
    return [];
  }

  const entriesRaw = asArray(feed.entry);
  const items: ParsedFeedArticle[] = [];
  for (const rawEntry of entriesRaw) {
    if (!isRecord(rawEntry)) {
      continue;
    }

    const title = pickFirstText([rawEntry.title]);
    const link = normalizeUrl(readLinkCandidate(rawEntry.link));
    if (!title || !link) {
      continue;
    }

    const summary = stripHtml(pickFirstText([rawEntry.summary, rawEntry.content]));
    const publishedAtMs = parseDateMs(pickFirstText([rawEntry.published, rawEntry.updated]));
    const entryId = pickFirstText([rawEntry.id]) || link;

    items.push({
      externalId: entryId,
      canonicalUrl: link,
      title,
      summary,
      categories: extractCategories(rawEntry.category),
      author: pickFirstText([rawEntry.author, isRecord(rawEntry.author) ? rawEntry.author.name : undefined]),
      publishedAtMs
    });
  }
  return items;
}

export function parseFeedXml(xml: string): ParsedFeedArticle[] {
  const trimmed = xml.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = xmlParser.parse(trimmed);
  if (!isRecord(parsed)) {
    return [];
  }

  const rssItems = parseRssItems(parsed);
  if (rssItems.length > 0) {
    return rssItems;
  }

  return parseAtomEntries(parsed);
}
