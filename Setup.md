# Orecce Local Setup Guide

This guide is for collaborators who just pulled the repo and need everything running on their own machine.

## 1) What is in this repo

- `apps/mobile/` -> Expo React Native app
- `apps/web/` -> Web app for local feed testing (consumer-style flow)
- `services/api/` -> Firebase Functions + Firestore backend API
- `infra/local/` -> local-only emulator scripts/state/logs

## 2) Prerequisites

Install these first:

1. Node.js 20+ and npm
2. Java (required by Firestore emulator)
3. Firebase CLI

Install Firebase CLI:

```bash
npm install -g firebase-tools
```

Login (only needed for Firebase project metadata access):

```bash
firebase login
```

If you see auth warnings later, run:

```bash
firebase login --reauth
```

## 3) Clone and open repo

```bash
git clone https://github.com/sodhera/orecce.git
cd orecce
```

## 4) API env setup

Create API env file:

```bash
cp services/api/functions/.env.example services/api/functions/.env
```

Edit `services/api/functions/.env`:

- Set `OPENAI_API_KEY` if you want real model generation
- Keep `OPENAI_MODEL=gpt-5-mini` (or your chosen model)

If no valid key is set, the one-command startup automatically uses `MOCK_LLM=true`.

## 5) Start everything (one command)

From repo root:

```bash
npm run start:all
```

This starts:

- Web app: `http://127.0.0.1:5173`
- Firebase Functions emulator: `http://127.0.0.1:5001`
- Firestore emulator: `http://127.0.0.1:8080`
- Emulator UI: `http://127.0.0.1:4000`

Local logs are written to:

- `infra/local/.logs/firebase-emulators.log`
- `infra/local/.logs/start-all.log`
- `infra/local/.logs/web-dev.log`
- `infra/local/firebase-debug.log`
- `infra/local/firestore-debug.log`

Stop all local stack processes:

```bash
npm run stop:all
```

If startup fails due to ports in use:

```bash
npm run stop:all && npm run start:all
```

## 6) Local emulator data persistence

Emulator data is stored on disk at:

```text
infra/local/.firebase-emulator-data/
```

So local Firestore state survives restarts.

## 6.1) Local log persistence

Backend/web/emulator logs are persisted locally at:

```text
infra/local/.logs/
```

Tail logs live:

```bash
tail -f infra/local/.logs/firebase-emulators.log
```

## 7) Manual run options (optional)

Run backend emulators only:

```bash
npm run api:emulators
```

Run web only:

```bash
npm run web:dev
```

Run mobile app:

```bash
npm --prefix apps/mobile install
npm --prefix apps/mobile run start
```

## 8) Validation commands

Backend checks:

```bash
cd services/api
./scripts/prepush-check.sh
```

Web build check:

```bash
npm --prefix apps/web run build
```

## 9) Troubleshooting

### A) Firebase auth warning on emulator startup

If you see:

`Authentication Error: Your credentials are no longer valid`

Run:

```bash
firebase login --reauth
```

### B) Port already in use

Run:

```bash
npm run stop:all
npm run start:all
```

### C) Model/API issues

- Confirm `OPENAI_API_KEY` in `services/api/functions/.env`
- Remove accidental quotes around key values (for example, use `OPENAI_API_KEY=sk-...`, not wrapped values)
- Restart stack after env changes: `npm run stop:all && npm run start:all`
- If you get `llm_auth_error` (OpenAI 401/403), the key is invalid/expired/wrong project
- If you want local-only testing without API calls, unset key and use mock mode via:

```bash
MOCK_LLM=true npm run start:all
```

## 10) Production note

Current backend is prototype-oriented:

- Firestore rules are open for fast iteration
- No auth enforcement in v0 request handlers

Before production deployment, lock down auth and Firestore rules.
