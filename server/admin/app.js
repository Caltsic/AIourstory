const DEFAULT_BASE_URL = (() => {
  const host = window.location.hostname || "8.137.71.118";
  if (host === "8.137.71.118") return "http://8.137.71.118:3000/v1";
  const port = window.location.port ? `:${window.location.port}` : "";
  return `${window.location.protocol}//${host}${port}/v1`;
})();
const STORAGE_KEY = "aistory_admin_login_v2";
const ALLOW_INSECURE_HTTP =
  new URLSearchParams(window.location.search).get("allowInsecureHttp") === "1";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  unpublished: "Unpublished",
};

const state = {
  accessToken: "",
  baseUrl: DEFAULT_BASE_URL,
  busyItemIds: new Set(),
  page: DEFAULT_PAGE,
  limit: DEFAULT_LIMIT,
  total: 0,
};

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const statsGridEl = document.getElementById("statsGrid");
const baseInput = document.getElementById("baseUrl");
const userInput = document.getElementById("username");
const passInput = document.getElementById("password");
const typeSel = document.getElementById("typeSel");
const statusSel = document.getElementById("statusSel");
const keywordInput = document.getElementById("keywordInput");
const rememberPwdInput = document.getElementById("rememberPwd");
const pageInput = document.getElementById("pageInput");
const limitInput = document.getElementById("limitInput");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageInfoEl = document.getElementById("pageInfo");

function toErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function setStatus(text, type = "info") {
  statusEl.textContent = text || "";
  statusEl.className = `status-line ${type}`;
}

function normalizeBaseUrl(url) {
  const normalized = (url || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  return normalized || DEFAULT_BASE_URL;
}

function migrateLegacyBaseUrl(url) {
  const normalized = normalizeBaseUrl(url);
  try {
    const parsed = new URL(normalized);
    if (
      parsed.hostname === "8.137.71.118" &&
      parsed.protocol === "https:" &&
      parsed.port === "3000"
    ) {
      parsed.protocol = "http:";
      return parsed.toString().replace(/\/+$/, "");
    }
  } catch {
    return normalized;
  }
  return normalized;
}

function isLocalHost(hostname) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function ensureSecureBaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("API Base URL is invalid");
  }

  if (
    !ALLOW_INSECURE_HTTP &&
    parsed.protocol === "http:" &&
    !isLocalHost(parsed.hostname)
  ) {
    throw new Error("HTTPS is required for non-localhost API hosts");
  }
}

function resolveBaseUrl(url) {
  const normalized = normalizeBaseUrl(url);
  ensureSecureBaseUrl(normalized);
  return normalized;
}

function loadSavedLogin() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    saved = null;
  }

  baseInput.value = saved?.baseUrl
    ? migrateLegacyBaseUrl(saved.baseUrl)
    : DEFAULT_BASE_URL;
  userInput.value = saved?.username || "";
  rememberPwdInput.checked = Boolean(saved?.rememberPassword);
  passInput.value = saved?.rememberPassword ? saved?.password || "" : "";
}

function saveLoginPreferences() {
  const rememberPassword = Boolean(rememberPwdInput.checked);
  const payload = {
    baseUrl: normalizeBaseUrl(baseInput.value),
    username: userInput.value.trim(),
    rememberPassword,
    password: rememberPassword ? passInput.value : "",
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  if (!headers["Content-Type"] && options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${state.baseUrl}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPaginationParams() {
  const page = parsePositiveInt(pageInput?.value, state.page || DEFAULT_PAGE);
  const limit = Math.min(
    parsePositiveInt(limitInput?.value, state.limit || DEFAULT_LIMIT),
    100,
  );
  return { page, limit };
}

function renderPagination() {
  const total = Number(state.total || 0);
  const limit = Number(state.limit || DEFAULT_LIMIT);
  const page = Number(state.page || DEFAULT_PAGE);
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));

  if (pageInput) pageInput.value = String(page);
  if (limitInput) limitInput.value = String(limit);

  if (pageInfoEl) {
    pageInfoEl.textContent = `Page ${page}/${totalPages} | Total ${total}`;
  }
  if (prevPageBtn) prevPageBtn.disabled = page <= 1;
  if (nextPageBtn) nextPageBtn.disabled = page >= totalPages;
}

function statusBadgeClass(status) {
  return `badge badge-status-${status || "pending"}`;
}

function toLocalTime(isoText) {
  if (!isoText) return "-";
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return String(isoText);
  return date.toLocaleString();
}

function buildSummary(type, item) {
  if (type === "prompt") {
    return item.description || "No description";
  }
  return item.premise || "No premise";
}

function buildPayloadText(type, item) {
  if (type === "prompt") {
    return typeof item.promptsJson === "string"
      ? item.promptsJson
      : JSON.stringify(item.promptsJson ?? {}, null, 2);
  }
  return JSON.stringify(item, null, 2);
}

function getActionsByStatus(status) {
  if (status === "pending") return ["approve", "reject"];
  if (status === "approved") return ["unpublish"];
  if (status === "rejected" || status === "unpublished") return ["restore"];
  return [];
}

async function performAction(type, uuid, action, reason = "") {
  if (!uuid) throw new Error("Missing uuid");

  let path = "";
  let body;

  if (action === "approve") {
    path = `/admin/review/${type}/${uuid}/approve`;
  } else if (action === "reject") {
    const rejectReason =
      reason.trim() || "Content does not meet moderation rules";
    path = `/admin/review/${type}/${uuid}/reject`;
    body = { reason: rejectReason };
  } else if (action === "unpublish") {
    const unpublishReason = reason.trim() || "Manually unpublished by admin";
    path = `/admin/review/${type}/${uuid}/unpublish`;
    body = { reason: unpublishReason };
  } else if (action === "restore") {
    path = `/admin/review/${type}/${uuid}/restore`;
  } else {
    throw new Error("Unknown action");
  }

  state.busyItemIds.add(uuid);
  renderActionLoading(uuid);

  try {
    await request(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    setStatus("Action completed", "ok");
    await loadDashboard();
  } finally {
    state.busyItemIds.delete(uuid);
  }
}

function renderActionLoading(uuid) {
  const card = listEl.querySelector(`.item[data-uuid="${uuid}"]`);
  if (!card) return;
  const controls = card.querySelectorAll("button, input");
  controls.forEach((control) => {
    control.disabled = true;
  });
}

function renderStats(stats, type) {
  const typeStats = stats?.[type] || {};
  const statuses = ["pending", "approved", "rejected", "unpublished"];

  statsGridEl.replaceChildren();
  statuses.forEach((status) => {
    const block = createElement("div", "stat");
    block.appendChild(createElement("span", "label", STATUS_LABEL[status]));
    block.appendChild(
      createElement("span", "value", String(typeStats[status] || 0)),
    );
    statsGridEl.appendChild(block);
  });
}

function renderItem(type, item) {
  const uuid = String(item?.uuid || "");
  const titleText = type === "prompt" ? item?.name : item?.title;
  const status = String(item?.status || "pending");
  const reason = item?.rejectReason || "";
  const summaryText = buildSummary(type, item);

  const card = createElement("article", "item");
  card.dataset.uuid = uuid;

  const head = createElement("div", "item-head");
  const title = createElement("h3", "item-title", titleText || "(untitled)");
  head.appendChild(title);

  const badges = createElement("div", "badges");
  badges.appendChild(
    createElement(
      "span",
      statusBadgeClass(status),
      STATUS_LABEL[status] || status,
    ),
  );
  badges.appendChild(
    createElement("span", "badge badge-meta", toLocalTime(item?.createdAt)),
  );
  head.appendChild(badges);
  card.appendChild(head);

  const authorNickname = item?.author?.nickname || "unknown";
  const authorUsername = item?.author?.username || "-";
  card.appendChild(
    createElement("p", "meta", `Author: ${authorNickname} (${authorUsername})`),
  );

  const tags =
    Array.isArray(item?.tags) && item.tags.length
      ? item.tags.join(", ")
      : "No tags";
  card.appendChild(createElement("p", "meta", `Tags: ${tags}`));

  if (item?.reviewedAt) {
    card.appendChild(
      createElement(
        "p",
        "meta",
        `Reviewed at: ${toLocalTime(item.reviewedAt)}`,
      ),
    );
  }
  if (reason) {
    card.appendChild(createElement("p", "meta", `Reason: ${reason}`));
  }

  const desc = createElement("p", "desc", summaryText);
  card.appendChild(desc);

  const detail = createElement("details");
  const summary = createElement("summary", "", "View full payload");
  const pre = createElement("pre");
  pre.textContent = buildPayloadText(type, item);
  detail.appendChild(summary);
  detail.appendChild(pre);
  card.appendChild(detail);

  const actions = createElement("div", "actions");
  const reasonInput = createElement("input");
  reasonInput.placeholder = "Reason for reject/unpublish (optional)";
  actions.appendChild(reasonInput);

  getActionsByStatus(status).forEach((actionName) => {
    const btn = createElement("button", "btn");
    btn.type = "button";

    if (actionName === "approve") {
      btn.classList.add("btn-primary");
      btn.textContent = "Approve";
    } else if (actionName === "reject") {
      btn.classList.add("btn-danger");
      btn.textContent = "Reject";
    } else if (actionName === "unpublish") {
      btn.classList.add("btn-danger");
      btn.textContent = "Unpublish";
    } else if (actionName === "restore") {
      btn.classList.add("btn-secondary");
      btn.textContent = "Restore";
    }

    btn.addEventListener("click", async () => {
      try {
        await performAction(type, uuid, actionName, reasonInput.value);
      } catch (error) {
        setStatus(toErrorMessage(error, "Action failed"), "error");
      }
    });

    actions.appendChild(btn);
  });

  if (!getActionsByStatus(status).length) {
    reasonInput.disabled = true;
    reasonInput.placeholder = "No available actions for current status";
  }

  if (state.busyItemIds.has(uuid)) {
    const controls = actions.querySelectorAll("button, input");
    controls.forEach((control) => {
      control.disabled = true;
    });
  }

  card.appendChild(actions);
  return card;
}

function renderList(items, type) {
  listEl.replaceChildren();

  if (!Array.isArray(items) || !items.length) {
    listEl.appendChild(
      createElement("p", "empty", "No items under current filter"),
    );
    return;
  }

  items.forEach((item) => {
    listEl.appendChild(renderItem(type, item));
  });
}

async function loadStats(type) {
  const stats = await request("/admin/review/stats");
  renderStats(stats, type);
}

async function loadItems(type, status, keyword, page, limit) {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (keyword) query.set("keyword", keyword);
  query.set("page", String(page));
  query.set("limit", String(limit));
  const qs = query.toString();
  const path =
    type === "prompt" ? "/admin/review/prompts" : "/admin/review/stories";
  return request(qs ? `${path}?${qs}` : path);
}

async function loadDashboard() {
  if (!state.accessToken) {
    throw new Error("Please login first");
  }

  const type = typeSel.value;
  const status = statusSel.value;
  const keyword = keywordInput.value.trim();
  const { page, limit } = getPaginationParams();

  setStatus("Loading...", "info");
  const [payload] = await Promise.all([
    loadItems(type, status, keyword, page, limit),
    loadStats(type),
  ]);

  const items = Array.isArray(payload) ? payload : (payload?.items ?? []);
  state.page = Array.isArray(payload)
    ? page
    : parsePositiveInt(payload?.page, page);
  state.limit = Array.isArray(payload)
    ? limit
    : parsePositiveInt(payload?.limit, limit);
  state.total = Array.isArray(payload)
    ? items.length
    : Number(payload?.total ?? items.length);

  renderList(items, type);
  renderPagination();
  setStatus(`Loaded ${items.length} item(s), total ${state.total}`, "ok");
}

async function login() {
  try {
    state.baseUrl = resolveBaseUrl(baseInput.value);
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) {
      throw new Error("Username and password are required");
    }

    const loginData = await request("/auth/password-login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    state.accessToken = loginData.accessToken || "";
    if (!state.accessToken) {
      throw new Error("Login failed: missing access token");
    }

    saveLoginPreferences();
    setStatus("Login successful", "ok");
    await loadDashboard();
  } catch (error) {
    setStatus(toErrorMessage(error, "Login failed"), "error");
  }
}

function resetToFirstPage() {
  state.page = DEFAULT_PAGE;
  if (pageInput) pageInput.value = String(DEFAULT_PAGE);
}

function logout() {
  state.accessToken = "";
  state.busyItemIds.clear();
  state.total = 0;
  saveLoginPreferences();
  listEl.replaceChildren();
  statsGridEl.replaceChildren();
  renderPagination();
  setStatus("Logged out", "info");
}

const onLoadError = (error) => {
  setStatus(toErrorMessage(error, "Failed to load dashboard"), "error");
};

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("loadBtn").addEventListener("click", async () => {
  try {
    await loadDashboard();
  } catch (error) {
    onLoadError(error);
  }
});

typeSel.addEventListener("change", () => {
  if (!state.accessToken) return;
  resetToFirstPage();
  loadDashboard().catch(onLoadError);
});

statusSel.addEventListener("change", () => {
  if (!state.accessToken) return;
  resetToFirstPage();
  loadDashboard().catch(onLoadError);
});

keywordInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (!state.accessToken) return;
  resetToFirstPage();
  loadDashboard().catch(onLoadError);
});

if (pageInput) {
  pageInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (!state.accessToken) return;
    loadDashboard().catch(onLoadError);
  });
}

if (limitInput) {
  limitInput.addEventListener("change", () => {
    if (!state.accessToken) return;
    resetToFirstPage();
    loadDashboard().catch(onLoadError);
  });
}

if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    if (!state.accessToken) return;
    const current = parsePositiveInt(
      pageInput?.value,
      state.page || DEFAULT_PAGE,
    );
    const next = Math.max(1, current - 1);
    if (pageInput) pageInput.value = String(next);
    loadDashboard().catch(onLoadError);
  });
}

if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    if (!state.accessToken) return;
    const current = parsePositiveInt(
      pageInput?.value,
      state.page || DEFAULT_PAGE,
    );
    const totalPages = Math.max(
      1,
      Math.ceil((state.total || 0) / Math.max(1, state.limit || DEFAULT_LIMIT)),
    );
    const next = Math.min(totalPages, current + 1);
    if (pageInput) pageInput.value = String(next);
    loadDashboard().catch(onLoadError);
  });
}

loadSavedLogin();
renderPagination();
setStatus("Login to load review data", "info");
