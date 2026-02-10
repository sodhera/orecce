# Orecce Monorepo Agent Notes

## Repository layout
- `mobile/` contains the app code.
- `backend/ai-post/` contains the Firebase backend.

## Separation rule
- Do not mix changes between `mobile/` and `backend/ai-post/` unless explicitly requested.
- Keep commits and PRs scoped to one area when possible.

## Validation by area
- Mobile checks: `npm --prefix mobile run typecheck`
- Backend checks: `./backend/ai-post/scripts/prepush-check.sh`
