import { z } from "zod";
import { FEED_MODES, FEEDBACK_TYPES, POST_LENGTHS } from "../types/domain";

export const generatePostRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(100),
  mode: z.enum(FEED_MODES),
  profile: z.string().trim().min(2).max(200),
  length: z.enum(POST_LENGTHS).default("short")
});

export const listPostsRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(100),
  mode: z.enum(FEED_MODES),
  profile: z.string().trim().min(2).max(200),
  page_size: z.number().int().min(1).max(50).default(10),
  cursor: z.string().trim().min(1).optional()
});

export const setPromptPreferencesSchema = z.object({
  user_id: z.string().trim().min(1).max(100),
  biography_instructions: z.string().max(3000).optional(),
  niche_instructions: z.string().max(3000).optional()
});

export const feedbackRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(100),
  post_id: z.string().trim().min(1).max(120),
  feedback_type: z.enum(FEEDBACK_TYPES)
});

export const listFeedbackRequestSchema = z.object({
  user_id: z.string().trim().min(1).max(100),
  post_id: z.string().trim().min(1).max(120).optional(),
  page_size: z.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).optional()
});
