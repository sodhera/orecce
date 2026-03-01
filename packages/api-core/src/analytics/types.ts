export const ANALYTICS_PLATFORMS = ["web", "mobile", "api"] as const;

export type AnalyticsPlatform = (typeof ANALYTICS_PLATFORMS)[number];

export interface AnalyticsEventInput {
  eventId: string;
  eventName: string;
  platform: AnalyticsPlatform;
  surface?: string | null;
  occurredAtMs: number;
  sessionId?: string | null;
  anonymousId?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
  routeName?: string | null;
  requestId?: string | null;
  properties?: Record<string, unknown>;
}

export interface AnalyticsEventRecord extends AnalyticsEventInput {
  userId?: string | null;
  receivedAtMs: number;
}
