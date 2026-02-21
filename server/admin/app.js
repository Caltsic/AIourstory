const DEFAULT_BASE_URL = "https://8.137.71.118/v1";
const STORAGE_KEY = "aistory_admin_login_v1";
const ALLOW_INSECURE_HTTP = new URLSearchParams(window.location.search).get("allowInsecureHttp") === "1";

let accessToken = "";
let baseUrl = DEFAULT_BASE_URL;

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const baseInput = document.getElementById("baseUrl");
const userInput = document.getElementById("username");
const passInput = document.getElementById("password");
const typeSel = document.getElementById("typeSel");
const rememberPwdInput = document.getElementById("rememberPwd");

function setStatus(text, ok = false) {
  statusEl.textContent = text;
  statusEl.className = ok ? "status ok" : "status";
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
    throw new Error("API Base URL invalid");
  }

  if (!ALLOW_INSECURE_HTTP && parsed.protocol === "http:" && !isLocalHost(parsed.hostname)) {
    throw new Error("HTTPS is required for non-local API endpoints");
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
  const headers = options.headers || {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (!headers["Content-Type"] && options.body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function login() {
  try {
    baseUrl = resolveBaseUrl(baseInput.value);
    const user = userInput.value.trim();
    const pass = passInput.value;

    if (!user || !pass) throw new Error("Username and password are required");

    const loginData = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: user, password: pass }),
    });

    accessToken = loginData.accessToken;
    saveLoginPreferences();
    setStatus("Login success", true);
    await loadPending();
  } catch (err) {
    setStatus(err.message || "Login failed");
  }
}

function createMeta(text) {
  const p = document.createElement("p");
  p.className = "meta";
  p.textContent = text;
  return p;
}

function renderPendingItem(type, item) {
  const uuid = typeof item?.uuid === "string" ? item.uuid : "";
  const title = type === "prompt" ? item?.name : item?.title;
  const description = type === "prompt" ? item?.description : item?.premise;
  const payloadText =
    type === "prompt" ? item?.promptsJson : JSON.stringify(item ?? {}, null, 2);

  const card = document.createElement("div");
  card.className = "item";
  if (uuid) card.dataset.uuid = uuid;

  const h3 = document.createElement("h3");
  h3.textContent = String(title || "(untitled)");
  card.appendChild(h3);

  const nickname = item?.author?.nickname || "unknown";
  const username = item?.author?.username || "-";
  card.appendChild(createMeta(`Author: ${nickname} (${username})`));
  card.appendChild(createMeta(String(description || "No description")));

  const pre = document.createElement("pre");
  pre.textContent = typeof payloadText === "string" ? payloadText : String(payloadText || "");
  card.appendChild(pre);

  const row = document.createElement("div");
  row.className = "row";

  const approveBtn = document.createElement("button");
  approveBtn.className = "btn btn-primary";
  approveBtn.type = "button";
  approveBtn.textContent = "Approve";
  approveBtn.addEventListener("click", () => approve(type, uuid));

  const reasonInput = document.createElement("input");
  reasonInput.placeholder = "Reject reason (optional)";
  reasonInput.style.minWidth = "220px";

  const rejectBtn = document.createElement("button");
  rejectBtn.className = "btn btn-danger";
  rejectBtn.type = "button";
  rejectBtn.textContent = "Reject";
  rejectBtn.addEventListener("click", () => reject(type, uuid, reasonInput.value));

  if (!uuid) {
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
    reasonInput.disabled = true;
  }

  row.appendChild(approveBtn);
  row.appendChild(reasonInput);
  row.appendChild(rejectBtn);
  card.appendChild(row);

  return card;
}

async function loadPending() {
  try {
    if (!accessToken) throw new Error("Please login first");

    const type = typeSel.value;
    const path = type === "prompt" ? "/admin/review/prompts" : "/admin/review/stories";
    const items = await request(path);

    listEl.replaceChildren();

    if (!Array.isArray(items) || !items.length) {
      const empty = document.createElement("p");
      empty.style.color = "#6b7280";
      empty.textContent = "No pending items";
      listEl.appendChild(empty);
      return;
    }

    for (const item of items) {
      listEl.appendChild(renderPendingItem(type, item));
    }
  } catch (err) {
    setStatus(err.message || "Load failed");
  }
}

async function approve(type, uuid) {
  try {
    if (!uuid) throw new Error("Item uuid missing");
    await request(`/admin/review/${type}/${uuid}/approve`, { method: "POST" });
    setStatus("Operation success", true);
    await loadPending();
  } catch (err) {
    setStatus(err.message || "Approve failed");
  }
}

async function reject(type, uuid, reasonValue = "") {
  try {
    if (!uuid) throw new Error("Item uuid missing");
    const reason = reasonValue.trim() || "Not compliant with community guidelines";
    await request(`/admin/review/${type}/${uuid}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    setStatus("Operation success", true);
    await loadPending();
  } catch (err) {
    setStatus(err.message || "Reject failed");
  }
}

function logout() {
  accessToken = "";
  listEl.replaceChildren();
  saveLoginPreferences();
  setStatus("Logged out");
}

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("loadBtn").addEventListener("click", loadPending);
document.getElementById("logoutBtn").addEventListener("click", logout);

window.approve = approve;
window.reject = reject;

loadSavedLogin();
