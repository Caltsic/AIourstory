const DEFAULT_BASE_URL = "http://8.137.71.118/v1";
const STORAGE_KEY = "aistory_admin_login_v1";

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
    baseUrl = normalizeBaseUrl(baseInput.value);
    const user = userInput.value.trim();
    const pass = passInput.value;

    if (!user || !pass) throw new Error("请输入用户名和密码");

    const loginData = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: user, password: pass }),
    });

    accessToken = loginData.accessToken;
    saveLoginPreferences();
    setStatus("登录成功", true);
    await loadPending();
  } catch (err) {
    setStatus(err.message || "登录失败");
  }
}

async function loadPending() {
  try {
    if (!accessToken) throw new Error("请先登录");

    const type = typeSel.value;
    const path = type === "prompt" ? "/admin/review/prompts" : "/admin/review/stories";
    const items = await request(path);

    if (!Array.isArray(items) || !items.length) {
      listEl.innerHTML = "<p style='color:#6b7280'>暂无待审核内容</p>";
      return;
    }

    listEl.innerHTML = items
      .map((item) => {
        const title = type === "prompt" ? item.name : item.title;
        const desc = type === "prompt" ? item.description : item.premise;
        const payloadText =
          type === "prompt" ? item.promptsJson : JSON.stringify(item, null, 2);
        return `
          <div class="item" data-uuid="${item.uuid}">
            <h3>${title}</h3>
            <p class="meta">作者：${item.author?.nickname || "未知"}（${item.author?.username || "-"})</p>
            <p class="meta">${desc || "无描述"}</p>
            <pre>${payloadText}</pre>
            <div class="row">
              <button class="btn btn-primary" onclick="approve('${type}','${item.uuid}')">通过</button>
              <input id="reason-${item.uuid}" placeholder="驳回原因（可选）" style="min-width:220px" />
              <button class="btn btn-danger" onclick="reject('${type}','${item.uuid}')">驳回</button>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    setStatus(err.message || "加载失败");
  }
}

async function approve(type, uuid) {
  try {
    await request(`/admin/review/${type}/${uuid}/approve`, { method: "POST" });
    setStatus("操作成功", true);
    await loadPending();
  } catch (err) {
    setStatus(err.message || "审批失败");
  }
}

async function reject(type, uuid) {
  try {
    const reasonInput = document.getElementById(`reason-${uuid}`);
    const reason = reasonInput?.value?.trim() || "不符合社区规范";
    await request(`/admin/review/${type}/${uuid}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    setStatus("操作成功", true);
    await loadPending();
  } catch (err) {
    setStatus(err.message || "驳回失败");
  }
}

function logout() {
  accessToken = "";
  listEl.innerHTML = "";
  saveLoginPreferences();
  setStatus("已退出");
}

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("loadBtn").addEventListener("click", loadPending);
document.getElementById("logoutBtn").addEventListener("click", logout);

window.approve = approve;
window.reject = reject;

loadSavedLogin();
