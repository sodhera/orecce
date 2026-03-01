import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforceCostRateLimit,
  enforceRequestRateLimit,
  resetRateLimitStateForTests
} from "@orecce/api-core/src/security/rateLimit";

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    vi.useRealTimers();
  });

  it("blocks requests after the configured request budget is exhausted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));

    enforceRequestRateLimit({
      scope: "test:requests",
      actorId: "user-1",
      windowMs: 60_000,
      maxRequests: 2,
      code: "rate_limited",
      message: "Too many requests."
    });
    enforceRequestRateLimit({
      scope: "test:requests",
      actorId: "user-1",
      windowMs: 60_000,
      maxRequests: 2,
      code: "rate_limited",
      message: "Too many requests."
    });

    expect(() =>
      enforceRequestRateLimit({
        scope: "test:requests",
        actorId: "user-1",
        windowMs: 60_000,
        maxRequests: 2,
        code: "rate_limited",
        message: "Too many requests."
      })
    ).toThrow(/Too many requests/);
  });

  it("blocks costs after the configured budget is exhausted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));

    enforceCostRateLimit({
      scope: "test:cost",
      actorId: "user-1",
      windowMs: 60_000,
      maxCost: 10,
      cost: 6,
      code: "budget_limited",
      message: "Budget exceeded."
    });

    expect(() =>
      enforceCostRateLimit({
        scope: "test:cost",
        actorId: "user-1",
        windowMs: 60_000,
        maxCost: 10,
        cost: 5,
        code: "budget_limited",
        message: "Budget exceeded."
      })
    ).toThrow(/Budget exceeded/);
  });
});
