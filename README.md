# Orecce Monorepo

This repository is organized as a separated monorepo:

- `apps/mobile/` -> Expo React Native app
- `apps/web/` -> Web app for local backend testing
- `services/api/` -> Firebase Functions + Firestore backend API
- `infra/local/` -> local-only emulator tooling, state, and logs (non-production)

## Why this layout
- Frontend and backend workstreams are fully separated.
- Mobile and web can iterate independently while sharing one API service.
- Emulator/runtime artifacts are isolated from production source directories.

## Quick start
- One command (recommended for non-technical use):
  - `npm run start:all`
  - Starts API emulators + web app together.
  - Open `http://127.0.0.1:5173`
  - Local logs are written to `infra/local/.logs/`:
    - `infra/local/.logs/firebase-emulators.log`
    - `infra/local/.logs/start-all.log`
    - `infra/local/.logs/web-dev.log`
  - Firebase CLI debug files are also written under `infra/local/`:
    - `infra/local/firebase-debug.log`
    - `infra/local/firestore-debug.log`
  - Stop everything with `Ctrl+C`
  - If ports are already occupied, run:
    - `npm run stop:all`
    - `npm run start:all`
- Mobile:
  - `npm --prefix apps/mobile install`
  - `npm --prefix apps/mobile run start`
- Web:
  - `npm --prefix apps/web install`
  - `npm --prefix apps/web run dev`
- API:
  - `npm --prefix services/api/functions install`
  - `npm --prefix services/api/functions run lint:types`
  - `npm --prefix services/api/functions test`
  - `npm --prefix services/api/functions run build`

## Local end-to-end stack (web + API emulator)
1. Configure API env:
   - `cp services/api/functions/.env.example services/api/functions/.env`
   - edit `services/api/functions/.env` and set `OPENAI_API_KEY`
2. Start Firebase emulators with local disk persistence:
   - `./services/api/scripts/start-emulators-local.sh`
3. In another terminal, run web:
   - `npm --prefix apps/web install`
   - `npm --prefix apps/web run dev`
4. Open:
   - `http://127.0.0.1:5173`
5. Web defaults to API emulator URL:
   - `http://127.0.0.1:5001/ai-post-dev/us-central1/api`

### Single-command behavior
- `npm run start:all` auto-installs missing `apps/web` and `services/api/functions` deps.
- If `services/api/functions/.env` has no OpenAI key, it falls back to `MOCK_LLM=true`.
- If API emulator is already healthy on `:5001`, it is reused.
- Emulator Firestore/function data persists in `infra/local/.firebase-emulator-data/`.
- Emulator and app runtime logs persist in `infra/local/.logs/`.

## Integration docs
- API contract: `services/api/docs/API.md`
- OpenAPI spec: `services/api/docs/openapi.yaml`
- LLM handoff doc for app integration: `services/api/docs/LLM_APP_INTEGRATION_README.md`
