import { FeedMode, PostLength } from "../types/domain";

export interface PrefillBlueprintEntry {
  mode: FeedMode;
  profile: string;
  length: PostLength;
  count: number;
}

export const DEFAULT_PROFILE_BY_MODE: Record<FeedMode, string> = {
  BIOGRAPHY: "Steve Jobs",
  TRIVIA: "science",
  NICHE: "startup culture"
};

export function buildDefaultPrefillBlueprint(postsPerMode: number): PrefillBlueprintEntry[] {
  return [
    {
      mode: "BIOGRAPHY",
      profile: DEFAULT_PROFILE_BY_MODE.BIOGRAPHY,
      length: "short",
      count: postsPerMode
    },
    {
      mode: "TRIVIA",
      profile: DEFAULT_PROFILE_BY_MODE.TRIVIA,
      length: "short",
      count: postsPerMode
    },
    {
      mode: "NICHE",
      profile: DEFAULT_PROFILE_BY_MODE.NICHE,
      length: "short",
      count: postsPerMode
    }
  ];
}
