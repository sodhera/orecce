/**
 * Standalone Express server entrypoint for non-Firebase deployment (e.g. Cloud Run).
 * Uses Supabase Postgres repositories and Supabase JWT auth verification.
 *
 * Usage:
 *   cp .env.example .env  # fill in your keys
 *   npm run dev:supabase
 */
import "dotenv/config";
import { createApp } from "./http/createApp";
import { SupabaseAuthVerifier } from "./auth/supabaseAuthVerifier";
import { AI_NEWS_ENABLED } from "./config/features";
import { getDefaultPrefillPostsPerMode } from "./config/runtimeConfig";
import { getSupabaseClient } from "./db/supabase";
import { OpenAiGateway } from "./llm/openAiGateway";
import { PostgresNewsRepository } from "./news/postgresNewsRepository";
import { DEFAULT_NEWS_SOURCES } from "./news/newsSources";
import { NewsIngestionService } from "./news/newsIngestionService";
import { PostgresReccesRepository } from "./recces/postgresReccesRepository";
import { PostgresReccesUserProfileRepository } from "./recces/postgresReccesUserProfileRepository";
import { SportsNewsService } from "./news/sportsNewsService";
import { PostgresUserSportsNewsRepository } from "./news/postgresUserSportsNewsRepository";
import { UserSportsNewsService } from "./news/userSportsNewsService";
import { PostgresRepository } from "./repositories/postgresRepository";
import { PostGenerationService } from "./services/postGenerationService";
import { PrefillService } from "./services/prefillService";
import { ReccesRecommendationService } from "./services/reccesRecommendationService";
import { logInfo } from "./utils/logging";

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
