# AIourStory 项目说明

> 这是一个「AI 互动文字冒险」项目。用户可以创建故事设定，和 AI 进行多轮剧情互动，把满意的设定或作品发布到社区广场，并由后台审核管理。

---

## 项目是什么

AIourStory 由两部分组成：

- **客户端（Expo + React Native）**：面向玩家，负责创建故事、进入游戏、管理提示词、浏览/投稿广场。
- **服务端（Fastify + SQLite）**：负责账号、投稿审核、点赞下载、权限控制、数据持久化。

一句话概括：

> **本地游玩 + 云端社区** 的 AI 剧情应用。

---

## 你能在这个项目里做什么

### 玩家侧

- 创建故事（题材、主角、前提、难度等）
- 进入互动剧情，选择分支继续推进
- 使用自定义提示词预设影响生成风格
- 配置自己的文本模型与图片模型 API
- 浏览提示词广场 / 故事广场，点赞、下载、投稿

### 社区与管理侧

- 投稿进入待审核队列
- 管理员在后台审核（通过 / 拒绝 / 下架 / 恢复）
- 统计待审和不同状态内容数量

### 账号侧

- 设备匿名登录（游客）
- 邮箱绑定（绑定时设置密码）
- 邮箱+密码登录
- 忘记密码（邮箱验证码重置）

---

## 仓库结构（按业务理解）

```text
.
├─ app/                      # 客户端页面（Expo Router）
│  ├─ (tabs)/               # 主导航页：我的故事、提示词、广场、设置
│  └─ plaza/                # 广场详情、投稿、我的投稿
├─ lib/                      # 客户端核心逻辑
│  ├─ llm-client.ts         # 文本模型调用与解析
│  ├─ story-store.ts        # 本地故事存储
│  ├─ auth-store.ts         # 客户端鉴权请求
│  ├─ plaza-api.ts          # 广场 API 封装
│  └─ storage.ts            # API 配置持久化
├─ shared/                   # 前后端共享类型
├─ server/                   # 后端
│  ├─ src/routes/           # 路由层（auth/prompts/stories/admin）
│  ├─ src/services/         # 业务层
│  ├─ src/db/               # Drizzle schema 与 migrations
│  ├─ admin/                # 管理后台静态页面
│  └─ ecosystem.config.cjs  # PM2 进程配置
├─ tests/                    # 前端单元测试（vitest）
└─ scripts/                  # 工具脚本（如二维码生成、版本号）
```

---

## 技术栈

### 客户端

- Expo 54
- React Native 0.81
- Expo Router
- TypeScript
- Vitest

### 服务端

- Fastify 5
- Drizzle ORM
- SQLite / LibSQL
- JWT（`jose`）
- Nodemailer（邮箱验证码）

---

## 本地启动（开发）

## 1) 启动客户端

```bash
pnpm install
pnpm dev
```

默认会跑 web 调试（脚本在 `package.json`）。

## 2) 启动后端

```bash
cd server
pnpm install
pnpm run db:migrate
pnpm run dev
```

默认地址：`http://127.0.0.1:3000`，API 前缀：`/v1`。

---

## 配置项（最常用）

### 客户端环境变量（`app.config.ts`）

- `EXPO_PUBLIC_API_BASE_URL`：后端基地址（生产建议 `https://你的域名/v1`，本地可用 `http://127.0.0.1:3000/v1`）
- `EXPO_PUBLIC_ALLOW_INSECURE_HTTP`：是否允许 HTTP (local development only)
- `ANDROID_VERSION_CODE`：Android 构建版本号（可覆盖自动值）

### 服务端环境变量（`server/src/config.ts`）

- 基础：`PORT`、`HOST`、`DATABASE_URL`、`JWT_SECRET`
- 邮件：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM`
- 验证码：`EMAIL_CODE_TTL_SECONDS`、`EMAIL_CODE_COOLDOWN_SECONDS`、`EMAIL_CODE_DAILY_LIMIT`、`EMAIL_CODE_MAX_ATTEMPTS`
- 跨域与限流：`CORS_ORIGINS`、`RATE_LIMIT_*`

---

## 关键接口（后端）

### 鉴权

- `POST /v1/auth/device-login`
- `POST /v1/auth/send-email-code`
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/reset-password`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`

### 广场

- 提示词：`GET/POST /v1/prompts`，`GET /v1/prompts/:uuid`
- 故事：`GET/POST /v1/stories`，`GET /v1/stories/:uuid`
- 点赞/下载：`POST /v1/prompts/:uuid/like|download`，`POST /v1/stories/:uuid/like|download`

### 管理审核

- `GET /v1/admin/review/stats`
- `GET /v1/admin/review/prompts`
- `GET /v1/admin/review/stories`
- `POST /v1/admin/review/:type/:uuid/approve|reject|unpublish|restore`

---

## 广场分页说明

项目支持两种分页方式：

- 传统：`page + limit`
- 大数据优化：`cursor`（newest 场景）

列表返回结构包含：

- `items`
- `total`
- `page`
- `limit`
- `nextCursor`（有下一页时返回）

---

## 常用命令

### 根目录

```bash
pnpm dev
pnpm check
pnpm lint
pnpm test
pnpm android
pnpm ios
```

### server/

```bash
pnpm run dev
pnpm run build
pnpm run start
pnpm run db:migrate
pnpm run admin:grant -- --username <name>
pnpm run admin:revoke -- --username <name>
```

---

## 线上部署（简版）

每次更新后端，推荐固定步骤：

```bash
cd /opt/aistory/ai-story-game/server
pnpm install --frozen-lockfile
pnpm run db:migrate
pnpm run build
pm2 reload ecosystem.config.cjs --only aistory-api --update-env
```

> 不建议只 `git pull` 后直接重启 PM2；依赖、迁移和编译都可能变化。

---

## 管理后台

- 前端静态文件：`server/admin/`
- 默认通过同域 `/admin` 访问
- 需要配合后端管理员账号与接口权限

---

## 安全与运维文档

- 部署：`server/deploy.md`
- 安全加固：`server/SECURITY.md`

---

## 当前版本重点（近期改动）

- AI 配置页支持 `文本模型 | 评估模型` 切换配置
- 评估模型支持独立温度
- 广场接入 cursor 分页能力
- 账号流程调整为邮箱密码体系（含重置密码）
- 绑定用户昵称去重（含历史数据清理迁移）
