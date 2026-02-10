# Orecce Monorepo

This repo is split into clean monorepo domains:

- `apps/mobile/` - Expo React Native app
- `apps/web/` - Web app for local backend testing
- `services/api/` - Firebase Functions + Firestore backend API
- `infra/local/` - local-only emulator scripts/state/logs

## For collaborators
### First-time setup
1. Clone and enter the repo:
   - `git clone https://github.com/sodhera/orecce.git`
   - `cd orecce`
2. Install Firebase CLI (if missing):
   - `npm install -g firebase-tools`
3. Login once:
   - `firebase login`
4. Create API env file:
   - `cp services/api/functions/.env.example services/api/functions/.env`
5. Add your key in `services/api/functions/.env`:
   - `OPENAI_API_KEY=...`
   - `OPENAI_MODEL=gpt-5-mini`

### Pull latest changes
- `git checkout main`
- `git pull origin main`

## Run everything (one command)
- `npm run start:all`
- Web UI: `http://127.0.0.1:5173`
- API emulator base: `http://127.0.0.1:5001/ai-post-dev/us-central1/api`
- Stop stack: `npm run stop:all`

## Run app clients separately
### Mobile app
- `npm --prefix apps/mobile install`
- `npm --prefix apps/mobile run start`

### Web app only
- `npm --prefix apps/web install`
- `npm --prefix apps/web run dev`

### API checks
- `./services/api/scripts/prepush-check.sh`

## Local data and logs
- Firestore emulator data: `infra/local/.firebase-emulator-data/`
- Aggregated logs: `infra/local/.logs/`
- Firebase debug logs: `infra/local/firebase-debug.log`, `infra/local/firestore-debug.log`
- If ports are busy, run:
  - `npm run stop:all`
  - `npm run start:all`

## Integration docs
- API contract: `services/api/docs/API.md`
- OpenAPI spec: `services/api/docs/openapi.yaml`
- LLM handoff doc for app integration: `services/api/docs/LLM_APP_INTEGRATION_README.md`
