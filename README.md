# Orecce Monorepo

This repo is split into clean monorepo domains:

- `apps/mobile/` - Expo React Native app
- `apps/web/` - Web app (runs locally, points to cloud backend by default)
- `services/api/` - Firebase Functions + Firestore backend API

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

## Cloud backend workflow
- Re-auth Firebase CLI (only needed for direct `firebase ...` commands):
  - `firebase login --reauth`
- Place the service-account JSON at:
  - `/Users/sirishjoshi/Desktop/AI-Post/audit-3a7ec-4313afabeaac.json`
  - or set `GOOGLE_APPLICATION_CREDENTIALS` to your JSON path
- Deploy Functions + Firestore rules/indexes:
  - `npm run api:deploy:cloud`
- Migrate Auth users from emulator export to cloud:
  - `npm run api:migrate:auth:cloud`
- Migrate Firestore docs from emulator to cloud:
  - Start Firestore emulator with existing export data
  - `npm run api:migrate:firestore:cloud`
- Populate the shared cloud prefill dataset (biography/trivia/niche):
  - `npm run api:populate:common:cloud`

Default cloud API base:
- `https://us-central1-audit-3a7ec.cloudfunctions.net/api`

## Run app clients separately
### Mobile app
- `npm --prefix apps/mobile install`
- `npm --prefix apps/mobile run start`

### Web app only
- `npm --prefix apps/web install`
- `npm --prefix apps/web run dev`

### API checks
- `./services/api/scripts/prepush-check.sh`

## Integration docs
- API contract: `services/api/docs/API.md`
- OpenAPI spec: `services/api/docs/openapi.yaml`
- LLM handoff doc for app integration: `services/api/docs/LLM_APP_INTEGRATION_README.md`
