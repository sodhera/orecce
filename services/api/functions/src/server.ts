/**
 * Standalone Express server entrypoint for local Supabase-backed API runs.
 *
 * Usage:
 *   cp .env.example .env  # fill in your keys
 *   npm run dev:supabase
 */
import "dotenv/config";
import { createApp } from "@orecce/api-core/src/http/createApp";
import { SupabaseAuthVerifier } from "@orecce/api-core/src/auth/supabaseAuthVerifier";
import { AI_NEWS_ENABLED } from "@orecce/api-core/src/config/features";
import { getDefaultPrefillPostsPerMode } from "@orecce/api-core/src/config/runtimeConfig";
import { getSupabaseClient } from "@orecce/api-core/src/db/supabase";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import { PostgresNewsRepository } from "@orecce/api-core/src/news/postgresNewsRepository";
import { DEFAULT_NEWS_SOURCES } from "@orecce/api-core/src/news/newsSources";
import { NewsIngestionService } from "@orecce/api-core/src/news/newsIngestionService";
import { PostgresReccesRepository } from "@orecce/api-core/src/recces/postgresReccesRepository";
import { PostgresReccesUserProfileRepository } from "@orecce/api-core/src/recces/postgresReccesUserProfileRepository";
import { SportsNewsService } from "@orecce/api-core/src/news/sportsNewsService";
import { PostgresUserSportsNewsRepository } from "@orecce/api-core/src/news/postgresUserSportsNewsRepository";
import { UserSportsNewsService } from "@orecce/api-core/src/news/userSportsNewsService";
import { PostgresRepository } from "@orecce/api-core/src/repositories/postgresRepository";
import { PostGenerationService } from "@orecce/api-core/src/services/postGenerationService";
import { PrefillService } from "@orecce/api-core/src/services/prefillService";
import { ReccesRecommendationService } from "@orecce/api-core/src/services/reccesRecommendationService";
import { logInfo } from "@orecce/api-core/src/utils/logging";

const supabase = getSupabaseClient();

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

const app = createApp({
    repository,
    postGenerationService,
    prefillService,
    reccesRecommendationService,
    sportsNewsService,
    userSportsNewsService,
    authVerifier,
    requireAuth: true,
    defaultPrefillPostsPerMode: getDefaultPrefillPostsPerMode(),
    isAiNewsEnabled: AI_NEWS_ENABLED
});

const port = Number(process.env.PORT ?? 8080);

app.listen(port, () => {
    logInfo("server.started", { port, mode: "supabase" });
});
