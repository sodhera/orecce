import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as functionsV1 from "firebase-functions/v1";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
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
import { SportsNewsService } from "./news/sportsNewsService";
import { FirestoreUserSportsNewsRepository } from "./news/userSportsNewsRepository";
import { UserSportsNewsService } from "./news/userSportsNewsService";
import { FirestoreRepository } from "./repositories/firestoreRepository";
import { logError, logInfo } from "./utils/logging";
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
const sportsNewsService = new SportsNewsService();
const userSportsNewsRepository = new FirestoreUserSportsNewsRepository(getFirestore());
const userSportsNewsService = new UserSportsNewsService({
  sportsNewsService,
  repository: userSportsNewsRepository
});
const newsIngestionService = new NewsIngestionService({
  repository: newsRepository,
  sources: DEFAULT_NEWS_SOURCES
});
const app = createApp({
  repository,
  postGenerationService,
  prefillService,
  newsReadService,
  sportsNewsService,
  userSportsNewsService,
  authVerifier,
  requireAuth: true,
  defaultPrefillPostsPerMode: getDefaultPrefillPostsPerMode()
});

export const api = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    minInstances: 0,
    // Keep warm capacity at zero and favor high per-instance concurrency to minimize idle spend.
    concurrency: 40,
    maxInstances: 3
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
    schedule: "every 12 hours",
    timeZone: "Etc/UTC",
    timeoutSeconds: 45,
    memory: "256MiB",
    maxInstances: 1,
    retryCount: 0
  },
  async () => {
    if (!isNewsSyncEnabled()) {
      logInfo("news.sync.scheduler.disabled", { schedule: "every 12 hours" });
      return;
    }

    const startedAtMs = Date.now();
    const result = await newsIngestionService.syncAllSources({
      schedule: "every 12 hours",
      maxArticlesPerSource: getNewsMaxArticlesPerSource(),
      sourceConcurrency: getNewsSourceConcurrency(),
      feedTimeoutMs: getNewsFeedTimeoutMs(),
      articleTimeoutMs: getNewsArticleTimeoutMs(),
      articleConcurrency: getNewsArticleConcurrency(),
      fetchFullText: shouldFetchNewsFullText(),
      maxSourcesPerRun: getNewsMaxSourcesPerRun(),
      userAgent: getNewsCrawlerUserAgent(),
      deadlineMs: startedAtMs + 42_000
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

export const processSportsRefreshJob = onDocumentWritten(
  {
    region: "us-central1",
    document: "userSportsNewsRefreshJobs/{jobId}",
    timeoutSeconds: 300,
    memory: "256MiB",
    maxInstances: 1
  },
  async (event) => {
    const startedAtMs = Date.now();
    const after = event.data?.after;
    if (!after?.exists) {
      return;
    }

    const data = (after.data() ?? {}) as Record<string, unknown>;
    const status = String(data.status ?? "");
    const userId = String(data.userId ?? "").trim();
    const sport = String(data.sport ?? "").trim().toLowerCase();

    if (status !== "queued" || !userId || sport !== "football") {
      return;
    }

    const claimed = await userSportsNewsRepository.claimRefreshForUser(userId, "football");
    if (!claimed) {
      return;
    }

    try {
      await userSportsNewsService.refreshUserStories({
        userId,
        sport,
        limit: 60,
        userAgent: "OrecceSportsAgent/1.0 (+https://orecce.local/news-sports)",
        feedTimeoutMs: 8_000,
        articleTimeoutMs: 12_000,
        deadlineMs: startedAtMs + 270_000
      });
      await userSportsNewsRepository.finishRefreshForUser(userId, "football", {
        success: true
      });
      logInfo("news.sports.refresh.job.complete", {
        user_id: userId,
        sport
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await userSportsNewsRepository.finishRefreshForUser(userId, "football", {
        success: false,
        errorMessage: message
      });
      logError("news.sports.refresh.job.failed", {
        user_id: userId,
        sport,
        message
      });
    }
  }
);
