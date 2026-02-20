let accessToken = "";
let baseUrl = "http://127.0.0.1:3000/v1";

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const baseInput = document.getElementById("baseUrl");
const userInput = document.getElementById("username");
const passInput = document.getElementById("password");
const typeSel = document.getElementById("typeSel");

function setStatus(text, ok = false) {
  statusEl.textContent = text;
  statusEl.className = ok ? "ok" : "err";
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
    baseUrl = baseInput.value.trim().replace(/\/$/, "");
    const user = userInput.value.trim();
    const pass = passInput.value;

    if (!user || !pass) throw new Error("请输入用户名和密码");

    const loginData = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: user, password: pass }),
    });

    accessToken = loginData.accessToken;
    setStatus("登录成功", true);
    await loadPending();
  } catch (err) {
    setStatus(err.message || "登录失败");
  }
}

async function loadPending() {
  try {
    const type = typeSel.value;
    const path = type === "prompt" ? "/admin/review/prompts" : "/admin/review/stories";
    const items = await request(path);

    if (!Array.isArray(items) || !items.length) {
      listEl.innerHTML = "<p>暂无待审核内容</p>";
      return;
    }

    listEl.innerHTML = items
      .map((item) => {
        const title = type === "prompt" ? item.name : item.title;
        const desc = type === "prompt" ? item.description : item.premise;
        return `
          <div class="item" data-uuid="${item.uuid}">
            <h3>${title}</h3>
            <p>作者：${item.author?.nickname || "未知"}</p>
            <p>${desc || "无描述"}</p>
            <pre>${type === "prompt" ? item.promptsJson : JSON.stringify(item, null, 2)}</pre>
            <div class="row">
              <button onclick="approve('${type}','${item.uuid}')">通过</button>
              <input id="reason-${item.uuid}" placeholder="驳回原因" style="min-width:220px" />
              <button onclick="reject('${type}','${item.uuid}')">驳回</button>
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
  setStatus("已退出");
}

document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("loadBtn").addEventListener("click", loadPending);
document.getElementById("logoutBtn").addEventListener("click", logout);

window.approve = approve;
window.reject = reject;
