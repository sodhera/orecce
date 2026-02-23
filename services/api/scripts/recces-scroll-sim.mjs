#!/usr/bin/env node
/* eslint-disable no-console */

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const AUTHOR_ID = process.env.AUTHOR_ID ?? "paul_graham";
const LIMIT = Number(process.env.LIMIT ?? "10");
const ROUNDS = Number(process.env.ROUNDS ?? "12");
const RECENT_WINDOW = Number(process.env.RECENT_WINDOW ?? "5");
const WAIT_MS = Number(process.env.WAIT_MS ?? "0");
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "";
const RUN_ID = process.env.RUN_ID ?? `${Date.now()}`;
const ALLOW_DOWNVOTE = String(process.env.ALLOW_DOWNVOTE ?? "false").toLowerCase() === "true";

const USERS = [
  {
    id: "rec-sim-user-1",
    preferences: ["user", "users", "support", "startup", "founder", "iterate"]
  },
  {
    id: "rec-sim-user-2",
    preferences: ["investor", "investors", "fundraising", "equity", "term", "round"]
  },
  {
    id: "rec-sim-user-3",
    preferences: ["lisp", "compiler", "language", "programming", "software", "semantics"]
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (AUTH_TOKEN.trim()) {
    headers.Authorization = `Bearer ${AUTH_TOKEN.trim()}`;
  }
  return headers;
}

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${path}: ${text.slice(0, 300)}`);
  }
  if (!response.ok || json?.ok !== true) {
    const details = json?.error ? JSON.stringify(json.error) : text.slice(0, 300);
    throw new Error(`${path} failed (${response.status}): ${details}`);
  }
  return json.data;
}

function affinity(item, preferences) {
  const haystack = `${item.theme} ${item.previewText} ${(item.tags ?? []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const keyword of preferences) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }
  return score;
}

function pickFeedback(affinityScore) {
  if (affinityScore >= 2) {
    return "upvote";
  }
  if (affinityScore === 0) {
    return ALLOW_DOWNVOTE ? "downvote" : null;
  }
  return null;
}

function summarizeUserRuns(runs) {
  const firstCut = Math.max(1, Math.floor(runs.length / 2));
  const firstHalf = runs.slice(0, firstCut);
  const secondHalf = runs.slice(firstCut);

  const ratio = (items) => {
    if (!items.length) {
      return 0;
    }
    const hits = items.filter((item) => item.affinity > 0).length;
    return Number((hits / items.length).toFixed(4));
  };

  return {
    rounds: runs.length,
    first_half_relevance_ratio: ratio(firstHalf),
    second_half_relevance_ratio: ratio(secondHalf),
    relevance_lift: Number((ratio(secondHalf) - ratio(firstHalf)).toFixed(4)),
    upvotes: runs.filter((item) => item.feedback === "upvote").length,
    downvotes: runs.filter((item) => item.feedback === "downvote").length,
    no_feedback: runs.filter((item) => item.feedback === null).length
  };
}

async function runUser(user) {
  const seen = new Set();
  const recent = [];
  const rounds = [];
  const feedbackByPost = new Map();

  for (let i = 0; i < ROUNDS; i += 1) {
    let recs = await post("/v1/recommendations/recces", {
      user_id: user.id,
      author_id: AUTHOR_ID,
      limit: LIMIT,
      recent_post_ids: recent.slice(-RECENT_WINDOW),
      exclude_post_ids: Array.from(seen)
    });

    if (!Array.isArray(recs.items) || recs.items.length === 0) {
      // If corpus is small, recycle older seen posts while still suppressing very recent repeats.
      seen.clear();
      for (const [postId, feedback] of feedbackByPost.entries()) {
        if (feedback === "downvote") {
          seen.add(postId);
        }
      }
      recs = await post("/v1/recommendations/recces", {
        user_id: user.id,
        author_id: AUTHOR_ID,
        limit: LIMIT,
        recent_post_ids: recent.slice(-RECENT_WINDOW),
        exclude_post_ids: Array.from(seen)
      });
    }

    if (!Array.isArray(recs.items) || recs.items.length === 0) {
      // Last fallback for tiny datasets: allow all historical posts except immediate recency window.
      recs = await post("/v1/recommendations/recces", {
        user_id: user.id,
        author_id: AUTHOR_ID,
        limit: LIMIT,
        recent_post_ids: recent.slice(-RECENT_WINDOW),
        exclude_post_ids: []
      });
    }

    if (!Array.isArray(recs.items) || recs.items.length === 0) {
      // Final fallback: drop recency constraints for very small corpora.
      recs = await post("/v1/recommendations/recces", {
        user_id: user.id,
        author_id: AUTHOR_ID,
        limit: LIMIT,
        recent_post_ids: [],
        exclude_post_ids: []
      });
    }

    if (!Array.isArray(recs.items) || recs.items.length === 0) {
      throw new Error(`[${user.id}] no recommendations returned at round ${i + 1}`);
    }

    const chosen = recs.items[0];
    const score = affinity(chosen, user.preferences);
    const feedbackType = pickFeedback(score);

    seen.add(chosen.id);
    recent.push(chosen.id);
    if (feedbackType) {
      feedbackByPost.set(chosen.id, feedbackType);
      await post("/v1/posts/feedback", {
        user_id: user.id,
        post_id: chosen.id,
        feedback_type: feedbackType
      });
    }

    rounds.push({
      round: i + 1,
      postId: chosen.id,
      theme: chosen.theme,
      score: chosen.score,
      affinity: score,
      feedback: feedbackType
    });

    console.log(
      `[${user.id}] round=${i + 1} theme="${chosen.theme}" affinity=${score} feedback=${feedbackType ?? "none"} score=${chosen.score}`
    );

    if (WAIT_MS > 0) {
      await sleep(WAIT_MS);
    }
  }

  return {
    userId: user.id,
    preferences: user.preferences,
    rounds,
    summary: summarizeUserRuns(rounds)
  };
}

async function main() {
  const startedAt = Date.now();
  const results = [];
  for (const user of USERS) {
    const scopedUser = {
      ...user,
      id: `${user.id}-${RUN_ID}`
    };
    results.push(await runUser(scopedUser));
  }

  const summary = {
    config: {
      base: BASE,
      author_id: AUTHOR_ID,
      users: USERS.length,
      rounds_per_user: ROUNDS,
      recommend_limit: LIMIT,
      recent_window: RECENT_WINDOW,
      auth_header_used: Boolean(AUTH_TOKEN.trim()),
      run_id: RUN_ID
    },
    users: results.map((item) => ({
      userId: item.userId,
      preferences: item.preferences,
      summary: item.summary
    })),
    total_runtime_ms: Date.now() - startedAt
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
