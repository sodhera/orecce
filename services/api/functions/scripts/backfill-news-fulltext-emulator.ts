import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { getNewsArticleTimeoutMs, getNewsCrawlerUserAgent } from "../src/config/runtimeConfig";
import { fetchArticleFullText } from "../src/news/articleTextFetcher";
import { FirestoreNewsRepository } from "../src/news/firestoreNewsRepository";
import { NewsSourceConfig, ParsedFeedArticle } from "../src/news/types";
import { loadDotEnv } from "./loadDotEnv";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function toPublishedAtMs(value: unknown): number | undefined {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item)).filter(Boolean);
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const projectId = String(args["project-id"] ?? process.env.FIREBASE_PROJECT_ID ?? "ai-post-dev");
  const firestoreHost = String(args["firestore-host"] ?? process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080");
  const sourceFilter = typeof args["source-id"] === "string" ? args["source-id"].trim() : "";

  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
  if (!getApps().length) {
    initializeApp({ projectId });
  }

  const db = getFirestore();
  const repo = new FirestoreNewsRepository(db);
  const articleTimeoutMs = getNewsArticleTimeoutMs();
  const userAgent = getNewsCrawlerUserAgent();

  let query: FirebaseFirestore.Query = db.collection("newsArticles");
  if (sourceFilter) {
    query = query.where("sourceId", "==", sourceFilter);
  }
  const snap = await query.get();

  const targets = snap.docs.filter((doc) => {
    const status = String(doc.data().fullTextStatus ?? "");
    return status !== "ready";
  });

  // eslint-disable-next-line no-console
  console.log(
    `Backfilling ${targets.length} article(s) on ${firestoreHost}${sourceFilter ? ` for ${sourceFilter}` : ""}.`
  );

  let success = 0;
  let failed = 0;

  for (const doc of targets) {
    const d = doc.data();
    const source: NewsSourceConfig = {
      id: String(d.sourceId ?? ""),
      name: String(d.sourceName ?? ""),
      homepageUrl: String(d.source?.homepageUrl ?? d.canonicalUrl ?? ""),
      feedUrl: String(d.source?.feedUrl ?? ""),
      language: String(d.source?.language ?? "en"),
      countryCode: d.source?.countryCode ? String(d.source.countryCode) : undefined
    };

    const article: ParsedFeedArticle = {
      externalId: String(d.externalId ?? d.canonicalUrl ?? doc.id),
      canonicalUrl: String(d.canonicalUrl ?? ""),
      title: String(d.title ?? ""),
      summary: String(d.summary ?? ""),
      categories: toStringArray(d.categories),
      author: d.author ? String(d.author) : undefined,
      publishedAtMs: toPublishedAtMs(d.publishedAt)
    };

    if (!article.canonicalUrl || !source.id) {
      failed += 1;
      continue;
    }

    try {
      const fullText = await fetchArticleFullText(article.canonicalUrl, {
        timeoutMs: articleTimeoutMs,
        userAgent
      });
      await repo.upsertArticles(source, [{ ...article, fullText }]);
      success += 1;
    } catch (error) {
      await repo.upsertArticles(source, [
        {
          ...article,
          fullTextError: error instanceof Error ? error.message : "Unknown full text fetch error."
        }
      ]);
      failed += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Backfill complete. success=${success} failed=${failed}`);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
