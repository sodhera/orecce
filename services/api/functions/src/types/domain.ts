export const FEED_MODES = ["BIOGRAPHY", "TRIVIA", "NICHE"] as const;
export type FeedMode = (typeof FEED_MODES)[number];

export const POST_LENGTHS = ["short", "medium"] as const;
export type PostLength = (typeof POST_LENGTHS)[number];

export const FEEDBACK_TYPES = ["upvote", "downvote", "skip"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const CONFIDENCE_VALUES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE_VALUES)[number];

export interface GeneratedPost {
  title: string;
  body: string;
  post_type: string;
  tags: string[];
  confidence: Confidence;
  uncertainty_note: string | null;
}

export interface PromptPreferences {
  biographyInstructions: string;
  nicheInstructions: string;
  updatedAtMs?: number;
}

export interface StoredPost extends GeneratedPost {
  id: string;
  userId: string;
  mode: FeedMode;
  profile: string;
  profileKey: string;
  length: PostLength;
  createdAtMs: number;
}

export interface StoredFeedback {
  id: string;
  userId: string;
  postId: string;
  type: FeedbackType;
  createdAtMs: number;
}

export interface ListPostsResult {
  items: StoredPost[];
  nextCursor: string | null;
}
