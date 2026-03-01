import { ApiError } from "../types/errors";

interface RequestBucket {
  timestampsMs: number[];
}

interface CostEvent {
  atMs: number;
  cost: number;
}

interface CostBucket {
  events: CostEvent[];
}

export interface RequestRateLimitOptions {
  scope: string;
  actorId: string;
  windowMs: number;
  maxRequests: number;
  status?: number;
  code: string;
  message: string;
}

export interface CostRateLimitOptions {
  scope: string;
  actorId: string;
  windowMs: number;
  maxCost: number;
  cost: number;
  status?: number;
  code: string;
  message: string;
}

const requestBuckets = new Map<string, RequestBucket>();
const costBuckets = new Map<string, CostBucket>();

function buildBucketKey(scope: string, actorId: string): string {
  return `${scope}::${actorId}`;
}

function pruneRequestBucket(bucket: RequestBucket, nowMs: number, windowMs: number): void {
  bucket.timestampsMs = bucket.timestampsMs.filter((timestampMs) => nowMs - timestampMs < windowMs);
}

function pruneCostBucket(bucket: CostBucket, nowMs: number, windowMs: number): void {
  bucket.events = bucket.events.filter((event) => nowMs - event.atMs < windowMs);
}

function getActorId(actorId: string): string {
  return String(actorId ?? "").trim();
}

export function enforceRequestRateLimit(options: RequestRateLimitOptions): void {
  const actorId = getActorId(options.actorId);
  if (!actorId) {
    return;
  }

  const nowMs = Date.now();
  const key = buildBucketKey(options.scope, actorId);
  const bucket = requestBuckets.get(key) ?? { timestampsMs: [] };
  pruneRequestBucket(bucket, nowMs, options.windowMs);

  if (bucket.timestampsMs.length >= options.maxRequests) {
    throw new ApiError(options.status ?? 429, options.code, options.message);
  }

  bucket.timestampsMs.push(nowMs);
  requestBuckets.set(key, bucket);
}

export function enforceCostRateLimit(options: CostRateLimitOptions): void {
  const actorId = getActorId(options.actorId);
  if (!actorId) {
    return;
  }

  const nowMs = Date.now();
  const key = buildBucketKey(options.scope, actorId);
  const bucket = costBuckets.get(key) ?? { events: [] };
  pruneCostBucket(bucket, nowMs, options.windowMs);

  const nextCost = Math.max(0, Math.floor(options.cost));
  const usedCost = bucket.events.reduce((sum, event) => sum + event.cost, 0);
  if (usedCost + nextCost > options.maxCost) {
    throw new ApiError(options.status ?? 429, options.code, options.message);
  }

  bucket.events.push({ atMs: nowMs, cost: nextCost });
  costBuckets.set(key, bucket);
}

export function resetRateLimitStateForTests(): void {
  requestBuckets.clear();
  costBuckets.clear();
}
