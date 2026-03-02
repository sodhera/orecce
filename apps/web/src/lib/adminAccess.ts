import "server-only";

import { ApiError } from "@orecce/api-core/src/types/errors";
import type { AuthIdentity } from "@orecce/api-core/src/auth/types";

function parseAllowlistEnv(raw: string | undefined): Set<string> {
    return new Set(
        (raw ?? "")
            .split(",")
            .map((entry) => entry.trim().toLowerCase())
            .filter(Boolean),
    );
}

function getAdminEmails(): Set<string> {
    return parseAllowlistEnv(process.env.ADMIN_USER_EMAILS);
}

function getAdminUserIds(): Set<string> {
    return parseAllowlistEnv(process.env.ADMIN_USER_IDS);
}

export function isAdminIdentity(identity: AuthIdentity): boolean {
    const adminUserIds = getAdminUserIds();
    if (adminUserIds.has(identity.uid.trim().toLowerCase())) {
        return true;
    }

    const email = identity.email?.trim().toLowerCase();
    if (!email) {
        return false;
    }

    return getAdminEmails().has(email);
}

export function assertAdminIdentity(identity: AuthIdentity): void {
    if (isAdminIdentity(identity)) {
        return;
    }

    throw new ApiError(
        403,
        "admin_access_required",
        "You do not have access to this admin surface.",
    );
}
