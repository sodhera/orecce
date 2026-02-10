import cors from "cors";
import { randomUUID } from "crypto";
import express, { NextFunction, Request, Response } from "express";
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
  setPromptPreferencesSchema
} from "../validation/requestValidation";

interface CreateAppDeps {
  repository: Repository;
  postGenerationService: PostGenerationService;
}

function writeSse(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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
      user_id: payload.user_id ?? null,
      mode: payload.mode ?? null,
      profile: payload.profile ?? null,
      length: payload.length ?? null
    };
  }

  if (path === "/v1/posts/list") {
    return {
      user_id: payload.user_id ?? null,
      mode: payload.mode ?? null,
      profile: payload.profile ?? null,
      page_size: payload.page_size ?? null,
      has_cursor: Boolean(payload.cursor)
    };
  }

  if (path === "/v1/posts/feedback") {
    return {
      user_id: payload.user_id ?? null,
      post_id: payload.post_id ?? null,
      feedback_type: payload.feedback_type ?? null
    };
  }

  if (path === "/v1/posts/feedback/list") {
    return {
      user_id: payload.user_id ?? null,
      post_id: payload.post_id ?? null,
      page_size: payload.page_size ?? null,
      has_cursor: Boolean(payload.cursor)
    };
  }

  if (path === "/v1/prompt-preferences/set") {
    const biography = String(payload.biography_instructions ?? "");
    const niche = String(payload.niche_instructions ?? "");
    return {
      user_id: payload.user_id ?? null,
      biography_instructions_chars: biography.length,
      niche_instructions_chars: niche.length
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

export function createApp(deps: CreateAppDeps): express.Express {
  const app = express();

  // v0 development CORS setup for direct mobile/web testing.
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

  // Auth seam for v1: currently no auth enforced.
  app.use((_req, _res, next) => {
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post(
    "/v1/prompt-preferences/set",
    withAsync(async (req, res) => {
      const parsed = setPromptPreferencesSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid prompt preference payload.", parsed.error.flatten());
      }

      const body = parsed.data;
      const preferences = await deps.repository.setPromptPreferences(body.user_id, {
        biographyInstructions: body.biography_instructions,
        nicheInstructions: body.niche_instructions
      });

      res.json({ ok: true, data: preferences });
    })
  );

  app.get(
    "/v1/prompt-preferences",
    withAsync(async (req, res) => {
      const userId = String(req.query.user_id ?? "").trim();
      if (!userId) {
        throw new ApiError(400, "bad_request", "Missing user_id query param.");
      }

      const preferences = await deps.repository.getPromptPreferences(userId);
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

      const body = parsed.data;
      const post = await deps.postGenerationService.generateNextPost({
        userId: body.user_id,
        mode: body.mode,
        profile: body.profile,
        length: body.length
      });

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
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    writeSse(res, "start", {
      request_id: requestId,
      user_id: body.user_id,
      mode: body.mode,
      profile: body.profile,
      length: body.length
    });

    try {
      const post = await deps.postGenerationService.generateNextPostStream(
        {
          userId: body.user_id,
          mode: body.mode,
          profile: body.profile,
          length: body.length
        },
        (chunk) => {
          writeSse(res, "chunk", { delta: chunk });
        }
      );

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

      const body = parsed.data;
      const result = await deps.repository.listPosts({
        userId: body.user_id,
        mode: body.mode,
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

      const body = parsed.data;
      const feedback = await deps.repository.saveFeedback({
        userId: body.user_id,
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

      const body = parsed.data;
      const result = await deps.repository.listFeedback({
        userId: body.user_id,
        postId: body.post_id,
        pageSize: body.page_size,
        cursor: body.cursor
      });

      res.json({ ok: true, data: result });
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
