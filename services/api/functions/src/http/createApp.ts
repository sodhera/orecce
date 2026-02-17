import cors from "cors";
import { randomUUID } from "crypto";
import express, { NextFunction, Request, Response } from "express";
import { AuthIdentity, AuthVerifier } from "../auth/firebaseAuthVerifier";
import { NewsReadService } from "../news/newsReadService";
import { SportsNewsService } from "../news/sportsNewsService";
import { UserSportsNewsService } from "../news/userSportsNewsService";
import { PrefillService } from "../services/prefillService";
import { PostGenerationService } from "../services/postGenerationService";
import { Repository } from "../types/contracts";
import { ApiError } from "../types/errors";
import { logError, logInfo } from "../utils/logging";
import { normalizeProfileKey } from "../utils/text";
import {
  feedbackRequestSchema,
  generatePostRequestSchema,
  listFeedbackRequestSchema,
  listPostsRequestSchema,
  regeneratePrefillsRequestSchema,
  setPromptPreferencesSchema,
  updateUserProfileSchema
} from "../validation/requestValidation";

interface CreateAppDeps {
  repository: Repository;
  postGenerationService: PostGenerationService;
  prefillService?: PrefillService;
  newsReadService?: NewsReadService;
  sportsNewsService?: SportsNewsService;
  userSportsNewsService?: UserSportsNewsService;
  authVerifier?: AuthVerifier;
  requireAuth: boolean;
  defaultPrefillPostsPerMode: number;
}

function writeSse(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamTextInChunks(text: string, onChunk: (chunk: string) => void): void {
  const chunkSize = 70;
  for (let i = 0; i < text.length; i += chunkSize) {
    onChunk(text.slice(i, i + chunkSize));
  }
}

function sendApiError(res: Response, err: unknown, requestId?: string): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? null,
        request_id: requestId ?? null
      }
    });
    return;
  }

  if (err instanceof Error) {
    res.status(500).json({
      ok: false,
      error: {
        code: "internal_error",
        message: err.message,
        request_id: requestId ?? null
      }
    });
    return;
  }

  res.status(500).json({
    ok: false,
    error: {
      code: "internal_error",
      message: "Unknown server error.",
      request_id: requestId ?? null
    }
  });
}

function summarizeBody(path: string, body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as Record<string, unknown>;
  if (path === "/v1/posts/generate" || path === "/v1/posts/generate/stream") {
    return {
      mode: payload.mode ?? null,
      profile: payload.profile ?? null,
      length: payload.length ?? null
    };
  }

  if (path === "/v1/posts/list") {
    return {
      mode: payload.mode ?? null,
      profile: payload.profile ?? null,
      page_size: payload.page_size ?? null,
      has_cursor: Boolean(payload.cursor)
    };
  }

  if (path === "/v1/posts/feedback") {
    return {
      post_id: payload.post_id ?? null,
      feedback_type: payload.feedback_type ?? null
    };
  }

  if (path === "/v1/posts/feedback/list") {
    return {
      post_id: payload.post_id ?? null,
      page_size: payload.page_size ?? null,
      has_cursor: Boolean(payload.cursor)
    };
  }

  if (path === "/v1/prompt-preferences/set") {
    const biography = String(payload.biography_instructions ?? "");
    const niche = String(payload.niche_instructions ?? "");
    return {
      biography_instructions_chars: biography.length,
      niche_instructions_chars: niche.length
    };
  }

  if (path.startsWith("/v1/news/articles")) {
    return {
      source_id: (body as Record<string, unknown>).source_id ?? null
    };
  }

  return {
    keys: Object.keys(payload).slice(0, 20)
  };
}

function withAsync(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

function readBearerToken(req: Request): string {
  const raw = String(req.headers.authorization ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) {
    throw new ApiError(401, "missing_auth", "Missing Authorization bearer token.");
  }
  const token = raw.slice(7).trim();
  if (!token) {
    throw new ApiError(401, "missing_auth", "Authorization bearer token is empty.");
  }
  return token;
}

function getAuthIdentity(res: Response): AuthIdentity {
  const identity = res.locals.authIdentity as AuthIdentity | undefined;
  if (!identity?.uid) {
    throw new ApiError(401, "missing_auth", "Authenticated user is missing from request context.");
  }
  return identity;
}

function assertUserIdCompatible(candidateUserId: string | undefined, authUserId: string): void {
  if (!candidateUserId) {
    return;
  }
  if (candidateUserId !== authUserId) {
    throw new ApiError(403, "forbidden", "user_id does not match authenticated user.");
  }
}

function inferLocalUserId(req: Request): string {
  const fromBody =
    req.body && typeof req.body === "object" ? String((req.body as Record<string, unknown>).user_id ?? "").trim() : "";
  if (fromBody) {
    return fromBody;
  }
  const fromQuery = String(req.query.user_id ?? "").trim();
  if (fromQuery) {
    return fromQuery;
  }
  const fromParams = String(req.params.userId ?? "").trim();
  if (fromParams) {
    return fromParams;
  }
  return "local-user";
}

async function ensureUserHasPrefills(
  deps: CreateAppDeps,
  userId: string,
  email?: string | null
): Promise<void> {
  const user = await deps.repository.getOrCreateUser({ userId, email: email ?? null });
  if (user.prefillPostCount > 0 && user.prefillStatus === "ready") {
    return;
  }
  if (!deps.prefillService) {
    return;
  }
  await deps.prefillService.ensureUserPrefillsFromCommonDataset({
    userId,
    postsPerMode: deps.defaultPrefillPostsPerMode
  });
}

export function createApp(deps: CreateAppDeps): express.Express {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const requestIdHeader = req.headers["x-request-id"];
    const requestId =
      typeof requestIdHeader === "string" && requestIdHeader.trim() ? requestIdHeader.trim() : randomUUID();
    const startedAtMs = Date.now();

    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    logInfo("http.request.start", {
      request_id: requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      body: summarizeBody(req.path, req.body)
    });

    res.on("finish", () => {
      logInfo("http.request.finish", {
        request_id: requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - startedAtMs
      });
    });

    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    ["/v1", "/users"],
    withAsync(async (req, res, next) => {
      if (!deps.requireAuth) {
        const uid = inferLocalUserId(req);
        res.locals.authIdentity = {
          uid,
          email: null,
          displayName: null,
          photoURL: null
        } as AuthIdentity;
        next();
        return;
      }
      if (!deps.authVerifier) {
        throw new ApiError(500, "server_misconfigured", "Auth verifier is not configured.");
      }

      const token = readBearerToken(req);
      try {
        res.locals.authIdentity = await deps.authVerifier.verifyBearerToken(token);
      } catch (error) {
        throw new ApiError(
          401,
          "invalid_auth",
          "Unable to verify Firebase ID token.",
          error instanceof Error ? error.message : String(error)
        );
      }
      next();
    })
  );

  const getOrCreateCurrentUser = async (res: Response) => {
    const identity = getAuthIdentity(res);
    return deps.repository.getOrCreateUser({
      userId: identity.uid,
      email: identity.email,
      displayName: identity.displayName,
      photoURL: identity.photoURL
    });
  };

  const handleGetUser = withAsync(async (_req, res) => {
    const identity = getAuthIdentity(res);
    await ensureUserHasPrefills(deps, identity.uid, identity.email);
    const user = await deps.repository.getOrCreateUser({
      userId: identity.uid,
      email: identity.email,
      displayName: identity.displayName,
      photoURL: identity.photoURL
    });
    res.json({ ok: true, data: user });
  });

  app.get("/v1/users/me", handleGetUser);
  app.get(
    "/users/:userId",
    withAsync(async (req, res) => {
      const identity = getAuthIdentity(res);
      if (req.params.userId !== identity.uid) {
        throw new ApiError(403, "forbidden", "Cannot access another user's profile.");
      }
      await ensureUserHasPrefills(deps, identity.uid, identity.email);
      const user = await deps.repository.getOrCreateUser({
        userId: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        photoURL: identity.photoURL
      });
      res.json(user);
    })
  );

  const handlePatchUser = withAsync(async (req, res) => {
    const parsed = updateUserProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid user profile payload.", parsed.error.flatten());
    }

    const user = await getOrCreateCurrentUser(res);
    const profile = parsed.data.profile;
    const updated = await deps.repository.updateUserProfile(user.id, {
      displayName: profile.displayName,
      photoURL: profile.photoURL
    });
    res.json({ ok: true, data: updated });
  });

  app.patch("/v1/users/me", handlePatchUser);
  app.patch(
    "/users/:userId",
    withAsync(async (req, res, next) => {
      const identity = getAuthIdentity(res);
      if (req.params.userId !== identity.uid) {
        next(new ApiError(403, "forbidden", "Cannot update another user's profile."));
        return;
      }
      const parsed = updateUserProfileSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid user profile payload.", parsed.error.flatten());
      }
      await deps.repository.getOrCreateUser({
        userId: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        photoURL: identity.photoURL
      });
      const updated = await deps.repository.updateUserProfile(identity.uid, {
        displayName: parsed.data.profile.displayName,
        photoURL: parsed.data.profile.photoURL
      });
      res.json(updated);
    })
  );

  app.post(
    "/v1/users/me/prefills/regenerate",
    withAsync(async (req, res) => {
      const identity = getAuthIdentity(res);
      const parsed = regeneratePrefillsRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid prefill regeneration request.", parsed.error.flatten());
      }
      if (!deps.prefillService) {
        throw new ApiError(500, "server_misconfigured", "Prefill service is not configured.");
      }

      const summary = await deps.prefillService.regenerateCommonDatasetAndCopyToUser({
        userId: identity.uid,
        postsPerMode: parsed.data.posts_per_mode ?? deps.defaultPrefillPostsPerMode
      });
      const user = await deps.repository.getOrCreateUser({
        userId: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        photoURL: identity.photoURL
      });
      res.json({ ok: true, data: { user, summary } });
    })
  );

  app.post(
    "/v1/prompt-preferences/set",
    withAsync(async (req, res) => {
      const parsed = setPromptPreferencesSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid prompt preference payload.", parsed.error.flatten());
      }

      const identity = getAuthIdentity(res);
      const body = parsed.data;
      assertUserIdCompatible(body.user_id, identity.uid);

      const preferences = await deps.repository.setPromptPreferences(identity.uid, {
        biographyInstructions: body.biography_instructions,
        nicheInstructions: body.niche_instructions
      });

      res.json({ ok: true, data: preferences });
    })
  );

  app.get(
    "/v1/prompt-preferences",
    withAsync(async (req, res) => {
      const identity = getAuthIdentity(res);
      const queryUserId = String(req.query.user_id ?? "").trim();
      if (queryUserId && queryUserId !== identity.uid) {
        throw new ApiError(403, "forbidden", "user_id does not match authenticated user.");
      }

      const preferences = await deps.repository.getPromptPreferences(identity.uid);
      res.json({ ok: true, data: preferences });
    })
  );

  app.post(
    "/v1/posts/generate",
    withAsync(async (req, res) => {
      const parsed = generatePostRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid generate request.", parsed.error.flatten());
      }

      const identity = getAuthIdentity(res);
      const body = parsed.data;
      assertUserIdCompatible(body.user_id, identity.uid);

      await ensureUserHasPrefills(deps, identity.uid, identity.email);
      const post = await deps.repository.getNextPrefillPost({
        userId: identity.uid,
        mode: body.mode,
        profile: body.profile,
        profileKey: normalizeProfileKey(body.profile),
        length: body.length
      });
      if (!post) {
        throw new ApiError(404, "no_prefill_posts", "No prefilled posts available for this user/mode.");
      }

      res.json({ ok: true, data: post });
    })
  );

  app.post("/v1/posts/generate/stream", async (req, res, next) => {
    const parsed = generatePostRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      next(new ApiError(400, "bad_request", "Invalid generate request.", parsed.error.flatten()));
      return;
    }

    const body = parsed.data;
    const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : null;
    const identity = getAuthIdentity(res);
    try {
      assertUserIdCompatible(body.user_id, identity.uid);
      await ensureUserHasPrefills(deps, identity.uid, identity.email);
      const post = await deps.repository.getNextPrefillPost({
        userId: identity.uid,
        mode: body.mode,
        profile: body.profile,
        profileKey: normalizeProfileKey(body.profile),
        length: body.length
      });
      if (!post) {
        throw new ApiError(404, "no_prefill_posts", "No prefilled posts available for this user/mode.");
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      writeSse(res, "start", {
        request_id: requestId,
        mode: body.mode,
        profile: body.profile,
        length: body.length
      });
      streamTextInChunks(post.body, (chunk) => {
        writeSse(res, "chunk", { delta: chunk });
      });
      writeSse(res, "post", { ok: true, data: post });
      writeSse(res, "done", { ok: true });
      res.end();
    } catch (err) {
      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError(500, "internal_error", err instanceof Error ? err.message : "Unknown server error.");

      writeSse(res, "error", {
        ok: false,
        error: {
          code: apiError.code,
          message: apiError.message,
          details: apiError.details ?? null,
          request_id: requestId
        }
      });
      res.end();
    }
  });

  app.post(
    "/v1/posts/list",
    withAsync(async (req, res) => {
      const parsed = listPostsRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid list request.", parsed.error.flatten());
      }

      const identity = getAuthIdentity(res);
      const body = parsed.data;
      assertUserIdCompatible(body.user_id, identity.uid);

      // Do not block list requests on prefill generation. Prefills are created
      // during user bootstrap flows and can take longer than a feed request.
      // If prefill creation is still in progress, return currently available posts.
      const result = await deps.repository.listPosts({
        userId: identity.uid,
        mode: body.mode,
        profileRaw: body.profile,
        profileKey: normalizeProfileKey(body.profile),
        pageSize: body.page_size,
        cursor: body.cursor
      });

      res.json({ ok: true, data: result });
    })
  );

  app.post(
    "/v1/posts/feedback",
    withAsync(async (req, res) => {
      const parsed = feedbackRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid feedback request.", parsed.error.flatten());
      }

      const identity = getAuthIdentity(res);
      const body = parsed.data;
      assertUserIdCompatible(body.user_id, identity.uid);

      const feedback = await deps.repository.saveFeedback({
        userId: identity.uid,
        postId: body.post_id,
        type: body.feedback_type
      });

      res.json({ ok: true, data: feedback });
    })
  );

  app.post(
    "/v1/posts/feedback/list",
    withAsync(async (req, res) => {
      const parsed = listFeedbackRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid feedback list request.", parsed.error.flatten());
      }

      const identity = getAuthIdentity(res);
      const body = parsed.data;
      assertUserIdCompatible(body.user_id, identity.uid);

      const result = await deps.repository.listFeedback({
        userId: identity.uid,
        postId: body.post_id,
        pageSize: body.page_size,
        cursor: body.cursor
      });

      res.json({ ok: true, data: result });
    })
  );

  app.get(
    "/v1/news/sports/latest",
    withAsync(async (req, res) => {
      if (!deps.userSportsNewsService) {
        throw new ApiError(500, "server_misconfigured", "User sports news service is not configured.");
      }

      const sport = String(req.query.sport ?? "").trim();
      if (!sport) {
        throw new ApiError(400, "bad_request", "Missing required query param sport.");
      }
      const limitRaw = Number(req.query.limit ?? "8");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, Math.floor(limitRaw))) : 8;
      const refresh = String(req.query.refresh ?? "").trim().toLowerCase() === "true";
      const identity = getAuthIdentity(res);
      let refreshError: string | null = null;

      if (refresh) {
        try {
          await deps.userSportsNewsService.refreshUserStories({
            userId: identity.uid,
            sport,
            limit: 60,
            userAgent: "OrecceSportsAgent/1.0 (+https://orecce.local/news-sports)",
            feedTimeoutMs: 8_000,
            articleTimeoutMs: 12_000
          });
        } catch (error) {
          refreshError = error instanceof Error ? error.message : String(error);
          logError("news.sports.refresh.failed", {
            user_id: identity.uid,
            sport,
            message: refreshError
          });
        }
      }

      let data = await deps.userSportsNewsService.listUserStories(identity.uid, sport, limit);
      if (!data.stories.length) {
        try {
          await deps.userSportsNewsService.refreshUserStories({
            userId: identity.uid,
            sport,
            limit: 60,
            userAgent: "OrecceSportsAgent/1.0 (+https://orecce.local/news-sports)",
            feedTimeoutMs: 8_000,
            articleTimeoutMs: 12_000
          });
        } catch (error) {
          refreshError = refreshError ?? (error instanceof Error ? error.message : String(error));
          logError("news.sports.refresh.bootstrap_failed", {
            user_id: identity.uid,
            sport,
            message: refreshError
          });
        }
        data = await deps.userSportsNewsService.listUserStories(identity.uid, sport, limit);
      }

      res.json({
        ok: true,
        data,
        meta: {
          refreshError
        }
      });
    })
  );

  app.get(
    "/v1/news/sports/status",
    withAsync(async (req, res) => {
      if (!deps.userSportsNewsService) {
        throw new ApiError(500, "server_misconfigured", "User sports news service is not configured.");
      }
      const sport = String(req.query.sport ?? "").trim();
      if (!sport) {
        throw new ApiError(400, "bad_request", "Missing required query param sport.");
      }
      const identity = getAuthIdentity(res);
      const status = await deps.userSportsNewsService.getUserSyncState(identity.uid, sport);
      res.json({
        ok: true,
        data: status
      });
    })
  );

  app.get(
    "/v1/news/sources",
    withAsync(async (_req, res) => {
      if (!deps.newsReadService) {
        throw new ApiError(500, "server_misconfigured", "News read service is not configured.");
      }

      const sources = await deps.newsReadService.listSources();
      res.json({
        ok: true,
        data: {
          sources
        }
      });
    })
  );

  app.get(
    "/v1/news/articles",
    withAsync(async (req, res) => {
      if (!deps.newsReadService) {
        throw new ApiError(500, "server_misconfigured", "News read service is not configured.");
      }

      const sourceId = String(req.query.source_id ?? "").trim();
      if (!sourceId) {
        throw new ApiError(400, "bad_request", "Missing required query param source_id.");
      }
      const limitRaw = Number(req.query.limit ?? "30");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 30;

      const items = await deps.newsReadService.listArticlesBySource(sourceId, limit);
      res.json({
        ok: true,
        data: {
          items
        }
      });
    })
  );

  app.get(
    "/v1/news/articles/:articleId",
    withAsync(async (req, res) => {
      if (!deps.newsReadService) {
        throw new ApiError(500, "server_misconfigured", "News read service is not configured.");
      }

      const articleId = String(req.params.articleId ?? "").trim();
      if (!articleId) {
        throw new ApiError(400, "bad_request", "Missing required article id.");
      }

      const article = await deps.newsReadService.getArticleDetail(articleId);
      if (!article) {
        throw new ApiError(404, "not_found", "News article not found.");
      }
      res.json({
        ok: true,
        data: {
          article
        }
      });
    })
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;
    logError("http.request.error", {
      request_id: requestId ?? null,
      status: err instanceof ApiError ? err.status : 500,
      code: err instanceof ApiError ? err.code : "internal_error",
      message: err instanceof Error ? err.message : "Unknown server error.",
      details: err instanceof ApiError ? err.details ?? null : null
    });
    sendApiError(res, err, requestId);
  });

  return app;
}
