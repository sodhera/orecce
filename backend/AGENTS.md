# Backend Scope Agent Notes

Scope: `backend/`

## Rules
- Keep backend work isolated from `mobile/`.
- Prefer small, testable changes in `backend/ai-post/`.
- Keep route handlers thin and generation logic in services/LLM modules.

## Validation
- Run `./backend/ai-post/scripts/prepush-check.sh`.
