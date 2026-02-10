export function normalizeProfileKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function countWords(text: string): number {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length;
}
