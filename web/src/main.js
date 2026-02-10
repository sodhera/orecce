import "./styles.css";

const DEFAULT_BASE_URL = "http://127.0.0.1:5001/ai-post-dev/us-central1/api";

const state = {
  postCursor: null,
  feedbackCursor: null
};

const elements = {
  baseUrl: byId("baseUrl"),
  userId: byId("userId"),
  mode: byId("mode"),
  profile: byId("profile"),
  length: byId("length"),
  bioInstructions: byId("bioInstructions"),
  nicheInstructions: byId("nicheInstructions"),
  feedbackPostId: byId("feedbackPostId"),
  feedbackType: byId("feedbackType"),
  feedbackPageSize: byId("feedbackPageSize"),
  healthStatus: byId("healthStatus"),
  streamOutput: byId("streamOutput"),
  latestPost: byId("latestPost"),
  postsOutput: byId("postsOutput"),
  feedbackOutput: byId("feedbackOutput"),
  logOutput: byId("logOutput")
};

elements.baseUrl.value = DEFAULT_BASE_URL;

byId("healthBtn").addEventListener("click", runHealthCheck);
byId("generateBtn").addEventListener("click", generatePost);
byId("streamBtn").addEventListener("click", generatePostStream);
byId("listBtn").addEventListener("click", () => listPosts(true));
byId("moreBtn").addEventListener("click", () => listPosts(false));
byId("loadPrefsBtn").addEventListener("click", loadPreferences);
byId("savePrefsBtn").addEventListener("click", savePreferences);
byId("sendFeedbackBtn").addEventListener("click", sendFeedback);
byId("listFeedbackBtn").addEventListener("click", () => listFeedback(true));

void runHealthCheck();

function byId(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}

function getBaseUrl() {
  return String(elements.baseUrl.value || "").trim().replace(/\/$/, "");
}

function getRequestPayload() {
  return {
    user_id: String(elements.userId.value || "").trim(),
    mode: String(elements.mode.value || "").trim(),
    profile: String(elements.profile.value || "").trim(),
    length: String(elements.length.value || "short").trim()
  };
}

function appendLog(message, payload) {
  const stamp = new Date().toLocaleTimeString();
  const line =
    typeof payload === "undefined"
      ? `[${stamp}] ${message}`
      : `[${stamp}] ${message}\n${JSON.stringify(payload, null, 2)}`;
  elements.logOutput.textContent = `${line}\n\n${elements.logOutput.textContent}`.trim();
}

async function requestJson(path, method, body) {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !data?.ok) {
    appendLog("API error", { path, status: response.status, data });
    throw new Error(data?.error?.message || `Request failed: ${response.status}`);
  }
  appendLog("API ok", { path, status: response.status });
  return data;
}

async function runHealthCheck() {
  try {
    const url = `${getBaseUrl()}/health`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(`Health check failed (${response.status})`);
    }
    elements.healthStatus.textContent = "Connected";
    appendLog("Health check passed");
  } catch (error) {
    elements.healthStatus.textContent = "Disconnected";
    appendLog("Health check failed", { message: String(error) });
  }
}

async function savePreferences() {
  const payload = {
    user_id: String(elements.userId.value || "").trim(),
    biography_instructions: String(elements.bioInstructions.value || "").trim(),
    niche_instructions: String(elements.nicheInstructions.value || "").trim()
  };
  const data = await requestJson("/v1/prompt-preferences/set", "POST", payload);
  appendLog("Preferences saved", data.data);
}

async function loadPreferences() {
  const userId = String(elements.userId.value || "").trim();
  const data = await requestJson(`/v1/prompt-preferences?user_id=${encodeURIComponent(userId)}`, "GET");
  elements.bioInstructions.value = data.data.biographyInstructions || "";
  elements.nicheInstructions.value = data.data.nicheInstructions || "";
  appendLog("Preferences loaded", data.data);
}

async function generatePost() {
  elements.streamOutput.textContent = "";
  const payload = getRequestPayload();
  const started = performance.now();
  const data = await requestJson("/v1/posts/generate", "POST", payload);
  const elapsedMs = Math.round(performance.now() - started);
  elements.latestPost.textContent = JSON.stringify({ latency_ms: elapsedMs, ...data.data }, null, 2);
  elements.feedbackPostId.value = data.data.id;
}

async function generatePostStream() {
  elements.streamOutput.textContent = "";
  const payload = getRequestPayload();
  const url = `${getBaseUrl()}/v1/posts/generate/stream`;
  const started = performance.now();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let chunkText = "";
  let finalPost = null;

  const processBlock = (block) => {
    const lines = block.split("\n").map((line) => line.trim());
    let eventName = "message";
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
      chunkText += String(parsed?.delta || "");
      elements.streamOutput.textContent = chunkText;
      return;
    }
    if (eventName === "post" && parsed?.ok) {
      finalPost = parsed.data;
      return;
    }
    if (eventName === "error") {
      throw new Error(parsed?.error?.message || "Stream error");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const marker = buffer.indexOf("\n\n");
      if (marker === -1) {
        break;
      }
      const block = buffer.slice(0, marker);
      buffer = buffer.slice(marker + 2);
      processBlock(block);
    }
  }
  if (buffer.trim()) {
    processBlock(buffer.trim());
  }

  const elapsedMs = Math.round(performance.now() - started);
  if (!finalPost) {
    throw new Error("Stream ended without final post");
  }
  elements.latestPost.textContent = JSON.stringify({ latency_ms: elapsedMs, ...finalPost }, null, 2);
  elements.feedbackPostId.value = finalPost.id;
  appendLog("Stream generated post", { latency_ms: elapsedMs, id: finalPost.id });
}

async function listPosts(resetCursor) {
  if (resetCursor) {
    state.postCursor = null;
  }
  const payload = {
    user_id: String(elements.userId.value || "").trim(),
    mode: String(elements.mode.value || "").trim(),
    profile: String(elements.profile.value || "").trim(),
    page_size: 10,
    ...(state.postCursor ? { cursor: state.postCursor } : {})
  };
  const data = await requestJson("/v1/posts/list", "POST", payload);
  state.postCursor = data.data.nextCursor;
  elements.postsOutput.textContent = JSON.stringify(data.data, null, 2);
  appendLog("Posts listed", { count: data.data.items?.length || 0, nextCursor: state.postCursor });
}

async function sendFeedback() {
  const postId = String(elements.feedbackPostId.value || "").trim();
  if (!postId) {
    throw new Error("Feedback post id is required");
  }
  const payload = {
    user_id: String(elements.userId.value || "").trim(),
    post_id: postId,
    feedback_type: String(elements.feedbackType.value || "upvote").trim()
  };
  const data = await requestJson("/v1/posts/feedback", "POST", payload);
  elements.feedbackOutput.textContent = JSON.stringify(data.data, null, 2);
  appendLog("Feedback saved", data.data);
}

async function listFeedback(resetCursor) {
  if (resetCursor) {
    state.feedbackCursor = null;
  }
  const payload = {
    user_id: String(elements.userId.value || "").trim(),
    page_size: Number(elements.feedbackPageSize.value || 20),
    ...(state.feedbackCursor ? { cursor: state.feedbackCursor } : {})
  };
  const data = await requestJson("/v1/posts/feedback/list", "POST", payload);
  state.feedbackCursor = data.data.nextCursor;
  elements.feedbackOutput.textContent = JSON.stringify(data.data, null, 2);
  appendLog("Feedback listed", { count: data.data.items?.length || 0, nextCursor: state.feedbackCursor });
}
