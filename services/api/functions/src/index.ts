import { initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
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
  getSportsRefreshConcurrency,
  getSportsRefreshMaxUsers,
  isNewsSyncEnabled,
  isSportsRefreshSchedulerEnabled,
  shouldFetchNewsFullText
} from "./config/runtimeConfig";
import { createApp } from "./http/createApp";
import { OpenAiGateway } from "./llm/openAiGateway";
import { FirestoreNewsRepository } from "./news/firestoreNewsRepository";
import { NewsReadService } from "./news/newsReadService";
import { DEFAULT_NEWS_SOURCES } from "./news/newsSources";
import { NewsIngestionService } from "./news/newsIngestionService";
import { SportsNewsService } from "./news/sportsNewsService";
import { parseSportId, SPORT_IDS } from "./news/sportsNewsSources";
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

async function listSportsSchedulerUserIds(maxUsers: number): Promise<string[]> {
  const db = getFirestore();
  const collection = db.collection("users");
  const userIds = new Set<string>();
  const pageSize = Math.min(250, Math.max(1, maxUsers));
  let lastDocId: string | null = null;

  while (userIds.size < maxUsers) {
    let query = collection.orderBy(FieldPath.documentId()).limit(pageSize);
    if (lastDocId) {
      query = query.startAfter(lastDocId);
    }

    const snap = await query.get();
    if (snap.empty) {
      break;
    }

    for (const doc of snap.docs) {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const authUidRaw = typeof data.authUid === "string" ? data.authUid.trim() : "";
      const userId = authUidRaw || doc.id;
      if (!userId || userId === "common_prefill_dataset") {
        continue;
      }
      userIds.add(userId);
      if (userIds.size >= maxUsers) {
        break;
      }
    }

    lastDocId = snap.docs[snap.docs.length - 1]?.id ?? null;
    if (snap.size < pageSize) {
      break;
    }
  }

  return Array.from(userIds);
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const bounded = Math.max(1, Math.min(concurrency, items.length || 1));
  let cursor = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      await worker(items[index]);
    }
  };

  await Promise.all(Array.from({ length: bounded }, () => runWorker()));
}

export const api = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    // Keep warm capacity at zero to avoid ongoing compute charges.
    minInstances: 0,
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

export const prewarmSportsNewsEvery12Hours = onSchedule(
  {
    region: "us-central1",
    schedule: "every 12 hours",
    timeZone: "Etc/UTC",
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
    retryCount: 0
  },
  async () => {
    if (!isSportsRefreshSchedulerEnabled()) {
      logInfo("news.sports.refresh.scheduler.disabled", { schedule: "every 12 hours" });
      return;
    }

    const startedAtMs = Date.now();
    const maxUsers = getSportsRefreshMaxUsers();
    const concurrency = getSportsRefreshConcurrency();
    const userIds = await listSportsSchedulerUserIds(maxUsers);
    const jobs = userIds.flatMap((userId) =>
      SPORT_IDS.map((sport) => ({
        userId,
        sport
      }))
    );

    let queuedCount = 0;
    let failedCount = 0;

    await runWithConcurrency(jobs, concurrency, async (job) => {
      try {
        await userSportsNewsService.requestRefresh(job.userId, job.sport);
        queuedCount += 1;
      } catch (error) {
        failedCount += 1;
        logError("news.sports.refresh.scheduler.enqueue_failed", {
          user_id: job.userId,
          sport: job.sport,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    logInfo("news.sports.refresh.scheduler.complete", {
      schedule: "every 12 hours",
      duration_ms: Date.now() - startedAtMs,
      user_count: userIds.length,
      sport_count: SPORT_IDS.length,
      queued_count: queuedCount,
      failed_count: failedCount
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
    const sport = parseSportId(String(data.sport ?? ""));

    if (status !== "queued" || !userId || !sport) {
      return;
    }

    const claimed = await userSportsNewsRepository.claimRefreshForUser(userId, sport);
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
      await userSportsNewsRepository.finishRefreshForUser(userId, sport, {
        success: true
      });
      logInfo("news.sports.refresh.job.complete", {
        user_id: userId,
        sport
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await userSportsNewsRepository.finishRefreshForUser(userId, sport, {
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
