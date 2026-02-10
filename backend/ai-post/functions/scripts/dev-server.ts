import { createApp } from "../src/http/createApp";
import { OpenAiGateway } from "../src/llm/openAiGateway";
import { PostGenerationService } from "../src/services/postGenerationService";
import { loadDotEnv } from "./loadDotEnv";
import { InMemoryRepository } from "./inMemoryRepository";

loadDotEnv();

const port = Number(process.env.DEV_PORT ?? "8787");
if (Number.isNaN(port) || port <= 0) {
  throw new Error("Invalid DEV_PORT. Use a valid integer port.");
}

const repository = new InMemoryRepository();
const gateway = new OpenAiGateway();
const postGenerationService = new PostGenerationService(repository, gateway);
const app = createApp({ repository, postGenerationService });

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Local dev server listening on http://127.0.0.1:${port}`);
  // eslint-disable-next-line no-console
  console.log("Endpoints: /health, /v1/posts/generate, /v1/posts/list, /v1/posts/feedback, /v1/posts/feedback/list");
});

