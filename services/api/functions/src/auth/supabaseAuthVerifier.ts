import { SupabaseClient } from "@supabase/supabase-js";
import { AuthIdentity, AuthVerifier } from "./firebaseAuthVerifier";

/**
 * Verifies Supabase JWT access tokens.
 *
 * Uses `supabase.auth.getUser(token)` which validates the JWT signature
 * server-side and returns the authenticated user.
 */
export class SupabaseAuthVerifier implements AuthVerifier {
    constructor(private readonly supabase: SupabaseClient) { }

    async verifyBearerToken(token: string): Promise<AuthIdentity> {
        const { data, error } = await this.supabase.auth.getUser(token);

        if (error || !data.user) {
            throw new Error(
                error?.message ?? "Unable to verify Supabase access token."
            );
        }

        const user = data.user;
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

        return {
            uid: user.id,
            email: typeof user.email === "string" ? user.email : null,
            displayName:
                typeof meta.full_name === "string"
                    ? meta.full_name
                    : typeof meta.name === "string"
                        ? meta.name
                        : typeof meta.display_name === "string"
                            ? meta.display_name
                            : null,
            photoURL:
                typeof meta.avatar_url === "string"
                    ? meta.avatar_url
                    : typeof meta.picture === "string"
                        ? meta.picture
                        : null
        };
    }
}
