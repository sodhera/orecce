import "./styles.css";

const STORAGE_KEY = "orecce-web-settings-v3";
const DEFAULT_BASE_URL = "http://127.0.0.1:5001/ai-post-dev/us-central1/api";

const CATALOG = {
  FACTS: {
    label: "Facts",
    apiMode: "TRIVIA",
    options: ["Space", "History", "Biology", "Tech", "Sports"]
  },
  NICHE: {
    label: "Niche",
    apiMode: "NICHE",
    options: ["90s Nostalgia", "Y2K Internet", "Cozy Gaming", "Streetwear Culture", "Dark Academia"]
  },
  BIOGRAPHIES: {
    label: "Biographies",
    apiMode: "BIOGRAPHY",
    options: ["Elon Musk", "Steve Jobs", "Warren Buffett", "Bill Gates", "Jeff Bezos"]
  }
};

const state = {
  settings: {
    baseUrl: DEFAULT_BASE_URL,
    userId: createUserId(),
    category: "BIOGRAPHIES",
    profile: "Bill Gates",
    length: "short"
  },
  nextCursor: null,
  loadedPostIds: new Set(),
  isGenerating: false,
  hasUserScrolled: false,
  observer: null,
  lastAutoMs: 0
};

const view = {
  setupScreen: byId("setupScreen"),
  feedScreen: byId("feedScreen"),
  healthPill: byId("healthPill"),
  toast: byId("toast"),
  modeGrid: byId("modeGrid"),
  optionHeading: byId("optionHeading"),
  optionGrid: byId("optionGrid"),
  userId: byId("userId"),
  length: byId("length"),
  baseUrl: byId("baseUrl"),
  checkHealthBtn: byId("checkHealthBtn"),
  enterFeedBtn: byId("enterFeedBtn"),
  feedTitle: byId("feedTitle"),
  feedSubtitle: byId("feedSubtitle"),
  streamPanel: byId("streamPanel"),
  generationStatus: byId("generationStatus"),
  feedList: byId("feedList"),
  feedSentinel: byId("feedSentinel"),
  backToSetupBtn: byId("backToSetupBtn"),
  generateNowBtn: byId("generateNowBtn")
};

bootstrap();

function bootstrap() {
  loadSettings();
  renderSetup();
  bindHandlers();
  void checkHealth();
}

function createUserId() {
  return `web-user-${Math.floor(Math.random() * 10000)}`;
}

function byId(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element;
}

function bindHandlers() {
  view.checkHealthBtn.addEventListener("click", () => void checkHealth(true));
  view.enterFeedBtn.addEventListener("click", () => void enterFeed());
  view.backToSetupBtn.addEventListener("click", () => {
    stopFeedObserver();
    showScreen("setup");
  });
  view.generateNowBtn.addEventListener("click", () => void generateNextPost("manual"));

  window.addEventListener(
    "scroll",
    () => {
      state.hasUserScrolled = true;
    },
    { passive: true }
  );
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    state.settings = { ...state.settings, ...parsed };
  } catch {
    // ignore
  }

  if (!CATALOG[state.settings.category]) {
    state.settings.category = "BIOGRAPHIES";
  }

  const categoryOptions = CATALOG[state.settings.category].options;
  if (!categoryOptions.includes(state.settings.profile)) {
    state.settings.profile = categoryOptions[0];
  }
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
}

function syncSettingsFromInputs() {
  state.settings.userId = String(view.userId.value || "").trim();
  state.settings.length = String(view.length.value || "short").trim();
  state.settings.baseUrl = String(view.baseUrl.value || "").trim().replace(/\/$/, "");
}

function renderSetup() {
  view.userId.value = state.settings.userId;
  view.length.value = state.settings.length;
  view.baseUrl.value = state.settings.baseUrl;

  const categories = Object.keys(CATALOG);
  view.modeGrid.innerHTML = categories
    .map((key) => {
      const activeClass = state.settings.category === key ? "active" : "";
      return `<button class="mode-pill ${activeClass}" data-category="${key}">${CATALOG[key].label}</button>`;
    })
    .join("");

  for (const button of Array.from(view.modeGrid.querySelectorAll("button[data-category]"))) {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      if (!category || !CATALOG[category]) {
        return;
      }
      state.settings.category = category;
      if (!CATALOG[category].options.includes(state.settings.profile)) {
        state.settings.profile = CATALOG[category].options[0];
      }
      renderSetup();
      persistSettings();
    });
  }

  const selected = CATALOG[state.settings.category];
  view.optionHeading.textContent = `${selected.label} options`;
  view.optionGrid.innerHTML = selected.options
    .map((option) => {
      const activeClass = state.settings.profile === option ? "active" : "";
      return `<button class="option-pill ${activeClass}" data-profile="${escapeHtml(option)}">${escapeHtml(option)}</button>`;
    })
    .join("");

  for (const button of Array.from(view.optionGrid.querySelectorAll("button[data-profile]"))) {
    button.addEventListener("click", () => {
      const profile = button.dataset.profile;
      if (!profile) {
        return;
      }
      state.settings.profile = profile;
      renderSetup();
      persistSettings();
    });
  }
}

function showScreen(name) {
  const isSetup = name === "setup";
  view.setupScreen.classList.toggle("hidden", !isSetup);
  view.feedScreen.classList.toggle("hidden", isSetup);
}

function setHealthPill(connected) {
  view.healthPill.classList.remove("live", "dead");
  if (connected) {
    view.healthPill.classList.add("live");
    view.healthPill.textContent = "Backend connected";
  } else {
    view.healthPill.classList.add("dead");
    view.healthPill.textContent = "Backend unavailable";
  }
}

function showToast(message) {
  view.toast.textContent = message;
  view.toast.classList.remove("hidden");
  setTimeout(() => {
    view.toast.classList.add("hidden");
  }, 2600);
}

async function checkHealth(showToaster = false) {
  syncSettingsFromInputs();
  persistSettings();
  try {
    const response = await fetch(`${state.settings.baseUrl}/health`);
    const payload = await response.json();
    const ok = response.ok && payload?.ok === true;
    setHealthPill(ok);
    if (showToaster) {
      showToast(ok ? "Connection looks good." : "Cannot reach backend.");
    }
    return ok;
  } catch {
    setHealthPill(false);
    if (showToaster) {
      showToast("Cannot reach backend.");
    }
    return false;
  }
}

async function apiRequest(path, method = "GET", body) {
  const response = await fetch(`${state.settings.baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error?.message || `Request failed (${response.status})`);
  }

  return payload;
}

function postPayload() {
  const category = CATALOG[state.settings.category];
  return {
    user_id: state.settings.userId,
    mode: category.apiMode,
    profile: state.settings.profile,
    length: state.settings.length
  };
}

function updateFeedHeader() {
  const category = CATALOG[state.settings.category];
  view.feedTitle.textContent = `${category.label}: ${state.settings.profile}`;
  view.feedSubtitle.textContent = "Scroll and the app keeps generating new posts.";
}

function clearFeed() {
  state.nextCursor = null;
  state.loadedPostIds.clear();
  view.feedList.innerHTML = "";
}

async function enterFeed() {
  syncSettingsFromInputs();
  if (!state.settings.userId) {
    showToast("Please enter a user ID.");
    return;
  }

  persistSettings();
  updateFeedHeader();
  showScreen("feed");
  clearFeed();

  try {
    await loadExistingPosts();
    while (state.loadedPostIds.size < 3) {
      await generateNextPost("initial");
      if (state.loadedPostIds.size >= 3) {
        break;
      }
    }
    startFeedObserver();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not load feed.");
  }
}

function createPostCard(post) {
  const card = document.createElement("article");
  card.className = "post-card";
  card.dataset.postId = post.id;

  const tags = Array.isArray(post.tags) ? post.tags : [];
  const tagsHtml = tags.map((tag) => `<span class="chip">${escapeHtml(String(tag))}</span>`).join("");
  const note = post.uncertainty_note
    ? `<div class="subtle">Note: ${escapeHtml(String(post.uncertainty_note))}</div>`
    : "";

  card.innerHTML = `
    <h3>${escapeHtml(String(post.title || "Untitled"))}</h3>
    <p class="body">${escapeHtml(String(post.body || ""))}</p>
    <div class="meta">${tagsHtml}</div>
    <div class="meta-row">
      <span class="subtle">${escapeHtml(String(post.post_type || "story"))} • ${escapeHtml(String(post.confidence || "medium"))}</span>
      <div class="feedback">
        <button data-feedback="upvote">Upvote</button>
        <button data-feedback="downvote">Downvote</button>
        <button data-feedback="skip">Skip</button>
      </div>
    </div>
    ${note}
  `;

  const buttons = Array.from(card.querySelectorAll("button[data-feedback]"));
  for (const button of buttons) {
    button.addEventListener("click", async () => {
      const type = button.dataset.feedback;
      if (!type) {
        return;
      }
      await sendFeedback(post.id, type, buttons);
    });
  }

  return card;
}

function addPosts(posts, append = true) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  let count = 0;
  for (const post of posts) {
    if (!post?.id || state.loadedPostIds.has(post.id)) {
      continue;
    }
    state.loadedPostIds.add(post.id);
    fragment.appendChild(createPostCard(post));
    count += 1;
  }

  if (count === 0) {
    return;
  }

  if (append) {
    view.feedList.appendChild(fragment);
  } else {
    view.feedList.prepend(fragment);
  }
}

async function loadExistingPosts() {
  const data = await apiRequest("/v1/posts/list", "POST", {
    ...postPayload(),
    page_size: 10
  });
  state.nextCursor = data?.data?.nextCursor || null;
  addPosts(data?.data?.items || [], true);
}

async function sendFeedback(postId, type, buttons) {
  try {
    await apiRequest("/v1/posts/feedback", "POST", {
      user_id: state.settings.userId,
      post_id: postId,
      feedback_type: type
    });
    for (const button of buttons) {
      button.classList.toggle("active", button.dataset.feedback === type);
    }
    showToast(`Saved: ${type}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Failed to save feedback.");
  }
}

function setGenerationStatus(message) {
  view.generationStatus.textContent = message;
}

async function generateNextPost(trigger) {
  if (state.isGenerating) {
    return;
  }

  state.isGenerating = true;
  if (trigger === "manual") {
    view.generateNowBtn.disabled = true;
    view.generateNowBtn.textContent = "Generating...";
  }
  setGenerationStatus("Generating next story...");

  try {
    const started = performance.now();
    const data = await apiRequest("/v1/posts/generate", "POST", postPayload());
    const elapsed = Math.round(performance.now() - started);
    addPosts([data.data], true);
    setGenerationStatus(`Latest story generated in ${elapsed}ms.`);
  } catch (error) {
    setGenerationStatus("Generation failed.");
    showToast(error instanceof Error ? error.message : "Failed to generate post.");
  } finally {
    state.isGenerating = false;
    if (trigger === "manual") {
      view.generateNowBtn.disabled = false;
      view.generateNowBtn.textContent = "Generate Now";
    }
  }
}

function startFeedObserver() {
  stopFeedObserver();
  state.hasUserScrolled = false;
  state.lastAutoMs = 0;

  state.observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || state.isGenerating) {
          continue;
        }
        if (!state.hasUserScrolled) {
          continue;
        }
        const now = Date.now();
        if (now - state.lastAutoMs < 1200) {
          continue;
        }
        state.lastAutoMs = now;
        void generateNextPost("auto");
      }
    },
    { threshold: 0.9 }
  );

  state.observer.observe(view.feedSentinel);
}

function stopFeedObserver() {
  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
