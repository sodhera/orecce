# Orecce Monorepo Agent Notes

## Repository layout
- `mobile/` contains the app code.
- `web/` contains the local web app for manual testing.
- `backend/ai-post/` contains the Firebase backend.

## Separation rule
- Do not mix changes between `mobile/`, `web/`, and `backend/ai-post/` unless explicitly requested.
- Keep commits and PRs scoped to one area when possible.

## Validation by area
- Mobile checks: `npm --prefix mobile run typecheck`
- Web checks: `npm --prefix web run build`
- Backend checks: `./backend/ai-post/scripts/prepush-check.sh`
