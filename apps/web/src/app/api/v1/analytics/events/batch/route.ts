import { NextRequest } from "next/server";
import { authenticateOptional, ok, withErrorHandler } from "@/app/api/middleware";
import { getDeps } from "@/app/api/init";
import { analyticsBatchRequestSchema } from "@orecce/api-core/src/validation/requestValidation";
import { ApiError } from "@orecce/api-core/src/types/errors";
import { logError } from "@orecce/api-core/src/utils/logging";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const identity = await authenticateOptional(req);
    const body = await req.json();
    const parsed = analyticsBatchRequestSchema.safeParse(body);
    if (!parsed.success) {
        throw new ApiError(400, "bad_request", "Invalid analytics batch payload.", parsed.error.flatten());
    }

    const { repository } = getDeps();
    try {
        await repository.saveAnalyticsEvents({
            userId: identity?.uid ?? null,
            events: parsed.data.events.map((event) => ({
                eventId: event.event_id,
                eventName: event.event_name,
                platform: event.platform,
                surface: event.surface,
                occurredAtMs: event.occurred_at_ms,
                sessionId: event.session_id,
                anonymousId: event.anonymous_id,
                deviceId: event.device_id,
                appVersion: event.app_version,
                routeName: event.route_name,
                requestId: event.request_id,
                properties: event.properties,
            })),
        });
        return ok({ accepted_count: parsed.data.events.length });
    } catch (error) {
        logError("web.analytics.batch.persist_failed", {
            event_count: parsed.data.events.length,
            user_id: identity?.uid ?? null,
            error: error instanceof Error ? error.message : String(error),
        });
        return ok({
            accepted_count: 0,
            dropped_count: parsed.data.events.length,
            degraded: true,
        });
    }
});
