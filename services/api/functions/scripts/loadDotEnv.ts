import fs from "node:fs";
import path from "node:path";

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Minimal .env loader for local scripts (avoids adding dotenv to prod deps).
 * - Ignores blank lines and comments (# ...)
 * - Parses KEY=VALUE (first '=' wins)
 * - Does not overwrite existing env vars by default
 */
export function loadDotEnv(options?: { envPath?: string; override?: boolean }): void {
  const envPath = options?.envPath ?? path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1);
    if (!key) {
      continue;
    }

    if (!options?.override && typeof process.env[key] === "string" && process.env[key]?.length) {
      continue;
    }

    process.env[key] = stripQuotes(rawValue);
  }
}

