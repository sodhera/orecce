# Orecce Security Review Plan

## Goal
Build a single repo-wide security review and maintenance workflow across mobile, web, API, database, and external integrations so Orecce can answer:

- Which trust boundaries exist and which assets each surface handles.
- Which attack classes matter for each part of the stack.
- Which controls are implemented today and which are still missing.
- Which risks block a release versus which can be tracked as backlog.
- Which security docs, tests, and controls must be updated whenever a new feature lands.

This plan defines the security program and review workflow. It is not a claim that the application is already secure against every attack or bug.

## Implementation status

Implemented on 2026-03-01:

- Repo-wide security strategy in `docs/security-review-plan.md`
- Living security operations log in `docs/security-review-ops.md`
- Agent instructions in `AGENTS.md` requiring security docs to stay aligned with feature work
- Canonical web client RLS tables and policies mirrored into `packages/api-core/src/db/migration.sql`
- Forward migration for already-provisioned databases in `packages/api-core/src/db/migrations/2026-03-01-web-client-rls.sql`
- Environment-driven API CORS allowlist with local-development defaults
- Shared in-memory abuse limiter applied to costly and write-heavy web and API routes
- iOS App Transport Security tightened to local-only exceptions for development

## Security program deliverables

1. A strategy document that defines scope, priorities, and required controls.
2. A living operations log that tracks coverage, known findings, blockers, and next actions.
3. A recurring security audit automation once enabled.
4. A route, table, secret, and trust-boundary inventory for the full repo.
5. Security-focused tests and release gates for high-risk paths.
6. A documented remediation workflow for critical and high-severity findings.

## Scope

| Surface | Assets | Primary risks | Expected controls |
| --- | --- | --- | --- |
| Mobile (`apps/mobile`) | Supabase session state, local preferences, analytics/session identifiers, API base URL, deep-link and OAuth flows | Token theft, insecure transport, auth bypass, unsafe local storage, over-logging | Secure session-storage review, transport hardening, route and auth checks, dependency review, privacy-safe logging |
| Web (`apps/web`) | Browser session, direct Supabase client access, Next.js API routes, low-sensitivity browser storage for tab-resume caches, user feedback and curation flows | XSS, broken access control, RLS drift, CSRF assumptions, weak browser headers, over-broad client data access | CSP/header strategy, route authz review, RLS verification, input/output handling review, low-sensitivity client storage |
| API (`services/api` and `packages/api-core`) | Bearer auth, write endpoints, recommendation state, LLM and news fetch paths, request logs | Broken authz, permissive CORS, SSRF, abuse/cost amplification, unsafe logging, prompt injection | Authn/authz matrix, origin allowlist, rate limiting, payload validation, outbound fetch restrictions, structured redaction |
| Database and Supabase | User tables, analytics, feedback, recommendation state, views, service-role access | Missing or drifting RLS, excessive service-role blast radius, migration drift, data retention issues | Canonical forward migrations, RLS/policy tests, least-privilege review, retention rules, schema ownership clarity |
| External integrations | OpenAI, RSS/news fetches, article scraping, Google auth | Secret leakage, prompt injection, unsafe URL fetching, provider misconfiguration, third-party drift | Secret management, URL allowlists, timeout and content limits, provider-specific hardening, audit logging |
| Delivery and operations | Environment variables, lockfiles, release workflow, docs, automation | Supply-chain issues, config drift, missing audits, untracked risk, stale documentation | Dependency scanning, environment separation, recurring audit automation, release checklist, living docs |

## Threat model and review pillars

### 1. Authentication and session integrity

Review every login, logout, token-refresh, OAuth, password-reset, and session-storage path. The output should state which identity source is canonical, where sessions are stored, which code paths can act for a user, and which environments allow bypass behavior.

### 2. Authorization and data access

Review every route, RPC, direct Supabase client query, server-side service-role query, and table policy. The output should map which identities may read or write which records, and whether that control lives in app code, RLS, or both.

Current web client direct-write scope now includes both author and topic follow state (`user_author_follows`, `user_topic_follows`), so those tables and their RLS policies must stay aligned with product changes.

### 3. Client storage, browser, and transport security

Review local storage, sessionStorage, AsyncStorage, deep links, browser headers, TLS assumptions, mobile transport settings, and any client-side caching of user data. The output should identify where tokens or sensitive state live, whether cached data stays low sensitivity, and whether transport or origin rules are too permissive.

### 4. Input validation, output handling, and logging

Review request validation, model-output handling, query parameter usage, error serialization, and logs. The output should state which inputs are validated, which sinks remain sensitive, and whether logs or error bodies can leak secrets or user content.

### 5. External fetch, LLM, and ingestion security

Review article-text fetches, RSS/news ingestion, OpenAI calls, and prompt-building paths. The output should cover SSRF risk, content-size and timeout bounds, domain controls, prompt-injection exposure, and data minimization.

### 6. Abuse prevention and resilience

Review rate limits, request budgets, dedupe rules, replay resistance, and expensive endpoint protection. The output should identify which endpoints can drive cost or write amplification and which controls prevent abuse.

### 7. Secrets, dependencies, and release process

Review environment-variable handling, service-role usage, package-lock drift, dependency auditing, and deployment assumptions. The output should define how secrets are rotated, where privileged keys live, and which automated checks run before release.

## Current baseline findings to prioritize

1. Server-side service-role Supabase clients are still the default privileged data path, so route-level authorization bugs have high blast radius.
2. Browser security headers and CSP are not yet codified in the web app configuration.
3. Abuse controls are now broader, but they are still in-memory and not yet backed by a distributed store or edge control.
4. Anonymous feedback insertion remains intentionally open and needs product-level spam tolerance review.
5. Local-only auth bypass seams in core code must stay impossible in production deployments.

## Review methodology

### Phase 0. Baseline inventory

- Enumerate routes, tables, RPCs, privileged clients, secrets, third-party integrations, and user-controlled inputs.
- Document current controls and gaps in `docs/security-review-ops.md`.
- Normalize security ownership so migrations, policies, and docs live in canonical locations.

Acceptance criteria:

- Every major surface is listed in the ops log.
- Known high-risk gaps are documented with owners and priorities.
- Feature teams have clear instructions in `AGENTS.md`.

### Phase 1. Immediate hardening

- Lock production CORS to explicit origins.
- Review and tighten mobile transport settings.
- Move or mirror client-exposed table policies into forward migrations.
- Add abuse controls to expensive write and LLM-backed routes.
- Document and gate any local-only auth bypass behavior.

Acceptance criteria:

- No production path depends on implicit or undocumented origin, auth, or transport assumptions.
- High-risk policy drift between app SQL and migration SQL is removed.
- High-cost endpoints have bounded usage.

### Phase 2. Authorization assurance

- Build a route-by-route and table-by-table authorization matrix.
- Add tests for server-side authz, policy drift, and user-boundary enforcement.
- Reduce unnecessary service-role exposure where a user-scoped client or stricter seam is possible.

Acceptance criteria:

- Every write path has an explicit authorization rule.
- Direct client table access has tested RLS.
- Server-only privileged paths are intentional and documented.

### Phase 3. External integration hardening

- Add URL allowlists or domain constraints for external fetches where possible.
- Review prompt inputs and outbound model calls for prompt-injection and data-exfiltration risk.
- Document secret rotation, failure handling, and fallback behavior.

Acceptance criteria:

- External fetches have clear bounds.
- Privileged secrets stay server-side and are minimally scoped.
- LLM and ingestion paths have documented protections and tests.

### Phase 4. Continuous assurance

- Enable recurring security audit automation.
- Add dependency and lockfile auditing to the release workflow.
- Add security monitoring queries, alerting thresholds, and incident-response notes.
- Refresh the threat model when new features land.

Acceptance criteria:

- Security docs are updated during normal feature work.
- Recurring audits refresh the ops log.
- Release decisions can reference current security status instead of stale assumptions.

## Required change-management rules

When a change touches any of the following, the same change must update `docs/security-review-plan.md` or `docs/security-review-ops.md` as needed:

- Auth flows, session handling, token storage, OAuth, password reset, or identity linkage
- API routes, request validation, error handling, CORS, streaming, or rate limiting
- Supabase tables, RPCs, policies, migrations, or service-role usage
- Browser storage, mobile local storage, deep links, or transport configuration
- External fetchers, article scraping, RSS/news ingestion, or LLM prompt/output logic
- Secret handling, privileged environment variables, or deployment config
- Any new user-facing or backend feature that creates a new trust boundary or attack surface

Security review is part of feature delivery. New features are not done until their attack surface, controls, gaps, and required docs updates are recorded.

## Proposed recurring audit automation

Once enabled, the recurring security audit should:

1. Review `docs/security-review-plan.md`.
2. Scan `apps/mobile`, `apps/web`, `services/api`, and `packages/api-core` for new trust boundaries or security-relevant changes.
3. Update `docs/security-review-ops.md` with coverage, findings, blockers, and next actions.
4. Update this plan if priorities, controls, or architecture changed.
5. Update `AGENTS.md` if the workflow or required files changed.

## Definition of done for the security program

The security workflow is in a good state when:

- Security docs stay current as part of normal feature work.
- Every major surface has an inventory, threat model, and current-status entry.
- High-risk findings have owners, acceptance criteria, and validation.
- Canonical migrations own the database security model.
- Recurring audits keep the ops log current without rewriting the document structure.
