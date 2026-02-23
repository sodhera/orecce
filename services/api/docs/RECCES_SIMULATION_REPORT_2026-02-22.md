# Recces Recommendation Simulation Report (2026-02-22)

## Objective
- Simulate end-user feed behavior (recommend -> open -> feedback -> next recommend) and evaluate whether recommendations improve through session interaction.

## Environment
- API: local dev server (`http://127.0.0.1:8787`)
- Auth mode: disabled (dev server)
- Recces corpus used for local simulation: static seed dataset in `functions/scripts/staticReccesRepository.ts` (7 unique themes/posts total).
- Engine under test:
  - `POST /v1/recommendations/recces`
  - feedback via `POST /v1/posts/feedback`

## What Was Run
Server:
```bash
npm --prefix services/api/functions run dev:server
```

Simulation runs:
```bash
BASE=http://127.0.0.1:8787 ROUNDS=7  LIMIT=8 RUN_ID=baseline node services/api/scripts/recces-scroll-sim.mjs
BASE=http://127.0.0.1:8787 ROUNDS=7  LIMIT=8 RUN_ID=downvote ALLOW_DOWNVOTE=true node services/api/scripts/recces-scroll-sim.mjs
BASE=http://127.0.0.1:8787 ROUNDS=12 LIMIT=8 RUN_ID=long node services/api/scripts/recces-scroll-sim.mjs
```

Artifacts:
- Raw logs: `services/api/.sim-results/*.log`
- Parsed JSON: `services/api/.sim-results/*.json`

## Summary Results

| Scenario | Users | Rounds/User | Avg First-Half Relevance | Avg Second-Half Relevance | Avg Relevance Lift | Total Upvotes | Total Downvotes | No-feedback events | Duplicate rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 3 | 7 | 0.5556 | 0.1667 | -0.3889 | 5 | 0 | 16 | 0.0000 |
| downvote | 3 | 7 | 0.5555 | 0.1667 | -0.3889 | 5 | 14 | 2 | 0.0000 |
| long | 3 | 12 | 0.3333 | 0.1667 | -0.1667 | 5 | 0 | 31 | 0.4167 |

## Detailed Observations
1. In 7-round runs, users saw all 7 unique themes with no duplicates.
2. In 12-round runs, duplicates appeared after corpus exhaustion:
   - 15 duplicate rounds out of 36 total rounds (41.67% duplicate rate).
3. Relevance generally declined across sessions:
   - highest relevance tended to appear in early rounds.
   - second-half relevance was lower in all scenarios.
4. Aggressive downvoting did not improve aggregate relevance in this small corpus setup.

## What Worked
1. End-to-end interaction loop worked reliably:
   - recommendation requests succeeded.
   - feedback writes succeeded.
   - next recommendations reflected prior feedback/session context.
2. Latency was low in local runs (all three scenarios completed in ~94-128 ms total runtime).
3. The simulator now handles small-corpus exhaustion with fallback behavior instead of immediate failure.

## What Did Not Work Well
1. Quality gains over time were limited in this run setup, largely because the local dataset is tiny (7 unique candidates).
2. Long sessions showed noticeable repetition after candidate exhaustion.
3. Because feedback was sparse (many `no_feedback` rounds), the model received weak personalization signals.

## Deployment Check
- Attempted cloud simulation against:
  - `https://us-central1-audit-3a7ec.cloudfunctions.net/api`
- Result:
  - `/health` works.
  - `/v1/recommendations/recces` returned `Cannot POST /v1/recommendations/recces`.
- Conclusion:
  - the new recommendation endpoint is implemented locally but not yet deployed to cloud.

## Recommendations
1. Deploy current API changes to cloud so real Firestore corpus simulations can run against production-like data.
2. Expand interaction signals beyond `upvote/downvote/skip`:
   - add `view`, `dwell_ms`, and hide events.
3. Increase candidate pool for long-session quality:
   - use the full Recces corpus and/or topic expansion candidates.
4. Introduce feed precompute for large corpora and longer sessions to stabilize quality and avoid repetitive fallbacks.

