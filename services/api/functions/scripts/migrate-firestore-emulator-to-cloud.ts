import fs from "fs";
import net from "net";
import path from "path";
import { CollectionReference, DocumentData, Firestore } from "@google-cloud/firestore";

type Args = Record<string, string | boolean>;

interface ServiceAccountPayload {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

interface MigrationSummary {
  collectionsVisited: number;
  documentsRead: number;
  documentsWritten: number;
}

interface CopyContext {
  writer: FirestoreBatchWriter;
  summary: MigrationSummary;
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

function asBoundedInteger(value: string | boolean | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
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
      // Ignore invalid JSON files.
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

function parseCollectionList(raw: string | undefined): string[] | null {
  if (!raw) {
    return null;
  }
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function parseHostAndPort(sourceHost: string): { host: string; port: number } {
  const [hostPart, portPart] = sourceHost.split(":");
  const host = hostPart?.trim() || "127.0.0.1";
  const port = Number(portPart);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid source host/port: ${sourceHost}`);
  }
  return { host, port: Math.floor(port) };
}

async function assertTcpReachable(host: string, port: number, timeoutMs = 3000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    const onError = (error: Error) => {
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(timeoutMs);
    socket.once("error", onError);
    socket.once("timeout", () => onError(new Error(`Connection timeout to ${host}:${port}`)));
    socket.connect(port, host, () => {
      socket.end();
      resolve();
    });
  });
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  npm --prefix functions run migrate:firestore:cloud",
      "",
      "Options:",
      "  --source-host <host>          Firestore emulator host (default: 127.0.0.1:8080)",
      "  --source-project-id <id>      Emulator project id (default: ai-post-dev)",
      "  --target-project-id <id>      Cloud project id (default: from service account)",
      "  --service-account <path>      Target Firebase service account JSON",
      "  --collections <csv>           Restrict migration to specific collection ids",
      "  --batch-size <n>              Firestore batch size (default: 300, max: 400)",
      "  --dry-run                     Print intended operations without writing"
    ].join("\n")
  );
}

class FirestoreBatchWriter {
  private batch = this.targetDb.batch();
  private pendingWrites = 0;

  constructor(
    private readonly targetDb: Firestore,
    private readonly batchSize: number,
    private readonly dryRun: boolean,
    private readonly summary: MigrationSummary
  ) {}

  async setDocument(docPath: string, payload: DocumentData): Promise<void> {
    this.summary.documentsWritten += 1;
    if (this.dryRun) {
      return;
    }

    this.batch.set(this.targetDb.doc(docPath), payload, { merge: true });
    this.pendingWrites += 1;
    if (this.pendingWrites >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.dryRun || this.pendingWrites === 0) {
      return;
    }
    await this.batch.commit();
    this.batch = this.targetDb.batch();
    this.pendingWrites = 0;
  }
}

async function copyCollection(
  sourceCollection: CollectionReference<DocumentData>,
  targetCollectionPath: string,
  context: CopyContext
): Promise<void> {
  context.summary.collectionsVisited += 1;
  const snapshot = await sourceCollection.get();

  // eslint-disable-next-line no-console
  console.log(`[collection] ${targetCollectionPath} docs=${snapshot.size}`);

  for (const docSnapshot of snapshot.docs) {
    context.summary.documentsRead += 1;
    const docPath = `${targetCollectionPath}/${docSnapshot.id}`;
    await context.writer.setDocument(docPath, docSnapshot.data());

    const subCollections = await docSnapshot.ref.listCollections();
    for (const subCollection of subCollections) {
      const nestedTargetPath = `${docPath}/${subCollection.id}`;
      await copyCollection(subCollection, nestedTargetPath, context);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const sourceHost = asString(args["source-host"]) ?? "127.0.0.1:8080";
  const sourceProjectId = asString(args["source-project-id"]) ?? "ai-post-dev";
  const batchSize = asBoundedInteger(args["batch-size"], 300, 1, 400);
  const dryRun = asBoolean(args["dry-run"], false);
  const requestedCollections = parseCollectionList(asString(args.collections));

  const serviceAccountPath = discoverServiceAccountPath(asString(args["service-account"]));
  const serviceAccount = readJsonFile<ServiceAccountPayload>(serviceAccountPath);
  const defaultTargetProjectId = sanitizeOptionalString(serviceAccount.project_id);
  const targetProjectId = asString(args["target-project-id"]) ?? defaultTargetProjectId;
  if (!targetProjectId) {
    throw new Error("Missing target project id. Pass --target-project-id or use a valid service account JSON.");
  }

  const sourceDb = new Firestore({
    projectId: sourceProjectId,
    host: sourceHost,
    ssl: false
  });
  const targetDb = new Firestore({
    projectId: targetProjectId,
    keyFilename: serviceAccountPath
  });

  // eslint-disable-next-line no-console
  console.log(
    [
      "Starting Firestore migration",
      `  source: ${sourceProjectId} @ ${sourceHost}`,
      `  target: ${targetProjectId}`,
      `  service_account: ${serviceAccountPath}`,
      `  batch_size: ${batchSize}`,
      `  dry_run: ${String(dryRun)}`,
      `  collections: ${requestedCollections ? requestedCollections.join(", ") : "all"}`
    ].join("\n")
  );

  const sourceEndpoint = parseHostAndPort(sourceHost);
  await assertTcpReachable(sourceEndpoint.host, sourceEndpoint.port);

  const topCollections = requestedCollections
    ? requestedCollections.map((collectionId) => sourceDb.collection(collectionId))
    : await sourceDb.listCollections();

  if (!topCollections.length) {
    // eslint-disable-next-line no-console
    console.log("No source collections found. Nothing to migrate.");
    return;
  }

  const summary: MigrationSummary = {
    collectionsVisited: 0,
    documentsRead: 0,
    documentsWritten: 0
  };
  const writer = new FirestoreBatchWriter(targetDb, batchSize, dryRun, summary);
  const context: CopyContext = { writer, summary };

  for (const collectionRef of topCollections) {
    await copyCollection(collectionRef, collectionRef.id, context);
  }

  await writer.flush();

  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      "Firestore migration complete",
      `  collections_visited: ${summary.collectionsVisited}`,
      `  documents_read: ${summary.documentsRead}`,
      `  documents_written: ${summary.documentsWritten}`
    ].join("\n")
  );
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
    // eslint-disable-next-line no-console
    console.error("Could not connect to Firestore emulator. Start it first, then rerun this script.");
  }
  process.exitCode = 1;
});
