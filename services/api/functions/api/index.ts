import "dotenv/config";
import { createApp } from "../src/http/createApp";
import { SupabaseAuthVerifier } from "../src/auth/supabaseAuthVerifier";
import { AI_NEWS_ENABLED } from "../src/config/features";
import { getDefaultPrefillPostsPerMode } from "../src/config/runtimeConfig";
import { getSupabaseClient } from "../src/db/supabase";
import { OpenAiGateway } from "../src/llm/openAiGateway";
import { PostgresReccesRepository } from "../src/recces/postgresReccesRepository";
import { PostgresReccesUserProfileRepository } from "../src/recces/postgresReccesUserProfileRepository";
import { SportsNewsService } from "../src/news/sportsNewsService";
import { PostgresUserSportsNewsRepository } from "../src/news/postgresUserSportsNewsRepository";
import { UserSportsNewsService } from "../src/news/userSportsNewsService";
import { PostgresRepository } from "../src/repositories/postgresRepository";
import { PostGenerationService } from "../src/services/postGenerationService";
import { PrefillService } from "../src/services/prefillService";
import { ReccesRecommendationService } from "../src/services/reccesRecommendationService";

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

export default app;
