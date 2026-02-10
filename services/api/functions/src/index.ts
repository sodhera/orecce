import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "./http/createApp";
import { OpenAiGateway } from "./llm/openAiGateway";
import { FirestoreRepository } from "./repositories/firestoreRepository";
import { PostGenerationService } from "./services/postGenerationService";

initializeApp();

const repository = new FirestoreRepository(getFirestore());
const gateway = new OpenAiGateway();
const postGenerationService = new PostGenerationService(repository, gateway);
const app = createApp({ repository, postGenerationService });

export const api = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    minInstances: 1,
    // Prototype scale target: support bursty feed generation with up to ~10 concurrent users.
    concurrency: 20,
    maxInstances: 10
  },
  app
);
