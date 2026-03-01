import { z } from "zod";
import { ANALYTICS_PLATFORMS } from "../analytics/types";
import { FEED_MODES, FEEDBACK_TYPES, POST_LENGTHS } from "../types/domain";

export const generatePostRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(128).optional(),
  mode: z.enum(FEED_MODES),
  profile: z.string().trim().min(2).max(200),
  length: z.enum(POST_LENGTHS).default("short")
});

export const listPostsRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(128).optional(),
  mode: z.enum(FEED_MODES),
  profile: z.string().trim().min(2).max(200),
  page_size: z.number().int().min(1).max(50).default(10),
  cursor: z.string().trim().min(1).optional()
});

export const setPromptPreferencesSchema = z.object({
  user_id: z.string().trim().min(1).max(128).optional(),
  biography_instructions: z.string().max(3000).optional(),
  niche_instructions: z.string().max(3000).optional()
});

export const feedbackRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(128).optional(),
  post_id: z.string().trim().min(1).max(120),
  feedback_type: z.enum(FEEDBACK_TYPES)
});

export const listFeedbackRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(128).optional(),
  post_id: z.string().trim().min(1).max(120).optional(),
  page_size: z.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).optional()
});

export const updateUserProfileSchema = z.object({
  profile: z.object({
    displayName: z.string().trim().min(1).max(120).nullable().optional(),
    photoURL: z.string().trim().url().nullable().optional()
  })
});

export const regeneratePrefillsRequestSchema = z.object({
  posts_per_mode: z.number().int().min(1).max(60).optional()
});

export const recommendReccesRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(128).optional(),
  author_id: z.string().trim().min(1).max(120).default("paul_graham"),
  limit: z.number().int().min(1).max(30).default(12),
  seed_post_id: z.string().trim().min(3).max(220).optional(),
  recent_post_ids: z.array(z.string().trim().min(3).max(220)).max(100).optional(),
  exclude_post_ids: z.array(z.string().trim().min(3).max(220)).max(100).optional()
});

export const reccesInteractionRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(128).optional(),
  post_id: z.string().trim().min(3).max(220),
  slide_flip_count: z.number().int().min(1).max(100),
  max_slide_index: z.number().int().min(0).max(200).optional(),
  slide_count: z.number().int().min(1).max(200).optional()
});

export const analyticsEventSchema = z.object({
  event_id: z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9._:-]+$/),
  event_name: z.string().trim().min(3).max(120).regex(/^[a-z0-9_]+$/),
  platform: z.enum(ANALYTICS_PLATFORMS),
  surface: z.string().trim().min(1).max(80).optional(),
  occurred_at_ms: z.number().int().min(1),
  session_id: z.string().trim().min(1).max(200).optional(),
  anonymous_id: z.string().trim().min(1).max(200).optional(),
  device_id: z.string().trim().min(1).max(200).optional(),
  app_version: z.string().trim().min(1).max(80).optional(),
  route_name: z.string().trim().min(1).max(200).optional(),
  request_id: z.string().trim().min(1).max(200).optional(),
  properties: z.record(z.string(), z.unknown()).default({})
});

export const analyticsBatchRequestSchema = z.object({
  events: z.array(analyticsEventSchema).min(1).max(50)
});
