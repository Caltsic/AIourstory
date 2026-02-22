# AI Story Game 后端分离与社区功能实施计划

## 1. 项目目标

在现有 React Native + Expo 客户端基础上，新增可部署到阿里云 ECS（2C2G）的后端服务，支持：

1. 账号系统（匿名自动登录 + 可绑定用户名密码）。
2. 提示词广场（投稿、审核、浏览、点赞、下载计数）。
3. 故事广场（投稿、审核、浏览、点赞、下载计数）。
4. 独立 Web 管理后台（审核流程）。

## 2. 约束与原则

1. 服务器配置：Ubuntu 22.04，2C2G，40GB，按流量计费。
2. 成本优先：不上传图片，只传文本和结构化配置。
3. 现有游戏离线能力不能被破坏。
4. 后端要轻量、可维护、可逐步演进。

## 3. 账号方案选择

### 方案对比

1. 用户名+密码：实现简单，成本低，但注册摩擦较高。
2. 短信/邮箱验证码：体验好，但接入和运营成本持续增加。
3. OAuth（微信/GitHub）：接入复杂，受备案与平台资质影响。
4. 设备匿名账号 + 绑定账号：首次零摩擦，上传时再绑定，最适合游戏场景。

### 最终选择

采用 `设备匿名自动登录 + 用户名密码绑定（上传前必绑定）`。

### 行为规则

1. 首次进入应用：`device-login` 自动创建匿名账号。
2. 匿名用户可浏览/下载广场内容。
3. 匿名用户不可投稿、不可管理。
4. 投稿前必须绑定用户名密码（升级为 bound 账号）。

## 4. 后端技术栈

1. 运行时：Node.js 20 LTS。
2. 框架：Fastify。
3. 数据库：SQLite（libsql 驱动）+ WAL。
4. ORM：Drizzle ORM。
5. 认证：JWT（jose）+ refresh token 轮换。
6. 密码哈希：bcryptjs。
7. 反向代理：Caddy 或 Nginx（二选一，生产建议 Caddy 自动 HTTPS）。
8. 进程守护：PM2 + systemd。

## 5. 当前代码落地状态（已完成）

已在仓库新增 `server/` 子项目并通过 TypeScript 编译。

### 已落地模块

1. 基础服务入口与中间件。
2. 数据库 schema 与迁移生成能力。
3. 认证接口：设备登录、绑定注册、密码登录、刷新、登出、me。
4. 提示词广场接口：列表、详情、投稿、编辑、删除、点赞、下载、我的投稿。
5. 故事广场接口：列表、详情、投稿、编辑、删除、点赞、下载、我的投稿。
6. 管理审核接口：提示词/故事待审列表、通过、驳回。

### 已创建的关键文件

1. `server/src/index.ts`
2. `server/src/config.ts`
3. `server/src/db/schema.ts`
4. `server/src/db/index.ts`
5. `server/src/services/auth.service.ts`
6. `server/src/services/prompt.service.ts`
7. `server/src/services/story.service.ts`
8. `server/src/routes/auth.ts`
9. `server/src/routes/prompts.ts`
10. `server/src/routes/stories.ts`
11. `server/src/routes/admin.ts`
12. `server/src/db/migrations/0000_public_legion.sql`

## 6. 数据库模型设计

### users

1. 匿名与绑定统一在一张表。
2. 关键字段：`uuid/device_id/username/password_hash/is_bound/role`。

### prompt_presets

1. 保存广场提示词投稿。
2. `prompts_json` 保存 7 段提示词内容。
3. `status` 流程：`pending/approved/rejected`。

### story_settings

1. 保存故事设置投稿（不是完整游玩过程）。
2. 包含主角信息、难度、节奏、额外描述。
3. 同样使用审核状态流。

### likes / downloads / refresh_tokens

1. `likes`：点赞去重。
2. `downloads`：下载计数去重。
3. `refresh_tokens`：刷新令牌持久化与轮换。

## 7. API 结构

统一前缀：`/v1`

### auth

1. `POST /auth/device-login`
2. `POST /auth/register`
3. `POST /auth/login`
4. `POST /auth/refresh`
5. `POST /auth/logout`
6. `GET /auth/me`
7. `PUT /users/me`

### prompts

1. `GET /prompts`
2. `GET /prompts/:uuid`
3. `GET /prompts/mine`
4. `POST /prompts`
5. `PUT /prompts/:uuid`
6. `DELETE /prompts/:uuid`
7. `POST /prompts/:uuid/like`
8. `POST /prompts/:uuid/download`

### stories

1. `GET /stories`
2. `GET /stories/:uuid`
3. `GET /stories/mine`
4. `POST /stories`
5. `PUT /stories/:uuid`
6. `DELETE /stories/:uuid`
7. `POST /stories/:uuid/like`
8. `POST /stories/:uuid/download`

### admin

1. `GET /admin/review/prompts`
2. `GET /admin/review/stories`
3. `POST /admin/review/:type/:uuid/approve`
4. `POST /admin/review/:type/:uuid/reject`

## 8. 提示词广场设计

### 上传字段

1. `name`
2. `description`
3. `promptsJson`
4. `tags`

### 不上传字段

1. 本地图片 URI。
2. 客户端本地 ID。

### 审核流程

1. 用户提交 -> `pending`。
2. 管理员通过 -> `approved`。
3. 管理员驳回 -> `rejected + rejectReason`。

### UI 排布建议

1. 顶部：搜索 + 排序（最新/热门/下载）。
2. 中部：标签筛选。
3. 主体：卡片列表（名称、描述、作者、统计）。
4. 详情：展示 7 个提示词分段预览与一键使用。

## 9. 故事广场设计

### 上传字段

1. `title`
2. `premise`
3. `genre`
4. `protagonistName`
5. `protagonistDescription`
6. `protagonistAppearance`
7. `difficulty`
8. `initialPacing`
9. `extraDescription`
10. `tags`

### extraDescription 用途

1. 作者对玩法意图和推荐搭配的补充说明。
2. 用户在详情页快速判断是否适合自己。

### UI 排布建议

1. 顶部：搜索 + 排序 + 类型筛选。
2. 主体：故事卡片（标题、题材、前提摘要、作者、统计）。
3. 详情：完整故事设置 + 额外描述折叠区。
4. 行为：一键带入 create-story 表单。

## 10. 前端改造计划

### 导航与页面

1. 新增 `广场` Tab。
2. 广场内使用 segmented control 切换 `提示词广场`/`故事广场`。
3. 新增页面：详情页、投稿页、我的投稿、登录/绑定页。

### 状态管理

1. 新增 `auth-store` 或 `auth-provider`。
2. 安全存储 access token + refresh token。
3. API 客户端支持自动刷新 token。

### 离线策略

1. 游戏本体继续纯离线可用。
2. 广场页离线时提示网络不可用。
3. 已下载配置本地缓存可继续使用。

## 11. 管理后台方案

1. 独立轻量 Web 页面（可用原生 HTML + Alpine.js）。
2. 与 API 同机部署。
3. 只做审核工作流，不做复杂运营系统。
4. 页面功能：登录、待审列表、通过、驳回、搜索。

## 12. 部署架构

### 服务器进程

1. `Caddy/Nginx`：TLS 与反代。
2. `Node Fastify`：API 服务。
3. `SQLite`：本地文件库。
4. `PM2`：进程守护。

### 目录建议

1. `/opt/aistory/server`
2. `/opt/aistory/server/data`
3. `/opt/aistory/backups`
4. `/opt/aistory/logs`

### 部署顺序

1. 上传代码并安装依赖。
2. 配置 `.env`。
3. 运行 `pnpm run db:migrate`。
4. `pnpm run build`。
5. PM2 启动并设置开机自启。
6. 配置 Caddy 反向代理。

## 13. 备份与监控

1. SQLite 每日定时备份到本机 `backups`。
2. 可选同步 OSS（异地容灾）。
3. PM2 logrotate 控制日志体积。
4. 使用 `/health` 做存活检测。

## 14. ICP 与域名策略

1. 域名未备案期间：先用公网 IP + 端口联调。
2. 备案完成后：切域名 + HTTPS。
3. 建议上线前统一切到 `https://api.xxx.com/v1`。

## 15. 接下来执行清单

1. 前端接入认证与 API client。
2. 新建广场相关页面与交互。
3. 新建管理后台页面。
4. 编写基础联调脚本（注册、投稿、审核、下载链路）。
5. 完成 ECS 部署脚本与上线文档。

## 16. 设置页日志功能（本轮新增）

### 16.1 目标

1. 提供可视化日志查看能力，便于排查线上/真机问题。
2. 在不引入重依赖的前提下，完成本地日志采集、展示、清空与导出。

### 16.2 方案

1. 新增 `lib/app-logger.ts` 作为统一日志层：
   1. 支持 `info/warn/error` 分级。
   2. 自动持久化到 `AsyncStorage`（滚动保留最近 N 条）。
   3. 提供读取、清空、格式化导出能力。
2. 应用启动时在 `app/_layout.tsx` 初始化日志系统，接管 `console.log/warn/error`。
3. 在 `app/(tabs)/settings.tsx` 新增“日志”区域：
   1. 查看日志（Modal）。
   2. 清空日志（带确认）。
   3. 导出日志（系统分享面板）。

### 16.3 验收标准

1. 设置页可打开日志面板并看到最近日志。
2. 触发报错后能在日志中看到错误内容与时间戳。
3. 日志可一键清空并立即生效。
4. `pnpm run check` 通过。

## 17. BUG.md 问题修复（本轮新增）

### 17.1 目标

1. 修复“退出后仍然保持登录状态”问题。
2. 修复“故事广场投稿页进入后频闪卡死”问题。
3. 修复“APK 中调试仪表盘消失”问题（与 Expo Go 行为对齐）。

### 17.2 修复方案

1. 账号退出问题：
   1. 后端 `device-login` 若命中已绑定账号，不再直接返回该账号。
   2. 自动为该设备创建/切换到匿名账号，确保登出后一定回到匿名会话。
2. 投稿页频闪问题：
   1. `submit-story` 页面 `useEffect` 不再依赖 `params` 对象本身。
   2. 改为依赖稳定的具体参数字段，避免每次渲染重复触发初始化。
3. 仪表盘显示问题：
   1. `game` 页移除仅 `__DEV__` 显示限制，保持 APK 与 Expo Go 一致可见。

### 17.3 验收标准

1. 绑定账号点击退出后，立即变为匿名账号并且重启 App 仍保持匿名。
2. 进入“故事广场 -> 投稿”页面时不再出现闪烁/卡死。
3. APK 中可看到调试仪表盘（绿色点）。
4. `pnpm run check` 通过。

## 18. 安全防护升级（本轮新增）

### 18.1 目标

1. 降低开源项目被扫描后被直接打穿的风险。
2. 在不增加太多资源开销的前提下完成基础加固。
3. 明确一套可执行的服务器安全基线清单。

### 18.2 实施范围

1. 后端应用层：
   1. 启用安全响应头（Helmet）。
   2. 细化全局与敏感路由限流策略（登录/刷新/管理员审核）。
   3. 增加生产配置安全校验（JWT secret 最小长度等）。
2. 部署层文档：
   1. 新增 `SECURITY.md`，提供从“必须做”到“建议做”的分级清单。
   2. 给出 Nginx `/admin` 基础认证与速率限制模板。
3. 运维执行层：
   1. 密钥轮换。
   2. 防火墙与登录防护（UFW/Fail2ban）。
   3. 日志与备份检查清单。

### 18.3 验收标准

1. 后端编译通过，核心接口可正常访问。
2. 登录/管理员接口触发限流时返回 429。
3. 安全基线文档可直接按步骤执行。

## 19. 交互与生图链路修复（本轮新增）

### 19.1 目标

1. 修复“自定义行动缺失判定值”导致掷骰逻辑失真的问题。
2. 修复“随机主角外貌与题材错位”问题（如仙侠题材出现现代皮夹克）。
3. 修复“创建故事后未按开场自动触发背景生图，且角色图未进入队列”的链路问题。

### 19.2 实施方案

1. 自定义行动判定：
   1. `evaluateCustomAction` 改为始终返回 `1-8` 判定值，不再返回 `null`。
   2. 增加按难度的本地兜底判定值，避免模型异常时中断掷骰。
2. 主角外貌生成：
   1. 重构随机外貌兜底逻辑，按 `genre + personality + premise` 生成。
   2. 为不同题材建立服饰语义映射，避免题材错配。
3. 创建后生图链路：
   1. `create-story` 改为仅创建存档并进入 `game`，由 `game` 的初始化流程统一生成剧情与入队。
   2. 在初始生成后新增“开场上下文”背景生图入队（`initial-opening`），并保留角色立绘自动队列。

### 19.3 验收标准

1. 自定义行动（非“无随机”）必触发判定并出现掷骰流程。
2. 随机主角外貌与题材一致性明显提升（仙侠不再出现现代皮夹克等违和搭配）。
3. 创建故事后可看到背景图任务自动入队，新增角色立绘任务也会自动入队。

## 20. 续写链路并行化与长历史压缩（本轮新增）

### 20.1 目标

1. 降低“继续剧情”单次串行请求数量，缩短用户等待时长。
2. 续写请求优先直发上下文，不再被摘要刷新阻塞。
3. 当剧情总长超过 8000 字时，自动并行执行摘要压缩并回写历史。
4. 生成新摘要后，自动调用 LLM 生成简短标题，保持角色事件标签可读。
5. 调整节奏字符目标：慵懒1600、轻松1200、紧张900、紧迫600。

### 20.2 实施方案

1. `continue` 主链路：
   1. 用户选择后立即调用 `continueStory`，上文使用当前完整历史文本。
   2. 将摘要刷新从前置串行改为后台并行任务，不阻塞续写返回。
2. 长历史压缩：
   1. 设定压缩阈值为 8000 字。
   2. 摘要完成后将“已覆盖历史段”折叠为单条摘要叙述段，保留之后新增段落。
   3. 维持 `summaryHistory` 记录，避免角色“已参与事件”能力退化。
3. 摘要标题：
   1. 检测到新摘要时调用单独标题生成接口（短标题，去重）。
   2. 标题失败时使用摘要文本兜底截断。
4. 节奏目标：
   1. 下调 `PACE_MIN_CHARS` 映射以提升响应速度并降低超时概率。

### 20.3 验收标准

1. 选择后“继续剧情”只阻塞续写请求本身，不再等待摘要调用。
2. 历史超过 8000 字后，后台可完成摘要压缩并自动更新上下文。
3. 新摘要记录包含可读短标题，角色事件列表继续可用。
4. `pnpm run check` 与 `pnpm test` 通过。

## 21. 角色好感度可感知与结算增强（本轮新增）

### 21.1 目标

1. 解决“好感度几乎看不到变化”的体感问题。
2. 支持负向选择降低好感度，并与掷骰结果联动。
3. 保持现有角色事件链与存档结构不破坏。

### 21.2 实施方案

1. 结算逻辑升级：
   1. 重构 `applyAffinityFromChoice`，返回结构化变化结果（角色、前后值、增减值、来源）。
   2. 正负关键词双向识别，允许负向降好感。
2. 关联策略增强：
   1. 优先匹配选项文本显式提及角色。
   2. 其次匹配最近对话角色。
   3. 再次匹配最近摘要涉及角色（弱关联）。
3. 掷骰联动：
   1. `better/exact/worse` 对变化幅度做加权。
   2. 单角色单回合变化限制在 `[-3, +3]`。
4. 可见反馈与调试：
   1. 选择后展示短时“好感变化”提示条。
   2. Debug Context 增加最近一次好感结算摘要。

### 21.3 验收标准

1. 正向选择可触发相关角色好感上升。
2. 负向选择可触发相关角色好感下降。
3. 掷骰结果会影响单次好感变化幅度。
4. 角色“已参与事件”与现有功能不受影响。
