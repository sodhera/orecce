# Mobile Scope Agent Notes

Scope: `apps/mobile/`

## Rules
- Touch only mobile app code unless explicitly told otherwise.
- Do not change backend files under `services/api/`.
- Keep dependencies and tooling aligned with Expo project conventions.

## Validation
- Run `npm --prefix apps/mobile run typecheck` after meaningful mobile edits.
