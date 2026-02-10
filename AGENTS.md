# Orecce Monorepo Agent Notes

## Repository layout
- `apps/mobile/` contains the Expo React Native app.
- `apps/web/` contains the local web app for manual testing.
- `services/api/` contains the Firebase backend API.
- `infra/local/` contains local-only emulator scripts, state, and logs.

## Separation rule
- Do not mix changes between `apps/mobile/`, `apps/web/`, and `services/api/` unless explicitly requested.
- Keep commits and PRs scoped to one area when possible.

## Validation by area
- Mobile checks: `npm --prefix apps/mobile run typecheck`
- Web checks: `npm --prefix apps/web run build`
- API checks: `./services/api/scripts/prepush-check.sh`
