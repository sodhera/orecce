# Orecce Monorepo

This repository contains two independent work areas:

- `mobile/` -> React Native / Expo app
- `backend/ai-post/` -> Firebase Functions + Firestore backend for AI-generated feed posts

## Why this layout
- Mobile and backend can move independently.
- Agents can be scoped to one area without cross-editing.
- CI and ownership can be split cleanly by path.

## Quick start
- Mobile:
  - `npm --prefix mobile install`
  - `npm --prefix mobile run start`
- Backend:
  - `npm --prefix backend/ai-post/functions install`
  - `npm --prefix backend/ai-post/functions run lint:types`
  - `npm --prefix backend/ai-post/functions test`
  - `npm --prefix backend/ai-post/functions run build`

## Integration docs
- Backend API contract: `backend/ai-post/docs/API.md`
- Backend OpenAPI spec: `backend/ai-post/docs/openapi.yaml`
- LLM handoff doc for app integration: `backend/ai-post/docs/LLM_APP_INTEGRATION_README.md`
