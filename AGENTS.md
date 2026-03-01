# Orecce Monorepo Agent Notes

## Repository layout
- `apps/mobile/` contains the Expo React Native app.
- `apps/web/` contains the local web app for manual testing.
- `services/api/` contains the Supabase-backed backend API.

## Separation rule
- Do not mix changes between `apps/mobile/`, `apps/web/`, and `services/api/` unless explicitly requested.
- Keep commits and PRs scoped to one area when possible.

## Validation by area
- Mobile checks: `npm --prefix apps/mobile run typecheck`
- Web checks: `npm --prefix apps/web run build`
- API checks: `./services/api/scripts/prepush-check.sh`

## Database migration rule
- Any schema change must include a forward migration for already-provisioned databases (local/staging/prod), not only edits to base schema files.
- Keep base schema definitions current (for fresh setup) and also add an idempotent migration file under `packages/api-core/src/db/migrations/`.

## Analytics documentation
- Repo-wide analytics plan: `docs/user-analytics-plan.md`
- Living analytics operations log: `docs/user-analytics-ops.md`
- When changing user-facing flows, event names, tracking wrappers, analytics tables, feedback schemas, recommendation signals, or reporting logic, update the relevant analytics docs in the same change.
- Keep mobile, web, and API analytics event names aligned. Prefer one shared taxonomy instead of surface-specific names for the same behavior.
- Preserve the section headings in `docs/user-analytics-ops.md`; that file is intended to be refreshed automatically by recurring review runs.
- If analytics needs new tables, RPCs, or schema updates that currently live in ad hoc SQL under `apps/web/`, move or mirror them into forward migrations under `packages/api-core/src/db/migrations/` so analytics ownership stays coherent.
