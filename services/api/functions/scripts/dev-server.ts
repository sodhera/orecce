import { getDefaultPrefillPostsPerMode } from "@orecce/api-core/src/config/runtimeConfig";
import { createApp } from "@orecce/api-core/src/http/createApp";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import { PrefillService } from "@orecce/api-core/src/services/prefillService";
import { PostGenerationService } from "@orecce/api-core/src/services/postGenerationService";
import { ReccesRecommendationService } from "@orecce/api-core/src/services/reccesRecommendationService";
import { InMemoryReccesUserProfileRepository } from "@orecce/api-core/src/recces/reccesUserProfileRepository";
import { loadDotEnv } from "./loadDotEnv";
import { InMemoryRepository } from "./inMemoryRepository";
import { StaticReccesRepository } from "./staticReccesRepository";

loadDotEnv();

const port = Number(process.env.DEV_PORT ?? "8787");
if (Number.isNaN(port) || port <= 0) {
  throw new Error("Invalid DEV_PORT. Use a valid integer port.");
}

const repository = new InMemoryRepository();
const gateway = new OpenAiGateway();
const postGenerationService = new PostGenerationService(repository, gateway);
const prefillService = new PrefillService(repository, gateway);
const reccesRecommendationService = new ReccesRecommendationService(
  new StaticReccesRepository(),
  repository,
  new InMemoryReccesUserProfileRepository()
);
const app = createApp({
  repository,
  postGenerationService,
  prefillService,
  reccesRecommendationService,
  requireAuth: false,
  defaultPrefillPostsPerMode: getDefaultPrefillPostsPerMode()
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Local dev server listening on http://127.0.0.1:${port}`);
  // eslint-disable-next-line no-console
  console.log(
    "Endpoints: /health, /v1/users/me, /v1/posts/list, /v1/posts/generate, /v1/posts/feedback, /v1/posts/feedback/list, /v1/recommendations/recces"
  );
});
