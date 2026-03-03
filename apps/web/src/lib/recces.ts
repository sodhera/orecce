export type RecceKind = "author" | "topic";
export type RecceCategoryKey =
    | "authors"
    | "business"
    | "technology"
    | "thinking"
    | "culture"
    | "life"
    | "science";

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

export const PAUL_GRAHAM_RECCE_ID = "paul_graham";

export function isPaulGrahamAuthorName(name: string | null | undefined): boolean {
    return String(name ?? "").trim().toLowerCase() === "paul graham";
}

export function isPaulGrahamRecce(recce: Pick<Recce, "id" | "kind" | "name">): boolean {
    if (recce.kind !== "author") {
        return false;
    }

    const normalizedId = String(recce.id ?? "").trim().toLowerCase();
    if (normalizedId === PAUL_GRAHAM_RECCE_ID) {
        return true;
    }

    return isPaulGrahamAuthorName(recce.name);
}

export const RECCE_CATEGORY_ORDER: RecceCategoryKey[] = [
    "authors",
    "business",
    "technology",
    "thinking",
    "culture",
    "life",
    "science",
];

export const RECCE_CATEGORY_LABELS: Record<RecceCategoryKey, string> = {
    authors: "Authors",
    business: "Business & Startups",
    technology: "Technology & AI",
    thinking: "Thinking & Decisions",
    culture: "Culture & Ideas",
    life: "Life & Performance",
    science: "Science & History",
};

const TOPIC_CATEGORY_BY_NAME: Record<string, RecceCategoryKey> = {
    "Artificial Intelligence": "technology",
    "Business & Strategy": "business",
    "Communication & Writing": "thinking",
    "Creativity & Art": "culture",
    "Culture & Society": "culture",
    "Decision Making & Mental Models": "thinking",
    "Economics & Markets": "business",
    "Happiness & Well-Being": "life",
    "Health & Fitness": "life",
    "History & Biography": "science",
    "Human Nature": "thinking",
    "Investing & Capital Allocation": "business",
    "Leadership & Management": "business",
    "Learning & Skill Acquisition": "thinking",
    "Media & Commentary": "culture",
    "Performance & High Achievement": "life",
    Philosophy: "culture",
    "Product & Innovation": "business",
    "Productivity & Execution": "business",
    "Psychology & Human Behavior": "thinking",
    "Reading & Books": "thinking",
    "Science & Scientific Thinking": "science",
    "Startups & Venture Capital": "business",
    "Technology & Programming": "technology",
    "Thinking & Numeracy": "thinking",
};

export function getRecceCategoryKey(recce: Pick<Recce, "kind" | "name">): RecceCategoryKey {
    if (recce.kind === "author") {
        return "authors";
    }
    return TOPIC_CATEGORY_BY_NAME[recce.name] ?? "culture";
}
