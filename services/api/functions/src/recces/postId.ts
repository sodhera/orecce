export interface ParsedReccesPostId {
  authorId: string;
  essayId: string;
  postIndex: number;
}

export function buildReccesPostId(authorId: string, essayId: string, postIndex: number): string {
  return `${authorId}:${essayId}:${postIndex}`;
}

export function parseReccesPostId(value: string): ParsedReccesPostId | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^([^:]+):([^:]+):(\d+)$/);
  if (!match) {
    return null;
  }
  const postIndex = Number(match[3]);
  if (!Number.isFinite(postIndex) || postIndex < 0) {
    return null;
  }
  return {
    authorId: match[1],
    essayId: match[2],
    postIndex: Math.floor(postIndex)
  };
}
