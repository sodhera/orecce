import fs from "fs";
import path from "path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getDefaultPrefillPostsPerMode } from "../src/config/runtimeConfig";
import { OpenAiGateway } from "../src/llm/openAiGateway";
import { FirestoreRepository } from "../src/repositories/firestoreRepository";
import { COMMON_PREFILL_DATASET_USER_ID, PrefillService } from "../src/services/prefillService";
import { loadDotEnv } from "./loadDotEnv";

type Args = Record<string, string | boolean>;

interface ServiceAccountPayload {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function asString(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function asBoolean(value: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

function resolvePath(rawPath: string): string {
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(process.cwd(), rawPath);
}

function readJsonFile<T>(filePath: string): T {
  const value = fs.readFileSync(filePath, "utf8");
  return JSON.parse(value) as T;
}

function sanitizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function findServiceAccountInDirectory(directoryPath: string): string | null {
  if (!fs.existsSync(directoryPath)) {
    return null;
  }

  const files = fs.readdirSync(directoryPath).filter((fileName) => fileName.endsWith(".json"));
  for (const fileName of files) {
    const fullPath = path.join(directoryPath, fileName);
    try {
      const parsed = readJsonFile<ServiceAccountPayload>(fullPath);
      if (
        parsed.type === "service_account" &&
        parsed.project_id &&
        parsed.client_email &&
        parsed.private_key
      ) {
        return fullPath;
      }
    } catch {
      // Ignore non-JSON and invalid JSON files.
    }
  }

  return null;
}

function discoverServiceAccountPath(explicitPath?: string): string {
  if (explicitPath) {
    const resolved = resolvePath(explicitPath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    throw new Error(`Service account file not found: ${resolved}`);
  }

  const envCandidate = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? process.env.TARGET_SERVICE_ACCOUNT;
  if (envCandidate) {
    const resolved = resolvePath(envCandidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  const searchDirectories = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(__dirname, "../../../../"),
    path.resolve(__dirname, "../../../../../")
  ];
  for (const directoryPath of searchDirectories) {
    const found = findServiceAccountInDirectory(directoryPath);
    if (found) {
      return found;
    }
  }

  throw new Error(
    "Could not locate a Firebase service account JSON file. Pass --service-account <path> or set GOOGLE_APPLICATION_CREDENTIALS."
  );
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  npm --prefix functions run populate:common:cloud",
      "",
      "Options:",
      "  --service-account <path>  Target Firebase service account JSON",
      "  --posts-per-mode <n>      Prefill posts per mode (default: PREFILL_POSTS_PER_MODE or 8)",
      "  --force-regenerate <bool> Force regeneration even if common dataset already exists (default: false)",
      "  --mock-llm <bool>         Use mock LLM generation (default: false)"
    ].join("\n")
  );
}

async function main(): Promise<void> {
  loadDotEnv();

  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const serviceAccountPath = discoverServiceAccountPath(asString(args["service-account"]));
  const serviceAccount = readJsonFile<ServiceAccountPayload>(serviceAccountPath);
  const projectId = sanitizeOptionalString(serviceAccount.project_id);
  const clientEmail = sanitizeOptionalString(serviceAccount.client_email);
  const privateKey = sanitizeOptionalString(serviceAccount.private_key);
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(`Invalid service account file: ${serviceAccountPath}`);
  }

  const postsPerModeRaw = Number(asString(args["posts-per-mode"]) ?? String(getDefaultPrefillPostsPerMode()));
  const postsPerMode = Number.isFinite(postsPerModeRaw) ? Math.max(1, Math.min(60, Math.floor(postsPerModeRaw))) : 8;
  const forceRegenerate = asBoolean(args["force-regenerate"], false);
  const useMockLlm = asBoolean(args["mock-llm"], false);
  process.env.MOCK_LLM = String(useMockLlm);
  process.env.MOCK_LLM_OVERRIDE = String(useMockLlm);

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    }),
    projectId
  });

  const repository = new FirestoreRepository(getFirestore());
  const gateway = new OpenAiGateway();
  const prefillService = new PrefillService(repository, gateway);

  // eslint-disable-next-line no-console
  console.log(
    [
      "Populating cloud common prefill dataset",
      `  project: ${projectId}`,
      `  service_account: ${serviceAccountPath}`,
      `  user_id: ${COMMON_PREFILL_DATASET_USER_ID}`,
      `  posts_per_mode: ${postsPerMode}`,
      `  force_regenerate: ${String(forceRegenerate)}`,
      `  mock_llm: ${String(useMockLlm)}`
    ].join("\n")
  );

  const summary = forceRegenerate
    ? await prefillService.generateGenericPrefills({
      userId: COMMON_PREFILL_DATASET_USER_ID,
      postsPerMode
    })
    : await prefillService.ensureCommonDataset(postsPerMode);

  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      "Common prefill dataset ready",
      `  post_count: ${summary.postCount}`,
      `  chunk_count: ${summary.chunkCount}`,
      `  total_bytes: ${summary.totalBytes}`,
      `  generated_at_ms: ${summary.generatedAtMs}`
    ].join("\n")
  );
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
