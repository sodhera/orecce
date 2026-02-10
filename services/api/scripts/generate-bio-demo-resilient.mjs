const BASE = "http://127.0.0.1:5001/ai-post-dev/us-central1/api";
const USER_ID = "demo-user";

async function post(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function setupPrefs() {
  const resp = await post("/v1/prompt-preferences/set", {
    user_id: USER_ID,
    biography_instructions:
      "Focus on widely documented public milestones only. Use almost-unbelievable high-stakes moments, sharp reversals, and concrete consequences for Elon Musk and Bob Iger."
  });
  if (!resp.ok) throw new Error(`prefs failed: ${JSON.stringify(resp)}`);
}

async function generateOne(profile, length = "medium") {
  return post("/v1/posts/generate", {
    user_id: USER_ID,
    mode: "BIOGRAPHY",
    profile,
    length
  });
}

async function generateWithRetries(profile, targetCount, maxAttempts = 12) {
  let okCount = 0;
  let attempts = 0;
  const failures = [];

  while (okCount < targetCount && attempts < maxAttempts) {
    attempts += 1;
    const resp = await generateOne(profile, "medium");
    if (resp.ok) {
      okCount += 1;
      continue;
    }
    failures.push(resp.error?.message || "unknown error");
  }

  if (okCount < targetCount) {
    throw new Error(
      `Could not generate enough posts for ${profile}. got=${okCount}, attempts=${attempts}, failures=${JSON.stringify(failures.slice(0, 4))}`
    );
  }
}

async function listPosts(profile) {
  const resp = await post("/v1/posts/list", {
    user_id: USER_ID,
    mode: "BIOGRAPHY",
    profile,
    page_size: 10
  });
  if (!resp.ok) throw new Error(`list failed: ${JSON.stringify(resp)}`);
  return resp.data.items;
}

function printProfile(profile, items) {
  console.log(`${profile.toUpperCase()}_COUNT ${items.length}`);
  items.slice(0, 3).forEach((it, idx) => {
    console.log(`${profile.toUpperCase()}_${idx + 1}_TITLE: ${it.title}`);
    console.log(`${profile.toUpperCase()}_${idx + 1}_CONF: ${it.confidence}`);
    console.log(`${profile.toUpperCase()}_${idx + 1}_BODY: ${it.body}`);
  });
}

async function main() {
  await setupPrefs();
  await generateWithRetries("Elon Musk", 3);
  await generateWithRetries("Bob Iger", 3);

  const elon = await listPosts("Elon Musk");
  const bob = await listPosts("Bob Iger");

  printProfile("elon", elon);
  printProfile("bob", bob);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
