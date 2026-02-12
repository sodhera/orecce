import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as functionsV1 from "firebase-functions/v1";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FirebaseAuthVerifier } from "./auth/firebaseAuthVerifier";
import {
  getDefaultPrefillPostsPerMode,
  getNewsArticleConcurrency,
  getNewsArticleTimeoutMs,
  getNewsCrawlerUserAgent,
  getNewsFeedTimeoutMs,
  getNewsMaxArticlesPerSource,
  getNewsMaxSourcesPerRun,
  getNewsSourceConcurrency,
  isNewsSyncEnabled,
  shouldFetchNewsFullText
} from "./config/runtimeConfig";
import { createApp } from "./http/createApp";
import { OpenAiGateway } from "./llm/openAiGateway";
import { FirestoreNewsRepository } from "./news/firestoreNewsRepository";
import { NewsReadService } from "./news/newsReadService";
import { DEFAULT_NEWS_SOURCES } from "./news/newsSources";
import { NewsIngestionService } from "./news/newsIngestionService";
import { FirestoreRepository } from "./repositories/firestoreRepository";
import { logInfo } from "./utils/logging";
import { PrefillService } from "./services/prefillService";
import { PostGenerationService } from "./services/postGenerationService";

initializeApp();

const repository = new FirestoreRepository(getFirestore());
const gateway = new OpenAiGateway();
const postGenerationService = new PostGenerationService(repository, gateway);
const prefillService = new PrefillService(repository, gateway);
const authVerifier = new FirebaseAuthVerifier();
const newsRepository = new FirestoreNewsRepository(getFirestore());
const newsReadService = new NewsReadService(getFirestore());
const newsIngestionService = new NewsIngestionService({
  repository: newsRepository,
  sources: DEFAULT_NEWS_SOURCES
});
const app = createApp({
  repository,
  postGenerationService,
  prefillService,
  newsReadService,
  authVerifier,
  requireAuth: true,
  defaultPrefillPostsPerMode: getDefaultPrefillPostsPerMode()
});

export const api = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    minInstances: 1,
    // Prototype scale target: support bursty feed generation with up to ~10 concurrent users.
    concurrency: 20,
    maxInstances: 10
  },
  app
);

export const onAuthUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const postsPerMode = getDefaultPrefillPostsPerMode();
  await repository.getOrCreateUser({
    userId: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null
  });
  await prefillService.ensureUserPrefillsFromCommonDataset({
    userId: user.uid,
    postsPerMode
  });
});

export const syncNewsEvery3Hours = onSchedule(
  {
    region: "us-central1",
    schedule: "every 3 hours",
    timeZone: "Etc/UTC",
    timeoutSeconds: 60,
    memory: "512MiB",
    maxInstances: 1,
    retryCount: 0
  },
  async () => {
    if (!isNewsSyncEnabled()) {
      logInfo("news.sync.scheduler.disabled", { schedule: "every 3 hours" });
      return;
    }

    const startedAtMs = Date.now();
    const result = await newsIngestionService.syncAllSources({
      schedule: "every 3 hours",
      maxArticlesPerSource: getNewsMaxArticlesPerSource(),
      sourceConcurrency: getNewsSourceConcurrency(),
      feedTimeoutMs: getNewsFeedTimeoutMs(),
      articleTimeoutMs: getNewsArticleTimeoutMs(),
      articleConcurrency: getNewsArticleConcurrency(),
      fetchFullText: shouldFetchNewsFullText(),
      maxSourcesPerRun: getNewsMaxSourcesPerRun(),
      userAgent: getNewsCrawlerUserAgent(),
      deadlineMs: startedAtMs + 57_000
    });

    logInfo("news.sync.scheduler.complete", {
      run_id: result.runId,
      duration_ms: result.completedAtMs - result.startedAtMs,
      source_count: result.sourceResults.length,
      total_fetched: result.totalFetchedCount,
      total_inserted: result.totalInsertedCount,
      total_updated: result.totalUpdatedCount
    });
  }
);
