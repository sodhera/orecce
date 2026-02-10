# Services Scope Agent Notes

Scope: `services/`

## Rules
- Keep API/backend work isolated from frontends under `apps/`.
- Prefer small, testable changes inside `services/api/`.
- Keep route handlers thin and generation logic in service/LLM modules.

## Validation
- Run `./services/api/scripts/prepush-check.sh`.
