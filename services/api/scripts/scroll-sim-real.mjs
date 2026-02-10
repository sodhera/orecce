#!/usr/bin/env node
/* eslint-disable no-console */

const BASE = process.env.BASE ?? "http://127.0.0.1:5001/ai-post-dev/us-central1/api";
const MODE = process.env.MODE ?? "BIOGRAPHY";
const PROFILE = process.env.PROFILE ?? "Bill Gates";
const LENGTH = process.env.LENGTH ?? "short";
const POST_LOAD = Number(process.env.POST_LOAD ?? "4");
const SCROLL_ROUNDS = Number(process.env.SCROLL_ROUNDS ?? "3");

const users = [
  { id: "sim-user-1", readSeconds: 7 },
  { id: "sim-user-2", readSeconds: 12 },
  { id: "sim-user-3", readSeconds: 17 }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, p) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function generateStream({ userId, mode, profile, length }) {
  const start = Date.now();
  const response = await fetch(`${BASE}/v1/posts/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      mode,
      profile,
      length
    })
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`Streaming request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let currentEvent = "message";
  let streamedChars = 0;
  let firstChunkMs = null;
  let finalPost = null;
  let eventError = null;

  const processBlock = (block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    let eventName = currentEvent;
    const dataLines = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    const raw = dataLines.join("\n");
    if (!raw) {
      return;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (eventName === "chunk") {
      const delta = typeof parsed?.delta === "string" ? parsed.delta : "";
      if (delta.length > 0) {
        streamedChars += delta.length;
        if (firstChunkMs === null) {
          firstChunkMs = Date.now() - start;
        }
      }
      return;
    }

    if (eventName === "post" && parsed?.ok === true) {
      finalPost = parsed.data;
      return;
    }

    if (eventName === "error") {
      eventError = parsed?.error ?? { code: "stream_error", message: "Unknown stream error." };
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx === -1) {
        break;
      }
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      processBlock(block);
    }
  }

  if (buffer.trim()) {
    processBlock(buffer.trim());
  }

  const totalMs = Date.now() - start;

  if (eventError) {
    return {
      ok: false,
      totalMs,
      firstChunkMs,
      streamedChars,
      error: eventError
    };
  }

  if (!finalPost) {
    return {
      ok: false,
      totalMs,
      firstChunkMs,
      streamedChars,
      error: { code: "missing_post_event", message: "No final post event received." }
    };
  }

  return {
    ok: true,
    totalMs,
    firstChunkMs,
    streamedChars,
    postId: finalPost.id,
    title: finalPost.title
  };
}

async function runUser(user) {
  console.log(`[${user.id}] preloading ${POST_LOAD} posts (concurrent)`);
  const preloadResults = await Promise.all(
    Array.from({ length: POST_LOAD }, () =>
      generateStream({
        userId: user.id,
        mode: MODE,
        profile: PROFILE,
        length: LENGTH
      })
    )
  );

  const scrollResults = [];
  for (let i = 0; i < SCROLL_ROUNDS; i++) {
    await sleep(user.readSeconds * 1000);
    const next = await generateStream({
      userId: user.id,
      mode: MODE,
      profile: PROFILE,
      length: LENGTH
    });
    scrollResults.push(next);
    console.log(`[${user.id}] scroll ${i + 1}/${SCROLL_ROUNDS} generated in ${next.totalMs}ms`);
  }

  return {
    userId: user.id,
    readSeconds: user.readSeconds,
    preloadResults,
    scrollResults
  };
}

function summarize(allResults) {
  const flat = allResults.flatMap((user) => [...user.preloadResults, ...user.scrollResults]);
  const successes = flat.filter((item) => item.ok);
  const failures = flat.filter((item) => !item.ok);
  const totals = successes.map((item) => item.totalMs);
  const firstChunks = successes.map((item) => item.firstChunkMs).filter((item) => Number.isFinite(item));
  const p50 = percentile(totals, 50);
  const p95 = percentile(totals, 95);
  const firstChunkP50 = percentile(firstChunks, 50);
  const firstChunkP95 = percentile(firstChunks, 95);

  return {
    config: {
      mode: MODE,
      profile: PROFILE,
      length: LENGTH,
      users: users.length,
      initial_posts_per_user: POST_LOAD,
      scroll_rounds_per_user: SCROLL_ROUNDS
    },
    totals: {
      requests: flat.length,
      success: successes.length,
      failed: failures.length
    },
    latency_ms: {
      p50_total: p50,
      p95_total: p95,
      max_total: totals.length ? Math.max(...totals) : null,
      p50_first_chunk: firstChunkP50,
      p95_first_chunk: firstChunkP95
    },
    failures: failures.slice(0, 5)
  };
}

async function main() {
  if (String(process.env.MOCK_LLM ?? "").toLowerCase() === "true") {
    throw new Error("MOCK_LLM=true is not allowed for this script. Use real LLM.");
  }

  const startedAt = Date.now();
  const results = await Promise.all(users.map((user) => runUser(user)));
  const summary = summarize(results);
  summary.total_runtime_ms = Date.now() - startedAt;

  console.log(JSON.stringify(summary, null, 2));

  if (summary.totals.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
