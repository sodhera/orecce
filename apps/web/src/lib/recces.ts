export type RecceKind = "author" | "topic";

export interface Recce {
    id: string;
    key: string;
    kind: RecceKind;
    name: string;
    bio: string | null;
    avatarUrl: string | null;
    websiteUrl: string | null;
}

export function buildRecceKey(kind: RecceKind, id: string): string {
    return `${kind}:${id}`;
}
