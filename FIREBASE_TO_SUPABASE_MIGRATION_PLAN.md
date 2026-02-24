# Firebase -> Supabase Migration Plan (Orecce Monorepo)

Last updated: 2026-02-24
Owner: Engineering
Scope: `apps/mobile`, `apps/web`, `services/api`

---

## 1) Executive Summary

This repo is currently tightly coupled to Firebase Auth + Firestore + Firebase Functions. The migration goal is to move identity and data to Supabase while keeping API behavior stable for both clients.

Recommended target architecture:

1. Use **Supabase Auth** for user sessions (email/password + Google OAuth).
2. Use **Supabase Postgres** for all Firestore data currently used by the API.
3. Keep a **Node/Express API runtime** (not Firebase Functions) for existing business logic.
4. Migrate on a staged rollout: schema first, backfill, dual-write, read cutover, Firebase decommission.

This plan intentionally preserves existing HTTP routes and payloads (`/v1/*`, `/users/:userId`) to reduce client risk.

---

## 2) Current State Inventory (From This Repo)

## 2.1 Firebase touchpoints in app clients

### Mobile (`apps/mobile`)

- Firebase client init: `apps/mobile/src/config/firebase.ts`
- Auth hooks:
  - `apps/mobile/src/hooks/useAuth.ts`
  - `apps/mobile/src/hooks/useGoogleAuth.ts`
  - `apps/mobile/src/hooks/useUser.ts`
- Firebase token attached to API requests:
  - `apps/mobile/src/services/api.ts`
  - `apps/mobile/src/screens/RssScreen.tsx`
  - `apps/mobile/src/screens/RssFeedDetailScreen.tsx`
  - `apps/mobile/src/screens/RssArticleScreen.tsx`
- Firebase profile/email verification usage:
  - `apps/mobile/src/screens/signup/SignupPasswordScreen.tsx`
  - `apps/mobile/src/screens/ProfileScreen.tsx`

### Web (`apps/web`)

- Firebase client init: `apps/web/src/lib/firebaseConfig.ts`
- Auth state + sign-in flows: `apps/web/src/context/AuthContext.tsx`
- Token use for API calls: `apps/web/src/lib/api.ts`

## 2.2 Firebase touchpoints in backend (`services/api`)

### Runtime/deploy

- Firebase config: `services/api/firebase.json`
- Firestore security rules: `services/api/firestore.rules`
- Firestore indexes: `services/api/firestore.indexes.json`
- CI deploy workflow: `.github/workflows/deploy-functions.yml`
- Cloud deploy script: `services/api/scripts/deploy-cloud.sh`

### Firebase SDK usage

- Firebase Admin + Functions entrypoint: `services/api/functions/src/index.ts`
- Firebase token verification: `services/api/functions/src/auth/firebaseAuthVerifier.ts`
- Firestore repositories:
  - `services/api/functions/src/repositories/firestoreRepository.ts`
  - `services/api/functions/src/news/firestoreNewsRepository.ts`
  - `services/api/functions/src/news/userSportsNewsRepository.ts`
  - `services/api/functions/src/recces/firestoreReccesRepository.ts`
  - `services/api/functions/src/recces/firestoreReccesUserProfileRepository.ts`
  - `services/api/functions/src/news/newsReadService.ts`

### Firebase-only scripts and local tooling

- Emulator startup: `services/api/scripts/start-emulators-local.sh`
- Emulator smoke test: `services/api/scripts/emulator-smoke.sh`
- Cloud migration scripts (emulator -> Firebase cloud):
  - `services/api/functions/scripts/migrate-auth-export-to-cloud.ts`
  - `services/api/functions/scripts/migrate-firestore-emulator-to-cloud.ts`

## 2.3 Firebase Functions/triggers currently used

From `services/api/functions/src/index.ts`:

1. `api` (HTTP function) for all REST routes.
2. `onAuthUserCreate` (Firebase Auth trigger) to bootstrap user/profile prefills.
3. `syncNewsEvery3Hours` (scheduler; currently configured every 12 hours).
4. `prewarmSportsNewsEvery12Hours` (scheduler).
5. `processSportsRefreshJob` (Firestore document trigger on `userSportsNewsRefreshJobs/{jobId}`).

## 2.4 Firestore collections currently in use

From repository code:

1. `users`
2. `promptPreferences`
3. `userPrefillChunks`
4. `posts` (legacy/secondary path)
5. `feedback`
6. `newsArticles`
7. `newsArticleTextChunks`
8. `newsSourceState`
9. `newsSyncRuns`
10. `userSportsNewsStories`
11. `userSportsNewsGameDrafts`
12. `userSportsNewsSyncState`
13. `userSportsNewsRefreshJobs`
14. `recces/blogs/{authorId}/{essayId}` (nested)
15. `userRecommendationProfiles`

---

## 3) Target Architecture

## 3.1 Core decisions

1. **Auth provider**: Supabase Auth replaces Firebase Auth.
2. **Primary data store**: Supabase Postgres replaces Firestore.
3. **API runtime**: move off Firebase Functions to a standard Node service (Cloud Run recommended).
4. **Contract stability**: keep current REST API shapes and paths to minimize app breakage.

## 3.2 Why this target

1. Existing API logic is TypeScript/Express and too large for a direct Deno Edge rewrite in one step.
2. Keeping route contracts stable isolates migration risk to auth/data layers.
3. Postgres provides explicit schema, indexing, transaction control, and easier long-term analytics.

## 3.3 What changes if we can treat API calls as effectively uncapped

Assumption for planning: we can safely increase API call volume after migration without Firebase-style function pressure.

### More stuff we can add

1. Finer-grained endpoints instead of coarse multipurpose calls (smaller payloads, more targeted cache keys).
2. More frequent refresh flows:
   - news sync cadence can move from every 12 hours toward hourly if needed.
   - sports status/feed refresh can be more event-driven.
3. More personalization feedback loops (capture more interaction signals, not only explicit feedback).
4. Internal observability/admin endpoints for diagnostics, replay, and integrity checks.

### Less stuff we can keep

1. Legacy compatibility routes can eventually be removed (`/users/:userId`) once clients are fully on `/v1/users/me`.
2. Firebase-driven workarounds can be reduced:
   - Firestore-specific trigger orchestration.
   - Firestore document-size-driven patterns where Postgres rows are a better fit.
3. Overly defensive client retry/backoff patterns can be simplified after real traffic measurements.

### Different stuff we should redesign

1. Prefill storage strategy:
   - Current `userPrefillChunks.posts` JSON chunk model exists for Firestore constraints.
   - With Postgres, we can choose normalized rows per post and keep chunking only where strictly needed.
2. Job execution model:
   - Move from Firestore write-trigger semantics to explicit queue workers with SQL locking.
3. Auth verification model:
   - verify JWT directly in API (no Firebase verifier dependency).

### Guardrails (even with high API allowance)

1. Keep server-side rate limits per user/IP and internal auth on job endpoints.
2. Keep pagination + max query bounds to avoid accidental expensive scans.
3. Keep heavy tasks async (news ingestion, sports refresh, prefill regeneration), not synchronous per request.

---

## 4) Migration Strategy (Phased)

## Phase 0: Prep and freeze risk

1. Create a Supabase project (`staging` first, then `production`).
2. Enable providers in Supabase Auth:
   - Email/password
   - Google OAuth
3. Define environments and secrets matrix (section 8).
4. Add observability baseline before changes (API error rate, p95 latency, auth failures).
5. Declare change freeze window for final cutover.

Exit criteria:

- Supabase staging project exists.
- Required secrets available in CI and local env.
- Rollback owner + window approved.

## Phase 1: Schema and repository abstraction

1. Add SQL migrations for all required tables/indexes (section 6 + appendix SQL starter).
2. Introduce a new data abstraction in API:
   - `Repository` interface stays.
   - Add Postgres implementations parallel to Firestore implementations.
3. Keep Firebase code path feature-flagged while Postgres path is built and tested.

Exit criteria:

- API test suite passes against Postgres-backed repositories.
- No endpoint contract changes required by clients.

## Phase 2: Auth migration in backend and clients

1. Replace `FirebaseAuthVerifier` with `SupabaseAuthVerifier`.
2. Switch client auth SDK usage:
   - Mobile hooks -> Supabase client session APIs.
   - Web auth context -> Supabase auth APIs.
3. Continue sending `Authorization: Bearer <token>` to backend.
4. Backend verifies Supabase JWT and maps identity to internal `uid` string.

Exit criteria:

- Staging users can sign in via Supabase and hit existing `/v1/*` routes.
- Token refresh/retry behavior verified on mobile and web.

## Phase 3: Data backfill + dual-write

1. Build one-time migration tool: Firestore -> Postgres.
2. Perform initial full backfill.
3. Turn on API dual-write (Firestore + Postgres) behind flag for mutable tables.
4. Run parity checks (counts, spot payload hashes) repeatedly.

Exit criteria:

- Parity checks pass for agreed tolerance.
- No critical drift during dual-write observation window.

## Phase 4: Read cutover

1. Switch reads in API from Firestore repos to Postgres repos.
2. Keep dual-write for short safety window.
3. Monitor error budget, latency, and data parity.

Exit criteria:

- Stable for 48-72h in production.
- No P0/P1 auth or data integrity issues.

## Phase 5: Decommission Firebase

1. Remove dual-write.
2. Remove Firebase dependencies from clients and API.
3. Remove Firebase deploy workflow and scripts.
4. Archive final Firestore export + Auth export for compliance.

Exit criteria:

- No runtime dependency on Firebase SDKs/services.
- Firebase Functions/Firestore/Auth project can be disabled.

## Phase 6: Post-cutover API-surface optimization (optional but recommended)

1. Decide which "more/less/different" items from section 3.3 to ship in v2.
2. Remove legacy routes and data patterns after a measured deprecation window.
3. Increase refresh and personalization cadence where user value justifies it.
4. Re-benchmark cost/perf after simplifications and endpoint expansion.

Exit criteria:

- Deprecated routes removed safely.
- Data model simplifications completed (if selected).
- New API surface has explicit SLOs and rate limits.

---

## 5) API/Trigger Mapping (Firebase -> Supabase/Node)

| Current Firebase capability | Current implementation | Target replacement |
|---|---|---|
| HTTP API | `onRequest` function (`api`) | Node service (Express) on Cloud Run |
| Firebase ID token verification | `firebase-admin auth.verifyIdToken` | Supabase JWT verification (JWKS/JWT secret) |
| Firestore persistence | Firestore repositories | Postgres repositories |
| Auth signup trigger | `onAuthUserCreate` | Remove trigger; rely on lazy `getOrCreateUser` on `/v1/users/me` (optional DB trigger later) |
| Scheduled news sync | `onSchedule` | Cloud Scheduler/Cron -> API internal route or worker command |
| Sports prewarm scheduler | `onSchedule` | Cloud Scheduler/Cron -> API internal route or worker command |
| Firestore doc trigger for refresh jobs | `onDocumentWritten` | Queue table in Postgres + periodic worker loop / cron-driven dispatcher |

Recommended for sports refresh queue:

1. Keep queue table (`user_sports_news_refresh_jobs`).
2. Add explicit worker command in API that claims jobs transactionally with `FOR UPDATE SKIP LOCKED`.
3. Trigger worker every minute via scheduler.

---

## 6) Data Model Mapping (Firestore -> Postgres)

Important design choice: keep `user_id` as `text` everywhere to avoid brittle UID-format assumptions during migration.

## 6.1 Core user/feed tables

### `users` -> `app_users`

Firestore fields:

- `email`, `displayName`, `photoURL`, `authUid`
- `prefillStatus`, `prefillPostCount`, `prefillChunkCount`, `prefillBytes`, `prefillUpdatedAt`
- `prefillPointers` (object map)
- `createdAt`, `updatedAt`

Postgres proposal:

- `id text primary key`
- `email text`
- `display_name text`
- `photo_url text`
- `auth_uid text`
- `prefill_status text check in ('empty','generating','ready','error')`
- `prefill_post_count int`
- `prefill_chunk_count int`
- `prefill_bytes bigint`
- `prefill_updated_at timestamptz`
- `prefill_pointers jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

### `promptPreferences` -> `prompt_preferences`

- `user_id text primary key`
- `biography_instructions text`
- `niche_instructions text`
- `updated_at timestamptz`

### `userPrefillChunks` -> `user_prefill_chunks`

- `id text primary key`
- `user_id text`
- `auth_uid text`
- `chunk_index int`
- `size_bytes int`
- `posts jsonb` (stored posts array)
- `created_at timestamptz`
- `updated_at timestamptz`
- `unique(user_id, chunk_index)`

### `posts` -> `posts`

- `id uuid primary key default gen_random_uuid()`
- `user_id text`
- `mode text`
- `profile text`
- `profile_key text`
- `length text`
- `title text`
- `body text`
- `post_type text`
- `tags text[]`
- `confidence text`
- `uncertainty_note text`
- `created_at timestamptz`

### `feedback` -> `feedback`

- `id uuid primary key default gen_random_uuid()`
- `user_id text`
- `post_id text`
- `type text check in ('upvote','downvote','skip')`
- `created_at timestamptz`

## 6.2 News tables

### `newsArticles` -> `news_articles`

- `id text primary key` (sha256 canonical URL)
- `source_id text`
- `source_name text`
- `source jsonb`
- `canonical_url text`
- `title text`
- `summary text`
- `categories text[]`
- `external_id text`
- `author text`
- `published_at timestamptz`
- `feed_fingerprint text`
- `fingerprint text`
- `first_seen_at timestamptz`
- `last_seen_at timestamptz`
- `full_text_status text`
- `full_text_error text`
- `full_text_length int`
- `full_text_chunk_count int`
- `full_text_fingerprint text`
- `full_text_updated_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

Indexes:

- `(source_id, published_at desc)`
- `(published_at desc)`
- unique `(canonical_url)`

### `newsArticleTextChunks` -> `news_article_text_chunks`

- `id text primary key`
- `article_id text`
- `chunk_index int`
- `text text`
- `created_at timestamptz`
- `updated_at timestamptz`
- unique `(article_id, chunk_index)`

### `newsSourceState` -> `news_source_state`

- `source_id text primary key`
- `source_name text`
- `feed_url text`
- `homepage_url text`
- `language text`
- `country_code text`
- `last_status text`
- `last_run_id text`
- `last_run_at timestamptz`
- `last_success_at timestamptz`
- `last_error text`
- `fetched_count int`
- `inserted_count int`
- `updated_count int`
- `unchanged_count int`
- `duration_ms int`
- `last_http_status int`
- `updated_at timestamptz`

### `newsSyncRuns` -> `news_sync_runs`

- `run_id text primary key`
- `schedule text`
- `started_at timestamptz`
- `completed_at timestamptz`
- `duration_ms int`
- `source_count int`
- `success_count int`
- `error_count int`
- `skipped_count int`
- `total_fetched_count int`
- `total_inserted_count int`
- `total_updated_count int`
- `total_unchanged_count int`
- `source_results jsonb`

## 6.3 Sports news tables

### `userSportsNewsStories` -> `user_sports_news_stories`

- `id text primary key`
- `user_id text`
- `sport text`
- `source_id text`
- `source_name text`
- `title text`
- `canonical_url text`
- `published_at timestamptz`
- `game_id text`
- `game_name text`
- `game_date_key text`
- `importance_score numeric`
- `bullet_points text[]`
- `reconstructed_article text`
- `story text`
- `preview text`
- `full_text_status text`
- `summary_source text`
- `rank int`
- `created_at timestamptz`
- `updated_at timestamptz`

Indexes:

- `(user_id, published_at desc, id desc)`
- `(user_id, sport, published_at desc, id desc)`

### `userSportsNewsGameDrafts` -> `user_sports_news_game_drafts`

- `id text primary key`
- `user_id text`
- `sport text`
- `game_id text`
- `game_name text`
- `game_date_key text`
- `article_count int`
- `articles jsonb`
- `expires_at timestamptz`
- `created_at timestamptz`
- `updated_at timestamptz`

### `userSportsNewsSyncState` -> `user_sports_news_sync_state`

- `user_id text`
- `sport text`
- `status text`
- `step text`
- `message text`
- `total_games int`
- `processed_games int`
- `found_games text[]`
- `started_at timestamptz`
- `completed_at timestamptz`
- `updated_at timestamptz`
- `error_message text`
- `primary key (user_id, sport)`

### `userSportsNewsRefreshJobs` -> `user_sports_news_refresh_jobs`

- `user_id text`
- `sport text`
- `status text` (`queued`,`processing`,`idle`,`error`)
- `pending boolean`
- `requested_at timestamptz`
- `started_at timestamptz`
- `completed_at timestamptz`
- `updated_at timestamptz`
- `error_message text`
- `primary key (user_id, sport)`

## 6.4 Recces tables

### `recces/blogs/{authorId}/{essayId}` -> `recces_essays`

- `author_id text`
- `essay_id text`
- `source_title text`
- `posts jsonb`
- `updated_at timestamptz`
- `primary key (author_id, essay_id)`

### `userRecommendationProfiles` -> `user_recommendation_profiles`

- `user_id text primary key`
- `theme_weights jsonb`
- `signal_count int`
- `updated_at timestamptz`

---

## 7) Auth Migration Plan (Firebase Auth -> Supabase Auth)

## 7.1 Client SDK migration

### Mobile changes

Replace Firebase auth usage in:

1. `apps/mobile/src/config/firebase.ts` -> `apps/mobile/src/config/supabase.ts`
2. `apps/mobile/src/hooks/useAuth.ts`
3. `apps/mobile/src/hooks/useGoogleAuth.ts`
4. `apps/mobile/src/hooks/useUser.ts`
5. `apps/mobile/src/screens/ProfileScreen.tsx` (email verification path)
6. `apps/mobile/src/screens/signup/SignupPasswordScreen.tsx` (profile update path)
7. `apps/mobile/src/services/api.ts` (read Supabase access token)

### Web changes

Replace Firebase auth usage in:

1. `apps/web/src/lib/firebaseConfig.ts` -> `apps/web/src/lib/supabaseClient.ts`
2. `apps/web/src/context/AuthContext.tsx`
3. `apps/web/src/lib/api.ts`

## 7.2 Backend token verification

Replace:

- `services/api/functions/src/auth/firebaseAuthVerifier.ts`

With:

- `services/api/functions/src/auth/supabaseAuthVerifier.ts`

Behavior required:

1. Parse bearer token from `Authorization` header (unchanged).
2. Verify JWT signature (Supabase JWKS or JWT secret).
3. Extract identity:
   - `uid = sub`
   - `email`
   - `displayName` from metadata fallback
   - `photoURL` from metadata fallback
4. Preserve current app contract (`AuthIdentity` with string `uid`).

## 7.3 User account migration policy

Recommended migration policy for minimum risk:

1. Import users by email where possible.
2. Require password reset for email/password users on first Supabase login.
3. Google users re-auth via Google in Supabase.
4. Map old Firebase UID to new Supabase `sub` by email during backfill (one-time join map).

This avoids coupling migration success to password-hash compatibility.

---

## 8) Environment and Secrets Matrix

## 8.1 New required env vars

### API runtime

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` or `SUPABASE_JWKS_URL`
- Existing OpenAI vars remain:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - news/sports tuning vars

### Web (`apps/web`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL` (already supported in some routes)

### Mobile (`apps/mobile`)

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL`

## 8.2 Remove deprecated envs

- `NEXT_PUBLIC_FIREBASE_*`
- hardcoded Firebase config in mobile
- Firebase CLI/service-account vars tied to deploy scripts

---

## 9) Backend Refactor Plan (File-by-file)

## 9.1 New backend package shape

Recommended restructure (inside `services/api/functions/src`):

1. `auth/supabaseAuthVerifier.ts`
2. `db/postgres.ts` (pool/client)
3. `repositories/postgresRepository.ts`
4. `news/postgresNewsRepository.ts`
5. `news/postgresUserSportsNewsRepository.ts`
6. `recces/postgresReccesRepository.ts`
7. `recces/postgresReccesUserProfileRepository.ts`

Keep the existing interfaces to avoid service-layer churn.

## 9.2 Runtime entrypoint changes

Current `index.ts` uses Firebase-specific exports.

Migration:

1. Introduce `server.ts` that starts express app directly.
2. Keep `createApp.ts` route layer mostly unchanged.
3. Replace Firebase function exports with scheduler/worker commands:
   - `npm run worker:news-sync`
   - `npm run worker:sports-prewarm`
   - `npm run worker:sports-refresh`

## 9.3 Queue claim logic for sports refresh

Implement SQL transaction equivalent of Firestore transaction semantics:

1. `enqueue`: upsert `(user_id, sport)` with status transitions (`queued`/`pending`).
2. `claim`: atomic update from `queued` -> `processing` using row lock.
3. `finish`: set `idle/error` and handle `pending` rollover.

---

## 10) Client Refactor Plan (Detailed)

## 10.1 Mobile

1. Add Supabase client singleton with AsyncStorage-backed session persistence.
2. Update auth hooks:
   - `signInWithPassword`
   - `signUp`
   - `signOut`
   - `resetPasswordForEmail`
3. Google login:
   - keep Expo Google flow
   - exchange ID token with Supabase `signInWithIdToken` (or OAuth redirect flow)
4. Replace `auth.currentUser.getIdToken()` calls with active Supabase session access token.
5. Keep API usage unchanged except token source.

Validation command after changes:

- `npm --prefix apps/mobile run typecheck`

## 10.2 Web

1. Replace Firebase Auth context with Supabase Auth context.
2. Keep `getIdToken()` method in context API (return Supabase access token) to avoid broad call-site changes.
3. Keep `apps/web/src/lib/api.ts` request signatures unchanged.
4. Remove unused `firebase-admin` and `firebase` dependencies once fully migrated.

Validation command after changes:

- `npm --prefix apps/web run build`

---

## 11) Data Migration Execution Plan

## 11.1 Migration scripts to build

Create in `services/api/functions/scripts`:

1. `migrate-firestore-to-supabase.ts`
2. `migrate-firebase-auth-to-supabase.ts` (or CSV-driven import helper)
3. `verify-firestore-vs-postgres-parity.ts`

## 11.2 Firestore -> Postgres approach

1. Read each Firestore collection in pages.
2. Normalize timestamps to ISO/timestamptz.
3. Upsert into Postgres tables using deterministic keys.
4. Track high-water marks and resumable checkpoints.
5. Emit summary report:
   - docs read
   - rows written
   - rows failed
   - checksum sample

## 11.3 Parity checks required before cutover

For each domain table:

1. Row count parity.
2. Sample hash parity on canonical fields.
3. API-level parity smoke tests for:
   - `/v1/users/me`
   - `/v1/posts/list`
   - `/v1/posts/generate`
   - `/v1/posts/feedback`
   - `/v1/recommendations/recces`
   - news endpoints

---

## 12) Scheduler and Job Migration

## 12.1 Current Firebase schedules

- News sync every 12 hours (`syncNewsEvery3Hours` function name is stale).
- Sports prewarm every 12 hours.

## 12.2 Target scheduler setup

Use Cloud Scheduler (or equivalent cron) with authenticated calls to internal API endpoints:

1. `POST /internal/jobs/news-sync`
2. `POST /internal/jobs/sports-prewarm`
3. `POST /internal/jobs/sports-refresh/process` (every minute)

Each endpoint should:

1. Require internal secret header.
2. Be idempotent.
3. Log structured run summary (same as current log fields where possible).

---

## 13) CI/CD Changes

## 13.1 Remove/replace

- Replace `.github/workflows/deploy-functions.yml` with `deploy-api.yml` for containerized Node API.
- Remove Firebase deploy script dependencies from CI.

## 13.2 Keep existing

- `deploy-web.yml` stays, but web env vars change to Supabase keys.
- `publish-mobile-update.yml` stays, but mobile runtime env vars change.

## 13.3 New API deployment requirements

1. Build/push container image.
2. Deploy to Cloud Run service.
3. Inject secrets (`SUPABASE_*`, `OPENAI_*`, runtime flags).
4. Run post-deploy smoke tests.

---

## 14) Testing Plan and Gates

## 14.1 Unit/integration

Backend:

1. Keep existing `vitest` tests.
2. Add repository tests for Postgres implementations.
3. Add auth verifier tests for valid/expired/invalid Supabase JWT.

Client:

1. Mobile auth hook tests (if present) and manual signin flows.
2. Web auth modal/signin regression checks.

## 14.2 Required validation commands

- API: `./services/api/scripts/prepush-check.sh`
- Mobile: `npm --prefix apps/mobile run typecheck`
- Web: `npm --prefix apps/web run build`

## 14.3 Production cutover gates

1. p95 API latency within agreed threshold.
2. auth failure rate not elevated.
3. no data drift alarms for key tables.
4. no P0/P1 for 72h after read cutover.

---

## 15) Rollback Plan

At each cutover stage, keep rollback simple:

1. Auth rollback: switch clients back to Firebase auth SDK + old env.
2. Data rollback: flip API read flag back to Firestore repositories.
3. Runtime rollback: route traffic back to previous Firebase endpoint if needed.

Rollback prerequisites:

1. Firestore writes still active during dual-write window.
2. Old deploy artifacts and env snapshots retained.
3. Runbook with one-command flag reversions documented.

---

## 16) Decommission Checklist (Final)

After stabilization:

1. Remove Firebase dependencies:
   - `firebase`, `firebase-admin`, `firebase-functions` where no longer needed.
2. Delete Firebase config files no longer used:
   - `services/api/firebase.json`
   - `services/api/firestore.rules`
   - `services/api/firestore.indexes.json`
3. Remove Firebase scripts/workflows and update docs:
   - `README.md`, `Setup.md`, `services/api/README.md`
4. Disable Firebase services in project settings.

---

## 17) Work Breakdown and Estimates

## Week 1

1. Supabase project/env setup.
2. Postgres schema migrations.
3. Backend repository scaffolding.

## Week 2

1. Backend auth verifier migration.
2. Mobile auth migration.
3. Web auth migration.

## Week 3

1. Backfill tools and first migration run.
2. Dual-write + parity checks.
3. Scheduler/worker migration.

## Week 4

1. Read cutover.
2. Monitoring and stabilization.
3. Firebase decommission prep.

---

## 18) Known Risks and Mitigations

1. User identity mismatch during auth migration.
- Mitigation: email-based mapping table + forced password reset strategy.

2. Sports refresh queue semantics regressions.
- Mitigation: transactional claim tests + replay tests + shadow mode.

3. Large JSON payloads (`user_prefill_chunks.posts`) performance.
- Mitigation: index by `(user_id, chunk_index)`, limit payload size, monitor row bloat.

4. News full-text chunking cost/storage growth.
- Mitigation: retention policy + chunk table vacuum strategy.

5. Hidden hardcoded API base URLs.
- Mitigation: repo-wide grep gate for old Firebase/Cloud Functions URLs before cutover.

---

## 19) Concrete Task List (Ticket-ready)

## Backend

1. Add Postgres connection module and migrations.
2. Implement `SupabaseAuthVerifier` and wire into `createApp`.
3. Implement Postgres repositories for all Firestore-backed domains.
4. Add dual-write toggle and parity instrumentation.
5. Build scheduler internal endpoints and job processor commands.
6. Containerize API and deploy via new GitHub Actions workflow.

## Mobile

1. Create Supabase auth client wrapper.
2. Port `useAuth`, `useGoogleAuth`, `useUser`.
3. Replace Firebase token retrieval in API service.
4. Update profile verification/update behavior.

## Web

1. Replace `firebaseConfig` with Supabase client.
2. Port `AuthContext` to Supabase session model.
3. Update API token getter and retry flows.
4. Remove Firebase deps and cleanup seed script path (or rewrite for Postgres).

## Platform/Docs

1. Add env templates for web/mobile/api.
2. Replace Firebase setup docs with Supabase setup.
3. Add migration runbook and rollback runbook.

---

## 20) Appendix: SQL Starter (Initial Draft)

```sql
-- Required extensions
create extension if not exists pgcrypto;

-- Core users table
create table if not exists app_users (
  id text primary key,
  email text,
  display_name text,
  photo_url text,
  auth_uid text,
  prefill_status text not null default 'empty' check (prefill_status in ('empty','generating','ready','error')),
  prefill_post_count int not null default 0,
  prefill_chunk_count int not null default 0,
  prefill_bytes bigint not null default 0,
  prefill_updated_at timestamptz,
  prefill_pointers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prompt_preferences (
  user_id text primary key references app_users(id) on delete cascade,
  biography_instructions text not null default '',
  niche_instructions text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists user_prefill_chunks (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  auth_uid text,
  chunk_index int not null check (chunk_index >= 0),
  size_bytes int not null check (size_bytes >= 0),
  posts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, chunk_index)
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  mode text not null,
  profile text not null,
  profile_key text not null,
  length text not null,
  title text not null,
  body text not null,
  post_type text not null,
  tags text[] not null default '{}',
  confidence text not null,
  uncertainty_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_posts_user_mode_profile_created
  on posts (user_id, mode, profile_key, created_at desc);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references app_users(id) on delete cascade,
  post_id text not null,
  type text not null check (type in ('upvote','downvote','skip')),
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_user_created
  on feedback (user_id, created_at desc);
create index if not exists idx_feedback_user_post_created
  on feedback (user_id, post_id, created_at desc);

create table if not exists user_recommendation_profiles (
  user_id text primary key references app_users(id) on delete cascade,
  theme_weights jsonb not null default '{}'::jsonb,
  signal_count int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists recces_essays (
  author_id text not null,
  essay_id text not null,
  source_title text not null,
  posts jsonb not null,
  updated_at timestamptz,
  primary key (author_id, essay_id)
);

create table if not exists news_articles (
  id text primary key,
  source_id text not null,
  source_name text not null,
  source jsonb not null,
  canonical_url text not null,
  title text not null,
  summary text not null,
  categories text[] not null default '{}',
  external_id text,
  author text,
  published_at timestamptz,
  feed_fingerprint text,
  fingerprint text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  full_text_status text,
  full_text_error text,
  full_text_length int,
  full_text_chunk_count int,
  full_text_fingerprint text,
  full_text_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_url)
);

create index if not exists idx_news_articles_source_published
  on news_articles (source_id, published_at desc);

create table if not exists news_article_text_chunks (
  id text primary key,
  article_id text not null references news_articles(id) on delete cascade,
  chunk_index int not null check (chunk_index >= 0),
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, chunk_index)
);

create table if not exists news_source_state (
  source_id text primary key,
  source_name text not null,
  feed_url text not null,
  homepage_url text not null,
  language text not null,
  country_code text,
  last_status text,
  last_run_id text,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  fetched_count int,
  inserted_count int,
  updated_count int,
  unchanged_count int,
  duration_ms int,
  last_http_status int,
  updated_at timestamptz not null default now()
);

create table if not exists news_sync_runs (
  run_id text primary key,
  schedule text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms int,
  source_count int,
  success_count int,
  error_count int,
  skipped_count int,
  total_fetched_count int,
  total_inserted_count int,
  total_updated_count int,
  total_unchanged_count int,
  source_results jsonb not null default '[]'::jsonb
);

create table if not exists user_sports_news_stories (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  sport text not null,
  source_id text not null,
  source_name text not null,
  title text not null,
  canonical_url text not null,
  published_at timestamptz,
  game_id text not null,
  game_name text not null,
  game_date_key text not null,
  importance_score numeric not null default 0,
  bullet_points text[] not null default '{}',
  reconstructed_article text not null default '',
  story text not null default '',
  preview text not null default '',
  full_text_status text,
  summary_source text,
  rank int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_usns_user_published_id
  on user_sports_news_stories (user_id, published_at desc, id desc);
create index if not exists idx_usns_user_sport_published_id
  on user_sports_news_stories (user_id, sport, published_at desc, id desc);

create table if not exists user_sports_news_game_drafts (
  id text primary key,
  user_id text not null references app_users(id) on delete cascade,
  sport text not null,
  game_id text not null,
  game_name text not null,
  game_date_key text not null,
  article_count int not null default 0,
  articles jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sport, game_id)
);

create table if not exists user_sports_news_sync_state (
  user_id text not null references app_users(id) on delete cascade,
  sport text not null,
  status text not null,
  step text not null,
  message text not null,
  total_games int not null default 0,
  processed_games int not null default 0,
  found_games text[] not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  error_message text,
  primary key (user_id, sport)
);

create table if not exists user_sports_news_refresh_jobs (
  user_id text not null references app_users(id) on delete cascade,
  sport text not null,
  status text not null,
  pending boolean not null default false,
  requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  error_message text,
  primary key (user_id, sport)
);
```

Note: RLS policies should be added after confirming whether reads/writes remain API-only or partially direct from clients.

---

## 21) Immediate Next Actions

1. Confirm target runtime for API after migration (Cloud Run recommended).
2. Confirm user migration policy (password reset vs direct hash import).
3. Approve SQL schema baseline in section 20.
4. Decide which section 3.3 API-surface changes are in-scope for initial cutover vs post-cutover Phase 6.
5. Start Phase 1 implementation branch with backend repository abstraction.
