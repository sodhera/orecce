# Orecce Security Review Operations Log

This is the living security file. It is meant to be updated on a schedule and after security-relevant product changes.

## Automation contract

When updating this file:

1. Review [`docs/security-review-plan.md`](./security-review-plan.md).
2. Scan `apps/mobile`, `apps/web`, `services/api`, and `packages/api-core` for new or changed trust boundaries.
3. Record which controls are implemented, missing, inconsistent, or newly required.
4. Update the coverage snapshot, current blockers, known risks, and next actions.
5. Keep the section headings stable so this file stays machine-updatable.
6. If a recurring security audit automation is configured, keep its prompt aligned if this workflow changes.
7. When new features land, record the new attack surface and required controls in the same change.

## Last review

- Reviewed on: 2026-03-01
- Reviewer: Codex
- Scope: repo-wide baseline planning pass across mobile, web, API, schema, and security workflow
- Review type: initial architecture and code-sweep baseline, not a full penetration test

## Coverage snapshot

| Area | Coverage | Notes |
| --- | --- | --- |
| Identity and authentication | Yellow | Supabase bearer verification exists in the main API paths, but local-mode seams still exist in core code and require strict environment gating. |
| Authorization and database policy model | Red | Direct web client data access depends on policies defined in ad hoc SQL under `apps/web`, not yet in the canonical core migration path. |
| Mobile client and session handling | Yellow | Supabase auth integration exists, but session-storage choices and mobile transport policy need a dedicated hardening pass. |
| Web browser surface | Yellow | The web app has authenticated flows and server routes, but browser headers, CSP, and explicit CSRF assumptions are not yet codified. |
| Core API hardening | Yellow | Request validation and auth verification exist, but CORS is permissive and abuse controls are uneven across endpoints. |
| LLM and external fetch surfaces | Yellow | Timeouts and some normalization exist, but outbound fetch controls, prompt-injection review, and cost-abuse protections need broader coverage. |
| Secrets and configuration | Yellow | Service-role keys are server-side in code, but secret-rotation, environment-separation, and config-drift procedures are not yet documented. |
| Monitoring and incident readiness | Red | No dedicated security monitoring, response playbook, or recurring audit automation is in place yet. |

## Current blockers

1. There was no canonical security inventory, threat model, or operations log before this pass.
2. Security controls are split across Expo config, Next.js server routes, Express middleware, and ad hoc SQL with no single source of truth.
3. Web-owned policy SQL is not yet mirrored into the core migration path, which increases environment drift risk.
4. There is no recurring security audit automation yet.

## Current known risks

1. The core API currently allows any origin via `cors({ origin: true })`, which should be narrowed to explicit environments.
2. `apps/mobile/app.json` currently enables arbitrary insecure loads on iOS and needs production review.
3. Server-side service-role Supabase clients are the default privileged data path, so route-level authorization bugs have high blast radius.
4. Some browser-accessible tables rely on policies defined outside the main migration path.
5. Rate limiting exists for curate chat, but not yet as a consistent control across all expensive or write-heavy endpoints.
6. Web security headers and CSP are not codified in app config or middleware.
7. Local-only auth bypass seams such as inferred `user_id` must stay impossible in production deployments.

## Current security inventory

### Controls already in place

- Supabase bearer-token verification in the core Express API
- Shared auth middleware for Next.js API routes
- Zod request validation for key API payloads and analytics batches
- Express JSON size limit of `1mb`
- Optional-auth handling for analytics ingestion
- Some endpoint-level abuse controls in curate chat
- Structured route logging with request IDs
- Server-side segregation of privileged keys from browser/mobile clients

### Controls missing or not yet standardized

- Explicit production origin allowlist for the API
- Canonical RLS and policy definitions in `packages/api-core/src/db/migrations/`
- Route-by-route authorization matrix and tests
- Web security headers and CSP strategy
- Mobile secure-storage and transport hardening decisions
- Consistent rate limiting for all expensive or write-heavy endpoints
- Dependency-audit and secrets-rotation workflow
- Dedicated security monitoring and incident-response guidance

## Gaps to fix first

### P0

- Move or mirror client-exposed policy SQL into the core migration path.
- Lock production CORS to explicit origins.
- Remove or tightly scope insecure mobile transport allowances.
- Add abuse controls to expensive and write-heavy routes.

### P1

- Add a route and table authorization matrix plus tests.
- Define web security headers and CSP.
- Document and gate any local-only auth bypass behavior.
- Review and reduce unnecessary service-role blast radius where feasible.

### P2

- Add dependency and lockfile auditing to the regular workflow.
- Add security monitoring, incident notes, and audit queries.
- Evaluate mobile secure-storage alternatives for sensitive client data.
- Add deeper LLM and outbound-fetch security tests.

## Questions this program must answer

1. Which server-side code paths can read or write user data with a service-role client?
2. Which tables are reachable directly from browser clients, and what policies protect them?
3. Which endpoints can be abused for cost amplification, spam, or denial of service?
4. Which user-controlled inputs reach logs, prompts, SQL filters, or outbound fetches?
5. Which environments allow insecure transport, mock data, or auth bypass behavior?
6. Which findings block release and how quickly must they be fixed?

## Next actions

1. Build the route, table, policy, and privileged-client inventory across the repo.
2. Normalize web-owned RLS and policy SQL into forward migrations under `packages/api-core/src/db/migrations/`.
3. Add production-origin, browser-header, and mobile-transport hardening tasks to the implementation backlog.
4. Add security-focused tests for authorization, policy drift, and abuse controls.
5. Enable a recurring security audit automation after approval.

## Change log

### 2026-03-01

- Created the initial repo-wide security plan.
- Established this operations log as the structured file for recurring updates.
- Documented baseline security findings from a repo-wide code sweep.
- Added agent instructions to keep security docs aligned with feature work.
- Proposed a recurring security audit workflow modeled after analytics.
