import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getDefaultPrefillPostsPerMode } from "../src/config/runtimeConfig";
import { OpenAiGateway } from "../src/llm/openAiGateway";
import { FirestoreRepository } from "../src/repositories/firestoreRepository";
import { PrefillService } from "../src/services/prefillService";
import { loadDotEnv } from "./loadDotEnv";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
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

function parseEmailList(value: string | undefined): string[] {
  if (!value) {
    return ["demo1@orecce.local", "demo2@orecce.local"];
  }
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  npm --prefix functions run seed:emulator -- --emails demo1@orecce.local,demo2@orecce.local",
      "",
      "Options:",
      "  --project-id <id>         Firebase project id (default: ai-post-dev)",
      "  --emails <csv>            Comma-separated emulator auth users",
      "  --password <value>        Emulator password for all seeded users",
      "  --posts-per-mode <n>      Generic prefill post count per mode",
      "  --firestore-host <host>   Default: 127.0.0.1:8080",
      "  --auth-host <host>        Default: 127.0.0.1:9099"
    ].join("\n")
  );
}

async function ensureAuthUser(email: string, password: string): Promise<{ uid: string; email: string }> {
  const auth = getAuth();
  try {
    const existing = await auth.getUserByEmail(email);
    return { uid: existing.uid, email: existing.email ?? email };
  } catch {
    const created = await auth.createUser({
      email,
      password,
      emailVerified: true
    });
    return { uid: created.uid, email: created.email ?? email };
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const projectId = String(args["project-id"] ?? process.env.FIREBASE_PROJECT_ID ?? "ai-post-dev");
  const firestoreHost = String(args["firestore-host"] ?? process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080");
  const authHost = String(args["auth-host"] ?? process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099");
  const password = String(args.password ?? process.env.EMULATOR_DEMO_PASSWORD ?? "Passw0rd!");
  const postsPerModeRaw = Number(args["posts-per-mode"] ?? String(getDefaultPrefillPostsPerMode()));
  const postsPerMode = Number.isFinite(postsPerModeRaw) ? Math.max(1, Math.min(60, Math.floor(postsPerModeRaw))) : 8;
  const emails = parseEmailList(typeof args.emails === "string" ? args.emails : undefined);

  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;

  if (!getApps().length) {
    initializeApp({ projectId });
  }

  const repository = new FirestoreRepository(getFirestore());
  const gateway = new OpenAiGateway();
  const prefillService = new PrefillService(repository, gateway);

  // eslint-disable-next-line no-console
  console.log(`Seeding emulator project "${projectId}" using model "${process.env.OPENAI_MODEL ?? "default"}"...`);
  // eslint-disable-next-line no-console
  console.log(`Auth emulator: ${authHost} | Firestore emulator: ${firestoreHost}`);

  const commonSummary = await prefillService.ensureCommonDataset(postsPerMode);
  // eslint-disable-next-line no-console
  console.log(
    [
      "Common dataset ready",
      `  posts: ${commonSummary.postCount}`,
      `  chunks: ${commonSummary.chunkCount}`,
      `  approx_bytes: ${commonSummary.totalBytes}`
    ].join("\n")
  );

  for (const email of emails) {
    const authUser = await ensureAuthUser(email, password);
    await repository.getOrCreateUser({
      userId: authUser.uid,
      email: authUser.email,
      displayName: email.split("@")[0]
    });

    const summary = await prefillService.ensureUserPrefillsFromCommonDataset({
      userId: authUser.uid,
      postsPerMode,
      forceReplace: true
    });

    // eslint-disable-next-line no-console
    console.log(
      [
        `Seeded ${email}`,
        `  uid: ${authUser.uid}`,
        `  posts: ${summary.postCount}`,
        `  chunks: ${summary.chunkCount}`,
        `  approx_bytes: ${summary.totalBytes}`
      ].join("\n")
    );
  }

  // eslint-disable-next-line no-console
  console.log(`\nDone. Emulator login password for seeded users: ${password}`);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
