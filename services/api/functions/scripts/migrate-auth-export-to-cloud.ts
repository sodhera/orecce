import fs from "fs";
import path from "path";
import { cert, initializeApp } from "firebase-admin/app";
import { Auth, CreateRequest, UpdateRequest, getAuth } from "firebase-admin/auth";
import { Firestore, Timestamp, getFirestore } from "firebase-admin/firestore";

type Args = Record<string, string | boolean>;

interface ExportProviderInfo {
  providerId?: string;
}

interface ExportUser {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  disabled?: boolean;
  displayName?: string;
  photoUrl?: string;
  providerUserInfo?: ExportProviderInfo[];
}

interface AuthExportPayload {
  users?: ExportUser[];
}

interface ServiceAccountPayload {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

interface MigrationSummary {
  created: number;
  updated: number;
  skipped: number;
  userDocsCreated: number;
  failed: number;
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
      // Ignore non-JSON or invalid JSON files.
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

function getDefaultAuthExportPath(): string {
  return path.resolve(__dirname, "../../../../infra/local/.firebase-emulator-data/auth_export/accounts.json");
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  npm --prefix functions run migrate:auth:cloud",
      "",
      "Options:",
      "  --auth-export <path>        Path to emulator auth export accounts.json",
      "  --service-account <path>    Target Firebase service account JSON",
      "  --default-password <value>  Password assigned to password-based users (default: Passw0rd!)",
      "  --update-existing <bool>    Update existing users by UID (default: true)",
      "  --ensure-user-docs <bool>   Create missing users/{uid} docs in Firestore (default: true)",
      "  --dry-run                   Print intended operations without writing"
    ].join("\n")
  );
}

function hasPasswordProvider(user: ExportUser): boolean {
  return Boolean(user.providerUserInfo?.some((provider) => provider.providerId === "password"));
}

function sanitizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function makeCreateRequest(user: ExportUser, defaultPassword: string): CreateRequest | null {
  const uid = sanitizeOptionalString(user.localId);
  if (!uid) {
    return null;
  }

  const email = sanitizeOptionalString(user.email);
  const request: CreateRequest = { uid };

  if (email) {
    request.email = email;
  }
  if (typeof user.emailVerified === "boolean") {
    request.emailVerified = user.emailVerified;
  }
  if (typeof user.disabled === "boolean") {
    request.disabled = user.disabled;
  }

  const displayName = sanitizeOptionalString(user.displayName);
  if (displayName) {
    request.displayName = displayName;
  }

  const photoURL = sanitizeOptionalString(user.photoUrl);
  if (photoURL) {
    request.photoURL = photoURL;
  }

  if (hasPasswordProvider(user)) {
    if (!email) {
      return null;
    }
    request.password = defaultPassword;
  }

  return request;
}

function makeUpdateRequest(user: ExportUser): UpdateRequest {
  const payload: UpdateRequest = {};

  const email = sanitizeOptionalString(user.email);
  if (email) {
    payload.email = email;
  }
  if (typeof user.emailVerified === "boolean") {
    payload.emailVerified = user.emailVerified;
  }
  if (typeof user.disabled === "boolean") {
    payload.disabled = user.disabled;
  }

  const displayName = sanitizeOptionalString(user.displayName);
  if (displayName) {
    payload.displayName = displayName;
  }

  const photoURL = sanitizeOptionalString(user.photoUrl);
  if (photoURL) {
    payload.photoURL = photoURL;
  }

  return payload;
}

async function ensureUserDocument(input: {
  db: Firestore;
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  dryRun: boolean;
}): Promise<boolean> {
  const ref = input.db.collection("users").doc(input.uid);
  const existing = await ref.get();
  if (existing.exists) {
    return false;
  }

  const now = Timestamp.now();
  if (!input.dryRun) {
    await ref.set({
      email: input.email ?? null,
      displayName: input.displayName ?? null,
      photoURL: input.photoURL ?? null,
      prefillStatus: "empty",
      prefillPostCount: 0,
      prefillChunkCount: 0,
      prefillBytes: 0,
      prefillUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
      prefillPointers: {}
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[user-doc] ${input.uid} created`);
  return true;
}

async function migrateUsers(
  auth: Auth,
  db: Firestore,
  users: ExportUser[],
  defaultPassword: string,
  updateExisting: boolean,
  dryRun: boolean,
  ensureUserDocs: boolean
): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    userDocsCreated: 0,
    failed: 0
  };

  for (const user of users) {
    const uid = sanitizeOptionalString(user.localId);
    if (!uid) {
      summary.skipped += 1;
      // eslint-disable-next-line no-console
      console.log("Skipping export entry with missing uid.");
      continue;
    }

    try {
      const existing = await auth.getUser(uid);
      if (!updateExisting) {
        summary.skipped += 1;
        // eslint-disable-next-line no-console
        console.log(`Skipping existing user ${uid} (${existing.email ?? "no-email"}).`);
        continue;
      }

      const updatePayload = makeUpdateRequest(user);
      if (!Object.keys(updatePayload).length) {
        summary.skipped += 1;
        // eslint-disable-next-line no-console
        console.log(`Skipping ${uid}: no mutable fields to update.`);
        continue;
      }

      if (!dryRun) {
        await auth.updateUser(uid, updatePayload);
      }
      summary.updated += 1;
      // eslint-disable-next-line no-console
      console.log(`[updated] ${uid} ${updatePayload.email ?? existing.email ?? ""}`.trim());
      if (ensureUserDocs) {
        const createdDoc = await ensureUserDocument({
          db,
          uid,
          email: updatePayload.email ?? existing.email ?? sanitizeOptionalString(user.email),
          displayName: updatePayload.displayName ?? existing.displayName ?? sanitizeOptionalString(user.displayName),
          photoURL: updatePayload.photoURL ?? existing.photoURL ?? sanitizeOptionalString(user.photoUrl),
          dryRun
        });
        if (createdDoc) {
          summary.userDocsCreated += 1;
        }
      }
      continue;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code && code !== "auth/user-not-found") {
        summary.failed += 1;
        // eslint-disable-next-line no-console
        console.error(`[failed] ${uid}:`, error);
        continue;
      }
    }

    const createPayload = makeCreateRequest(user, defaultPassword);
    if (!createPayload) {
      summary.skipped += 1;
      // eslint-disable-next-line no-console
      console.log(`Skipping ${uid}: invalid create payload (likely password user without email).`);
      continue;
    }

    try {
      if (!dryRun) {
        await auth.createUser(createPayload);
      }
      summary.created += 1;
      // eslint-disable-next-line no-console
      console.log(`[created] ${uid} ${createPayload.email ?? ""}`.trim());
      if (ensureUserDocs) {
        const createdDoc = await ensureUserDocument({
          db,
          uid,
          email: createPayload.email,
          displayName: createPayload.displayName,
          photoURL: createPayload.photoURL,
          dryRun
        });
        if (createdDoc) {
          summary.userDocsCreated += 1;
        }
      }
    } catch (error: unknown) {
      summary.failed += 1;
      // eslint-disable-next-line no-console
      console.error(`[failed] ${uid}:`, error);
    }
  }

  return summary;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const authExportPath = resolvePath(asString(args["auth-export"]) ?? getDefaultAuthExportPath());
  if (!fs.existsSync(authExportPath)) {
    throw new Error(`Auth export file not found: ${authExportPath}`);
  }

  const serviceAccountPath = discoverServiceAccountPath(asString(args["service-account"]));
  const defaultPassword = asString(args["default-password"]) ?? "Passw0rd!";
  const updateExisting = asBoolean(args["update-existing"], true);
  const ensureUserDocs = asBoolean(args["ensure-user-docs"], true);
  const dryRun = asBoolean(args["dry-run"], false);

  const authPayload = readJsonFile<AuthExportPayload>(authExportPath);
  const users = Array.isArray(authPayload.users) ? authPayload.users : [];
  if (!users.length) {
    // eslint-disable-next-line no-console
    console.log("No users found in auth export. Nothing to migrate.");
    return;
  }

  const serviceAccount = readJsonFile<ServiceAccountPayload>(serviceAccountPath);
  const projectId = sanitizeOptionalString(serviceAccount.project_id);
  const clientEmail = sanitizeOptionalString(serviceAccount.client_email);
  const privateKey = sanitizeOptionalString(serviceAccount.private_key);
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(`Invalid service account file: ${serviceAccountPath}`);
  }

  const app = initializeApp(
    {
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      }),
      projectId
    },
    `auth-migration-${Date.now()}`
  );

  // eslint-disable-next-line no-console
  console.log(
    [
      "Starting auth migration",
      `  export_file: ${authExportPath}`,
      `  service_account: ${serviceAccountPath}`,
      `  target_project: ${projectId}`,
      `  users_in_export: ${users.length}`,
      `  update_existing: ${String(updateExisting)}`,
      `  ensure_user_docs: ${String(ensureUserDocs)}`,
      `  dry_run: ${String(dryRun)}`
    ].join("\n")
  );

  const summary = await migrateUsers(
    getAuth(app),
    getFirestore(app),
    users,
    defaultPassword,
    updateExisting,
    dryRun,
    ensureUserDocs
  );
  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      "Auth migration complete",
      `  created: ${summary.created}`,
      `  updated: ${summary.updated}`,
      `  skipped: ${summary.skipped}`,
      `  user_docs_created: ${summary.userDocsCreated}`,
      `  failed: ${summary.failed}`
    ].join("\n")
  );
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
