# Services Scope Agent Notes

Scope: `services/`

## Rules
- Keep API/backend work isolated from frontends under `apps/`.
- Prefer small, testable changes inside `services/api/`.
- Keep route handlers thin and generation logic in service/LLM modules.
- Ship database schema changes with forward migrations for already-existing environments; do not rely on base schema edits alone.

## Validation
- Run `./services/api/scripts/prepush-check.sh`.
