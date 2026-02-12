import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  getNewsArticleConcurrency,
  getNewsArticleTimeoutMs,
  getNewsCrawlerUserAgent,
  getNewsFeedTimeoutMs,
  getNewsMaxArticlesPerSource,
  getNewsSourceConcurrency,
  shouldFetchNewsFullText
} from "../src/config/runtimeConfig";
import { FirestoreNewsRepository } from "../src/news/firestoreNewsRepository";
import { DEFAULT_NEWS_SOURCES } from "../src/news/newsSources";
import { NewsIngestionService } from "../src/news/newsIngestionService";
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

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? "");
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  npm --prefix functions run sync:news:emulator",
      "  npm --prefix functions run sync:news:emulator -- --source-id guardian-world",
      "",
      "Options:",
      "  --source-id <id>           Sync only one source id",
      "  --project-id <id>          Firebase project id (default: ai-post-dev)",
      "  --firestore-host <host>    Firestore emulator host (default: 127.0.0.1:8080)",
      "  --max-articles <n>         Max articles per source (default from env/runtime config)"
    ].join("\n")
  );
}

async function readStoredCountBySource(sourceId: string): Promise<number> {
  const db = getFirestore();
  const aggregate = await db.collection("newsArticles").where("sourceId", "==", sourceId).count().get();
  return aggregate.data().count;
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const projectId = String(args["project-id"] ?? process.env.FIREBASE_PROJECT_ID ?? "ai-post-dev");
  const firestoreHost = String(args["firestore-host"] ?? process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080");
  const sourceId = typeof args["source-id"] === "string" ? args["source-id"].trim() : "";
  const maxArticles = parsePositiveInt(
    typeof args["max-articles"] === "string" ? args["max-articles"] : undefined,
    getNewsMaxArticlesPerSource()
  );

  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;

  if (!getApps().length) {
    initializeApp({ projectId });
  }

  const selectedSources = sourceId
    ? DEFAULT_NEWS_SOURCES.filter((source) => source.id === sourceId)
    : DEFAULT_NEWS_SOURCES;
  if (!selectedSources.length) {
    throw new Error(`Unknown source id: ${sourceId}`);
  }

  const repository = new FirestoreNewsRepository(getFirestore());
  const userAgent = getNewsCrawlerUserAgent();
  const feedTimeoutMs = getNewsFeedTimeoutMs();
  const sourceConcurrency = getNewsSourceConcurrency();
  const articleTimeoutMs = getNewsArticleTimeoutMs();
  const articleConcurrency = getNewsArticleConcurrency();
  const fetchFullText = shouldFetchNewsFullText();

  // eslint-disable-next-line no-console
  console.log(
    `Running news sync on emulator (${firestoreHost}) for ${selectedSources.length} source(s) in project ${projectId}.`
  );

  for (const source of selectedSources) {
    const service = new NewsIngestionService({
      repository,
      sources: [source]
    });

    const result = await service.syncAllSources({
      schedule: "manual emulator source check",
      maxArticlesPerSource: maxArticles,
      sourceConcurrency,
      feedTimeoutMs,
      articleTimeoutMs,
      articleConcurrency,
      fetchFullText,
      userAgent,
      maxSourcesPerRun: 1,
      deadlineMs: Date.now() + 57_000
    });

    const sourceResult = result.sourceResults[0];
    const storedCount = await readStoredCountBySource(source.id);
    // eslint-disable-next-line no-console
    console.log(
      [
        `Source: ${source.name} (${source.id})`,
        `  status: ${sourceResult.status}`,
        `  fetched: ${sourceResult.fetchedCount}`,
        `  inserted: ${sourceResult.insertedCount}`,
        `  updated: ${sourceResult.updatedCount}`,
        `  unchanged: ${sourceResult.unchangedCount}`,
        `  total_stored_for_source: ${storedCount}`,
        sourceResult.errorMessage ? `  error: ${sourceResult.errorMessage}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  // eslint-disable-next-line no-console
  console.log("Done.");
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
