# Orecce Monorepo

This repository contains independent work areas:

- `mobile/` -> React Native / Expo app
- `web/` -> local web app for backend testing
- `backend/ai-post/` -> Firebase Functions + Firestore backend for AI-generated feed posts

## Why this layout
- Mobile and backend can move independently.
- Agents can be scoped to one area without cross-editing.
- CI and ownership can be split cleanly by path.

## Quick start
- One command (recommended for non-technical use):
  - `npm run start:all`
  - This starts backend emulators + web app together.
  - Open `http://127.0.0.1:5173`
  - Stop everything with `Ctrl+C`
- Mobile:
  - `npm --prefix mobile install`
  - `npm --prefix mobile run start`
- Web:
  - `npm --prefix web install`
  - `npm --prefix web run dev`
- Backend:
  - `npm --prefix backend/ai-post/functions install`
  - `npm --prefix backend/ai-post/functions run lint:types`
  - `npm --prefix backend/ai-post/functions test`
  - `npm --prefix backend/ai-post/functions run build`

## Local end-to-end stack (web + backend emulator)
1. Configure backend env:
   - `cp backend/ai-post/functions/.env.example backend/ai-post/functions/.env`
   - edit `backend/ai-post/functions/.env` and set `OPENAI_API_KEY`
2. Start Firebase emulators with local disk persistence:
   - `./backend/ai-post/scripts/start-emulators-local.sh`
3. In another terminal, run web:
   - `npm --prefix web install`
   - `npm --prefix web run dev`
4. Open:
   - `http://127.0.0.1:5173`
5. Web defaults to backend emulator URL:
   - `http://127.0.0.1:5001/ai-post-dev/us-central1/api`

### Single-command behavior
- `npm run start:all` auto-installs missing `web` and backend deps.
- If `backend/ai-post/functions/.env` has no OpenAI key, it falls back to `MOCK_LLM=true`.
- Emulator Firestore/function data persists locally in `.firebase-emulator-data`.

## Integration docs
- Backend API contract: `backend/ai-post/docs/API.md`
- Backend OpenAPI spec: `backend/ai-post/docs/openapi.yaml`
- LLM handoff doc for app integration: `backend/ai-post/docs/LLM_APP_INTEGRATION_README.md`
