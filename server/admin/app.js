const DEFAULT_BASE_URL = "https://8.137.71.118/v1";
const STORAGE_KEY = "aistory_admin_login_v2";
const ALLOW_INSECURE_HTTP = new URLSearchParams(window.location.search).get("allowInsecureHttp") === "1";

const STATUS_LABEL = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  unpublished: "已下架",
};

const state = {
  accessToken: "",
  baseUrl: DEFAULT_BASE_URL,
  busyItemIds: new Set(),
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

function setStatus(text, type = "info") {
  statusEl.textContent = text || "";
  statusEl.className = `status-line ${type}`;
}

function normalizeBaseUrl(url) {
  const normalized = (url || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  return normalized || DEFAULT_BASE_URL;
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function ensureSecureBaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("API Base URL 无效");
  }

  if (!ALLOW_INSECURE_HTTP && parsed.protocol === "http:" && !isLocalHost(parsed.hostname)) {
    throw new Error("非本地地址必须使用 HTTPS");
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

  baseInput.value = saved?.baseUrl ? normalizeBaseUrl(saved.baseUrl) : DEFAULT_BASE_URL;
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
  if (!headers["Content-Type"] && options.body) headers["Content-Type"] = "application/json";

  const response = await fetch(`${state.baseUrl}${path}`, { ...options, headers });
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
    return item.description || "无描述";
  }
  return item.premise || "无概要";
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
  if (!uuid) throw new Error("缺少 uuid");

  let path = "";
  let body;

  if (action === "approve") {
    path = `/admin/review/${type}/${uuid}/approve`;
  } else if (action === "reject") {
    const rejectReason = reason.trim() || "内容不符合平台规范";
    path = `/admin/review/${type}/${uuid}/reject`;
    body = { reason: rejectReason };
  } else if (action === "unpublish") {
    const unpublishReason = reason.trim() || "管理员手动下架";
    path = `/admin/review/${type}/${uuid}/unpublish`;
    body = { reason: unpublishReason };
  } else if (action === "restore") {
    path = `/admin/review/${type}/${uuid}/restore`;
  } else {
    throw new Error("未知操作");
  }

  state.busyItemIds.add(uuid);
  renderActionLoading(uuid);

  try {
    await request(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    setStatus("操作成功", "ok");
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
    block.appendChild(createElement("span", "value", String(typeStats[status] || 0)));
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
  badges.appendChild(createElement("span", statusBadgeClass(status), STATUS_LABEL[status] || status));
  badges.appendChild(createElement("span", "badge badge-meta", toLocalTime(item?.createdAt)));
  head.appendChild(badges);
  card.appendChild(head);

  const authorNickname = item?.author?.nickname || "unknown";
  const authorUsername = item?.author?.username || "-";
  card.appendChild(createElement("p", "meta", `作者: ${authorNickname} (${authorUsername})`));

  const tags = Array.isArray(item?.tags) && item.tags.length ? item.tags.join(", ") : "无标签";
  card.appendChild(createElement("p", "meta", `标签: ${tags}`));

  if (item?.reviewedAt) {
    card.appendChild(createElement("p", "meta", `最近审核时间: ${toLocalTime(item.reviewedAt)}`));
  }
  if (reason) {
    card.appendChild(createElement("p", "meta", `原因: ${reason}`));
  }

  const desc = createElement("p", "desc", summaryText);
  card.appendChild(desc);

  const detail = createElement("details");
  const summary = createElement("summary", "", "查看完整内容");
  const pre = createElement("pre");
  pre.textContent = buildPayloadText(type, item);
  detail.appendChild(summary);
  detail.appendChild(pre);
  card.appendChild(detail);

  const actions = createElement("div", "actions");
  const reasonInput = createElement("input");
  reasonInput.placeholder = "驳回/下架原因（可选）";
  actions.appendChild(reasonInput);

  getActionsByStatus(status).forEach((actionName) => {
    const btn = createElement("button", "btn");
    btn.type = "button";

    if (actionName === "approve") {
      btn.classList.add("btn-primary");
      btn.textContent = "通过";
    } else if (actionName === "reject") {
      btn.classList.add("btn-danger");
      btn.textContent = "驳回";
    } else if (actionName === "unpublish") {
      btn.classList.add("btn-danger");
      btn.textContent = "下架";
    } else if (actionName === "restore") {
      btn.classList.add("btn-secondary");
      btn.textContent = "恢复上架";
    }

    btn.addEventListener("click", async () => {
      try {
        await performAction(type, uuid, actionName, reasonInput.value);
      } catch (error) {
        setStatus(error.message || "操作失败", "error");
      }
    });

    actions.appendChild(btn);
  });

  if (!getActionsByStatus(status).length) {
    reasonInput.disabled = true;
    reasonInput.placeholder = "当前状态暂无可用动作";
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
    listEl.appendChild(createElement("p", "empty", "当前筛选条件下无内容"));
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

async function loadItems(type, status, keyword) {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (keyword) query.set("keyword", keyword);
  const qs = query.toString();
  const path = type === "prompt" ? "/admin/review/prompts" : "/admin/review/stories";
  return request(qs ? `${path}?${qs}` : path);
}

async function loadDashboard() {
  if (!state.accessToken) {
    throw new Error("请先登录");
  }

  const type = typeSel.value;
  const status = statusSel.value;
  const keyword = keywordInput.value.trim();

  setStatus("加载中...", "info");
  const [items] = await Promise.all([loadItems(type, status, keyword), loadStats(type)]);
  renderList(items, type);
  setStatus(`已加载 ${Array.isArray(items) ? items.length : 0} 条内容`, "ok");
}

async function login() {
  try {
    state.baseUrl = resolveBaseUrl(baseInput.value);
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) {
      throw new Error("用户名和密码不能为空");
    }

    const loginData = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    state.accessToken = loginData.accessToken || "";
    if (!state.accessToken) {
      throw new Error("登录失败：缺少 access token");
    }

    saveLoginPreferences();
    setStatus("登录成功", "ok");
    await loadDashboard();
  } catch (error) {
    setStatus(error.message || "登录失败", "error");
  }
}

function logout() {
  state.accessToken = "";
  state.busyItemIds.clear();
  saveLoginPreferences();
  listEl.replaceChildren();
  statsGridEl.replaceChildren();
  setStatus("已退出登录", "info");
}

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("loadBtn").addEventListener("click", async () => {
  try {
    await loadDashboard();
  } catch (error) {
    setStatus(error.message || "加载失败", "error");
  }
});

typeSel.addEventListener("change", () => {
  if (!state.accessToken) return;
  loadDashboard().catch((error) => setStatus(error.message || "加载失败", "error"));
});

statusSel.addEventListener("change", () => {
  if (!state.accessToken) return;
  loadDashboard().catch((error) => setStatus(error.message || "加载失败", "error"));
});

keywordInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (!state.accessToken) return;
  loadDashboard().catch((error) => setStatus(error.message || "加载失败", "error"));
});

loadSavedLogin();
setStatus("请先登录后加载审核数据", "info");
