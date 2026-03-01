import { enforceCostRateLimit, enforceRequestRateLimit } from "@orecce/api-core/src/security/rateLimit";

export function enforceWebRequestRateLimit(input: {
  scope: string;
  actorId: string;
  windowMs: number;
  maxRequests: number;
  code: string;
  message: string;
}): void {
  enforceRequestRateLimit({
    scope: `web:${input.scope}`,
    actorId: input.actorId,
    windowMs: input.windowMs,
    maxRequests: input.maxRequests,
    code: input.code,
    message: input.message
  });
}

export function enforceWebCostRateLimit(input: {
  scope: string;
  actorId: string;
  windowMs: number;
  maxCost: number;
  cost: number;
  code: string;
  message: string;
}): void {
  enforceCostRateLimit({
    scope: `web:${input.scope}`,
    actorId: input.actorId,
    windowMs: input.windowMs,
    maxCost: input.maxCost,
    cost: input.cost,
    code: input.code,
    message: input.message
  });
}
