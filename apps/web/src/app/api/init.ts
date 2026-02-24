/**
 * Shared singleton that initialises all Supabase-backed services.
 * Every Next.js API route imports `deps` from here.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SupabaseAuthVerifier } from "@orecce/api-core/src/auth/supabaseAuthVerifier";
import { AI_NEWS_ENABLED } from "@orecce/api-core/src/config/features";
import { getDefaultPrefillPostsPerMode } from "@orecce/api-core/src/config/runtimeConfig";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import { PostgresReccesRepository } from "@orecce/api-core/src/recces/postgresReccesRepository";
import { PostgresReccesUserProfileRepository } from "@orecce/api-core/src/recces/postgresReccesUserProfileRepository";
import { SportsNewsService } from "@orecce/api-core/src/news/sportsNewsService";
import { PostgresUserSportsNewsRepository } from "@orecce/api-core/src/news/postgresUserSportsNewsRepository";
import { UserSportsNewsService } from "@orecce/api-core/src/news/userSportsNewsService";
import { PostgresRepository } from "@orecce/api-core/src/repositories/postgresRepository";
import { PostGenerationService } from "@orecce/api-core/src/services/postGenerationService";
import { PrefillService } from "@orecce/api-core/src/services/prefillService";
import { ReccesRecommendationService } from "@orecce/api-core/src/services/reccesRecommendationService";

function getSupabase(): SupabaseClient {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url || !key) {
        throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }
    return createClient(url, key);
}

let _deps: ReturnType<typeof buildDeps> | null = null;

function buildDeps() {
    const supabase = getSupabase();
    const repository = new PostgresRepository(supabase);
    const gateway = new OpenAiGateway();
    const postGenerationService = new PostGenerationService(repository, gateway);
    const prefillService = new PrefillService(repository, gateway);
    const authVerifier = new SupabaseAuthVerifier(supabase);
    const reccesRepository = new PostgresReccesRepository(supabase);
    const reccesUserProfileRepository = new PostgresReccesUserProfileRepository(supabase);
    const reccesRecommendationService = new ReccesRecommendationService(
        reccesRepository,
        repository,
        reccesUserProfileRepository
    );
    const sportsNewsService = new SportsNewsService();
    const userSportsNewsRepository = new PostgresUserSportsNewsRepository(supabase);
    const userSportsNewsService = new UserSportsNewsService({
        sportsNewsService,
        repository: userSportsNewsRepository
    });

    return {
        supabase,
        repository,
        postGenerationService,
        prefillService,
        authVerifier,
        reccesRecommendationService,
        sportsNewsService,
        userSportsNewsService,
        defaultPrefillPostsPerMode: getDefaultPrefillPostsPerMode(),
        isAiNewsEnabled: AI_NEWS_ENABLED
    };
}

export function getDeps() {
    if (!_deps) {
        _deps = buildDeps();
    }
    return _deps;
}
