# AI-Post Backend Agent Notes

## Scope
This folder hosts the Firebase Cloud Functions + Firestore backend for AI-generated feed posts.

## Guardrails
- Keep architecture minimal (prototype scale, <=100 users).
- Do not add auth in v0 request handlers; keep seams clear for future auth middleware.
- Route handlers should stay thin. Business logic belongs in `functions/src/services`.
- LLM calls must only happen in `functions/src/llm/openAiGateway.ts`.

## Before push
1. Run `npm --prefix functions test`.
2. Run `npm --prefix functions run build`.
3. Run `npm --prefix functions run lint:types`.
4. Smoke test in emulator: `firebase emulators:start --only functions,firestore` and hit APIs.

## Local test UI
A throwaway local UI can be kept under `local-dev-ui/` and should remain untracked.
