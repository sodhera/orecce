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
- Scope: repo-wide implementation pass across mobile, web, API, schema, and security workflow
- Review type: baseline hardening pass after initial security review findings

## Coverage snapshot

| Area | Coverage | Notes |
| --- | --- | --- |
| Identity and authentication | Yellow | Supabase bearer verification exists in the main API paths, but local-mode seams still exist in core code and require strict environment gating. |
| Authorization and database policy model | Yellow | Web client RLS tables and policies are now mirrored into the canonical schema and forward migration path; web Recce follows now hit both `user_author_follows` and `user_topic_follows`, but the full route/table authorization matrix is still missing. |
| Mobile client and session handling | Yellow | iOS arbitrary loads were removed in favor of local-only ATS exceptions, but secure-storage review and privacy logging review remain open. |
| Web browser surface | Yellow | Authenticated flows and server routes exist, and low-sensitivity route state plus feed/discover/collection/post snapshots now resume from sessionStorage, but CSP and browser security headers are not yet codified. |
| Core API hardening | Yellow | CORS is now allowlisted and several costly/write-heavy routes have request budgets, but protections are still in-memory only. |
| LLM and external fetch surfaces | Yellow | Curate chat and several mutation paths are budgeted, but outbound fetch controls, prompt-injection review, and broader cost controls still need work. |
| Secrets and configuration | Yellow | Service-role keys remain server-side and CORS config is now explicit, but secret-rotation and least-privilege work remain open. |
| Monitoring and incident readiness | Red | No dedicated security monitoring, response playbook, or recurring audit automation is in place yet. |

## Current blockers

1. There is still no route-by-route authorization matrix or policy test harness.
2. Security controls are split across Expo config, Next.js routes, Express middleware, and Supabase schema, even though canonical docs now exist.
3. Abuse limiting is best-effort only because it currently lives in process memory.
4. There is no recurring security audit automation yet.

## Current known risks

1. Server-side service-role Supabase clients remain the default privileged data path.
2. Web security headers and CSP are not codified in app config or middleware.
3. In-memory rate limiting will not synchronize across multiple server instances.
4. Anonymous feedback insertion remains open by design and needs spam-tolerance review.
5. Local-only auth bypass seams such as inferred `user_id` must stay impossible in production deployments.

## Current security inventory

### Controls already in place

- Supabase bearer-token verification in the core Express API
- Shared auth middleware for Next.js API routes
- Zod request validation for key API payloads and analytics batches
- Express JSON size limit of `1mb`
- Optional-auth handling for analytics ingestion
- Explicit API CORS allowlist with local-development defaults
- Canonical RLS and policy definitions for web client tables in the base schema and forward migration path
- Browser-side follow writes for both author and topic Recces, backed by Supabase RLS on `user_author_follows` and `user_topic_follows`
- Tab-scoped sessionStorage cache for low-sensitivity route state, drafts, and feed/Recce/collection/post snapshots, with no auth tokens or password values stored in the cache layer
- Request budgets on curate chat plus other costly and write-heavy web/API routes
- Structured route logging with request IDs
- Local-only iOS transport exceptions instead of global arbitrary-load allowance
- Server-side segregation of privileged keys from browser/mobile clients

### Controls missing or not yet standardized

- Route-by-route authorization matrix and tests
- Web security headers and CSP strategy
- Mobile secure-storage review for sensitive client state
- Distributed abuse controls beyond in-memory process state
- Dependency-audit and secrets-rotation workflow
- Dedicated security monitoring and incident-response guidance

## Gaps to fix first

### P0

- Add authorization tests for service-role-backed routes.
- Add browser headers and CSP for the web app.
- Document and gate any local-only auth bypass behavior.
- Add distributed rate limiting or upstream abuse controls for scaled deployments.

### P1

- Build the route and table authorization matrix.
- Review direct browser writes to `user_feedback` for spam tolerance and ownership.
- Review and reduce unnecessary service-role blast radius where feasible.
- Add outbound-fetch guardrails for article and news ingestion paths.

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
2. Add authorization and policy-drift tests around the newly canonical web client tables.
3. Add browser security headers/CSP and document the production origin allowlist.
4. Replace or augment in-memory abuse limits with environment-appropriate shared controls.
5. Enable a recurring security audit automation after approval.

## Change log

### 2026-03-01

- Created the initial repo-wide security plan.
- Established this operations log as the structured file for recurring updates.
- Mirrored web client RLS tables and policies into the canonical base schema and a forward migration.
- Replaced origin-reflective API CORS with an explicit allowlist model.
- Added broader request budgeting to costly and write-heavy web/API routes.
- Tightened iOS transport security to local-only development exceptions.
- Added agent instructions to keep security docs aligned with feature work.
- Expanded the web Recce follow surface to include topic follows via `user_topic_follows`, making that client-exposed RLS path part of the current security inventory.
- Expanded the tab-scoped web cache to low-sensitivity route state and page snapshots, and documented that it stores UI data only, not auth tokens or password values.
