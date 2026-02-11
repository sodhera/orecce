import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as functionsV1 from "firebase-functions/v1";
import { onRequest } from "firebase-functions/v2/https";
import { FirebaseAuthVerifier } from "./auth/firebaseAuthVerifier";
import { getDefaultPrefillPostsPerMode } from "./config/runtimeConfig";
import { createApp } from "./http/createApp";
import { OpenAiGateway } from "./llm/openAiGateway";
import { FirestoreRepository } from "./repositories/firestoreRepository";
import { PrefillService } from "./services/prefillService";
import { PostGenerationService } from "./services/postGenerationService";

initializeApp();

const repository = new FirestoreRepository(getFirestore());
const gateway = new OpenAiGateway();
const postGenerationService = new PostGenerationService(repository, gateway);
const prefillService = new PrefillService(repository, gateway);
const authVerifier = new FirebaseAuthVerifier();
const app = createApp({
  repository,
  postGenerationService,
  prefillService,
  authVerifier,
  requireAuth: true,
  defaultPrefillPostsPerMode: getDefaultPrefillPostsPerMode()
});

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

export const onAuthUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const postsPerMode = getDefaultPrefillPostsPerMode();
  await repository.getOrCreateUser({
    userId: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null
  });
  await prefillService.ensureUserPrefillsFromCommonDataset({
    userId: user.uid,
    postsPerMode
  });
});
