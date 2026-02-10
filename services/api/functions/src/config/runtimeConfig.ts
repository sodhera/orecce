import * as functionsV1 from "firebase-functions/v1";

function normalizeSecret(rawValue: string | undefined): string {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function readFirebaseConfig(): Record<string, unknown> {
  try {
    return (functionsV1.config?.() ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getNestedConfigString(path: string[]): string | undefined {
  const config = readFirebaseConfig();
  let cursor: unknown = config;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" && cursor.trim() ? cursor.trim() : undefined;
}

export function getOpenAiApiKey(): string {
  return (
    normalizeSecret(process.env.OPENAI_API_KEY) ||
    normalizeSecret(process.env.OPENAI_KEY) ||
    normalizeSecret(getNestedConfigString(["openai", "key"])) ||
    ""
  );
}

export function getOpenAiModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    getNestedConfigString(["openai", "model"]) ||
    "gpt-5-mini"
  );
}

export function getOpenAiBaseUrl(): string {
  return process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
}

export function getGenerationTemperature(): number {
  return 0.3;
}

function envFlagTrue(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function isMockLlmEnabled(): boolean {
  return envFlagTrue(process.env.MOCK_LLM_OVERRIDE) || envFlagTrue(process.env.MOCK_LLM);
}
