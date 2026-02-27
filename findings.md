# Findings

## 2026-02-23

- Started task: optimize backend admin UI and moderation workflow.
- Confirmed project has dedicated admin frontend at `server/admin/index.html` and `server/admin/app.js`.
- Confirmed backend includes admin routes at `server/src/routes/admin.ts`.
- Confirmed current moderation supports only pending review (`approve/reject`) and lacks explicit `unpublished` state.
- Confirmed plaza list endpoints expose only `approved`, so unpublish must map to a non-approved status.
- Found `ui-ux-pro-max` helper script path is not resolvable in this environment; proceeding with manual application of the skill's UX rules.
- Implemented a dedicated `unpublished` moderation state in backend schema typing and API response typing.
- Admin API now supports:
  - status-based review list filtering (`pending/approved/rejected/unpublished`)
  - moderation stats endpoint
  - unpublish action from approved content
  - restore action from rejected/unpublished content
- Admin UI updated to include:
  - content type + status + keyword filters
  - status statistic cards
  - status-driven action buttons (approve/reject/unpublish/restore)
  - clearer per-item metadata and payload inspection
- Author resubmission flow improved: editing rejected/unpublished content resets review metadata and re-enters pending.

## 2026-02-23 (续写风险修复)

- 对 `app/game.tsx` 续写链路复核后确认：存在“同一 story 在多异步任务中被原地修改 + 全量覆盖写回”的并发风险。
- 续写成功后在 UI 更新前 `await applyAIInitialAffinityForNewCharacters`，属于可延后任务阻塞主路径，影响响应时间。
- `lib/llm-client.ts` 多个 API 调用未使用统一超时封装，存在请求长时间挂起风险。
- `parseLLMResponse` 当前默认吞掉解析异常并返回固定 fallback，导致质量问题可观测性不足。
- 渲染阶段使用 `buildFullHistoryContext(...).trim().length` 会构造完整大字符串，长剧情下存在不必要开销。
- 已将续写成功后的 AI 好感评估改为后台回写，不再阻塞主链路 UI 更新。
- 已删除续写前摘要任务的重复执行路径，避免重复摘要写入与冗余 IO。
- 已统一 `lib/llm-client.ts` 中核心调用为 `fetchWithTimeout`，覆盖随机设定、图片提示词、角色立绘提示词、行动判定与 API Key 测试。
- 解析失败从默认静默 fallback 改为显式抛错（保留可选 fallback 能力），减少“看似成功但内容退化”的隐性故障。
- 新增页面内“生成状态 watchdog”：当页面停留在 generating 超过 180 秒时，自动将状态置为 failed 并提示用户，不再依赖重进页面触发回收。

## 2026-02-23 (角色卡片缺失审查)

- Character cards are created only through `processNewCharacters` in `app/game.tsx`; no fallback extraction from `segments`.
- High-risk merge collision exists for unrevealed characters using generic `hiddenName` values (default `"陌生人"`), which can overwrite an existing card instead of creating a new one.
- `parseLLMResponse` drops `newCharacters` items if any required field is missing (`name/gender/personality/background`), with no warning telemetry.
- Name matching is exact-string based in key paths (`processNewCharacters`, `findCharacterCardBySegmentName`); aliases or minor naming variants are not canonicalized.
- Legacy story migration does not backfill cards from existing dialogue segments, so old stories can keep visible characters with empty card lists.
- User deletion path can permanently remove cards while story segments still contain those characters; no rebuild mechanism exists.

## 2026-02-23 (后端高风险整改计划)

- 用户确认接受推荐方案：`total` 语义修正为“按当前过滤条件后的真实总数”。
- 最高优先级问题聚焦在：分页/total 不一致、并发点赞下载一致性、审核状态流转并发覆盖。
- 性能侧优先级紧随其后：列表与管理端 N+1、统计接口多次 count。
- 本轮将优先在 `server/src/services/*` 与 `server/src/routes/*` 落地，不触碰非必要前端文件。

## 2026-02-23 (后端高风险整改结果)

- `story/prompt` 列表将 `tags` 过滤下推到 SQL，`items` 与 `total` 统一基于同一 `where` 条件，避免分页统计失真。
- `story/prompt` 列表移除作者与点赞状态逐条查询，改为 `leftJoin` + 批量点赞映射，消除核心 N+1。
- 点赞与下载逻辑改为事务 + `onConflictDoNothing`，并仅在实际插入/删除时更新计数，降低并发计数漂移风险。
- 审核端 `unpublish/restore` 改为条件更新（带状态条件）并校验 `rowsAffected`，避免并发流转覆盖。
- 管理统计改为 `group by status` 聚合，替代多次 count 查询。
- `stories/prompts` 列表路由新增 query schema 与正整数解析兜底，收敛非法分页参数输入。

## 2026-02-24 (Character Card Recovery + Patch Replay)

- `app/game.tsx` and `lib/llm-client.ts` had compile-breaking corruption patterns (unterminated strings / invalid characters), so files were backed up and restored from git-tracked state before patch replay.
- Backups were saved at:
  - `.recovery/game.tsx.corrupt.backup`
  - `.recovery/llm-client.ts.corrupt.backup`
- Fix #1 replayed successfully in `app/game.tsx`:
  - exact-name-first matching
  - generic alias no longer used for merge
  - ambiguous alias conflict now logs and creates a new card
  - existing non-generic hidden alias is preserved
- Fix #3 replayed successfully in `lib/llm-client.ts`:
  - replaced strict `newCharacters` filter with `normalizeLLMNewCharacters(...)`
  - missing optional fields now default-filled instead of silent drop

## 2026-02-24 (高风险修复执行前定位)

- `app/game.tsx` 关键链路仍存在原地修改 `story` 并跨异步写回：自动翻页、fallback choices、续写主链路、生图链路、角色删除。
- `lib/llm-client.ts` 除 `continueStory` 外，多个 `fetch` 调用没有超时控制，存在请求悬挂风险。

## 2026-02-27（举报功能闭环）

- 现状确认：广场详情页仅有点赞/下载，无举报入口，不满足“投诉举报+处置留痕”闭环。
- 新增举报数据模型 `content_reports`，含 `reporter + target + reason + status + handledBy/handledAt`，并加唯一索引限制同用户重复举报同目标。
- 用户举报接口新增：`POST /v1/reports`，仅允许已认证用户提交，且仅对 `approved` 内容开放举报。
- 管理端新增举报统计与列表：`GET /v1/admin/reports/stats`、`GET /v1/admin/reports`。
- 管理端新增举报处置动作：`POST /v1/admin/reports/:uuid/handle` 与 `.../reject`（仅 pending 可操作，含并发状态校验）。
- 管理后台前端已支持 `report` 类型筛选与卡片渲染，并显示举报原因、目标状态、处理备注。
- App 端在 `prompt-detail` 与 `story-detail` 新增举报按钮，内置原因选项并调用新接口。

## 2026-02-27（提示词 TXT 导入导出）

- 现状确认：提示词页面仅支持预设增删改与投稿，不支持文件级导入导出。
- 新增导出格式：`# AIourStory Prompt Presets Export` + JSON payload（含 `format/version/exportedAt/presets`），可长期兼容演进。
- 导出范围为“默认配置 + 所有自定义预设”，满足一次性备份。
- 导入解析支持从文本中提取 JSON 数据块，校验格式与版本，并补齐缺失 prompt key 默认值。
- 导入策略为“全部作为新预设写入”，名称自动追加 `（导入）`，不覆盖现有预设。
- App 页面已接入：顶部新增“导入 txt / 导出 txt”按钮；原生端支持文档选择+分享，Web 支持直接下载 txt。
- `lib/story-store.ts` 的 `JSON.parse` 在 `getStoryIds/getAllStories/getStory` 路径缺少兜底，脏数据会直接抛异常。
- 当前文件内容主体已恢复可读中文，但仍需在本轮修复中顺带清理注释可读性并避免乱码回归。

## 2026-02-24 (高风险等价修复结果)

- `app/game.tsx` 增加 `mutateLatestStory(...)`，用于基于最新存档进行单点更新，减少自动翻页、fallback choices、返回、删除角色等路径的陈旧写回风险。
- `proceedWithChoice(...)` 改为以 `workingStory`（最新快照/本地副本）执行整段更新，避免直接原地改动 React 状态对象引用。
- `handleGenerateImage(...)` 改为基于 `workingStory` 更新状态与提示词历史，降低并发链路下的对象覆盖概率。
- `lib/llm-client.ts` 新增 `fetchWithTimeout(...)` 并覆盖所有 LLM 网络请求，统一超时行为，保留原有业务逻辑分支。
- `lib/story-store.ts` 新增 `safeParseJson(...)`，并用于 `getStoryIds/getAllStories/getStory`，避免脏 JSON 直接崩溃。
- 针对乱码回归做了目标文件扫描，未发现注释或关键字符串中的乱码模式。

## 2026-02-24 (续写与生图策略升级)

- 总结触发阈值已调整为 15000 字，且摘要压缩仅更新 summary，不再裁剪 segments，以降低最近剧情丢失风险。
- 上下文构建策略已改为保留最近 100 个 segments（含无摘要与有摘要场景），并在续写请求中使用 `buildHistoryContext(...)` 结果。
- 自动生图策略改为：初始剧情自动触发一次，后续按“玩家选项次数阈值”触发；阈值来自设置并可实时变更。
- 针对“阈值运行中变更”场景，新增 checkpoint 机制（`autoBgChoiceCheckpoint`），避免重复触发或漏触发。
- 新增背景图缩放能力：50/75/100/125/150%，故事页右侧新增 75% 透明滑块与快捷档位按钮。
- 新增评估模型链路：对每轮新增续写片段做异步评估，结果写入 `continuationFeedbackHistory`，并在下一轮续写提示中附带最近评估建议，且不阻塞主续写返回。

## 2026-02-24 (缩放交互 UI 优化 - 方案1)

- 已移除常驻右侧缩放侧栏，改为“场景区域双击唤起”的短时浮层，默认不占视野。
- 缩放浮层支持背景/人物双模式切换，2.5 秒自动淡出（无阻断式交互）。
- 人物缩放入口增加在角色头像长按（对话头像与角色卡头像），满足快速直达调节。
- 人物缩放已持久化到故事存档（`characterScalePercent`），与背景缩放策略一致。

## 2026-02-25 (story generation regression audit)

- Confirmed `storyGenerationStatus` and `lastStoryGenerationError` are still in `Story` type and home list UI, but runtime writes for these fields are mostly missing in `app/game.tsx` generation paths.
- Confirmed `app/(tabs)/index.tsx` still renders generating/failed hints based on those fields, so current UX can appear broken/stale.
- Confirmed `app/game.tsx` currently shows only spinner text during generation; no elapsed seconds and no cancel action.
- Confirmed `lib/llm-client.ts` still enforces AbortController timeouts (default 90s; continue path 120s) that can interrupt long-generation models.
- Confirmed docs (`BUG.md`, `plan.md`) describe previously implemented behavior for background-safe generation and multi-story state, indicating regression in current code.

## 2026-02-25 (implemented restore)

- `app/game.tsx` now writes `storyGenerationStatus` lifecycle in both initial generation and continue generation:
  - start: `generating`
  - success: `idle`
  - failure: `failed` + `lastStoryGenerationError`
  - user-cancel: `idle` without failure toast
- Added persisted `storyGenerationStartedAt` support (`lib/story-store.ts` migration + create defaults), enabling elapsed-time display during background generation.
- Added dialogue-area generation UX:
  - elapsed seconds text (`剧情生成中... 已生成 N 秒`)
  - `取消生成` button wired to AbortController cancellation
- Introduced cross-screen controller registry (`storyGenerationControllers`) so background/in-flight generation for a story can still be canceled after navigation.
- Restored background-safe behavior:
  - entering a story with `storyGenerationStatus=generating` and empty segments no longer triggers duplicate initial generation.
  - lightweight polling syncs current story state while background generation is in progress.
- Removed forced timeout interruption for story generation requests in `lib/llm-client.ts`:
  - `generateStory` and `continueStory` now support `AbortSignal` and default to no timeout (`timeoutMs ?? null`).
  - cancellation remains user-driven via AbortController.

## 2026-02-25 (邮箱验证码改造 - 实施前发现)

- 当前账号体系主链路是设备匿名会话 + 用户名密码绑定/登录：
  - 路由：`server/src/routes/auth.ts`
  - 服务：`server/src/services/auth.service.ts`
  - 客户端页面：`app/login.tsx`
- `users` 表目前无 `email` 字段，且无验证码存储表，需新增迁移。
- 管理端后台 `server/admin/app.js` 依赖用户名密码登录 `/auth/login`，若直接改接口会回归；需保留密码登录专用接口。
- App 侧展示字段仍以 `username` 为主（settings/profile），改造后应切为邮箱展示并做脱敏。

## 2026-02-25 (邮箱验证码改造 - 实施结果)

- 后端认证接口已切换为邮箱验证码主链路：
  - `POST /auth/send-email-code`
  - `POST /auth/register`（绑定邮箱，需已登录匿名会话）
  - `POST /auth/login`（邮箱验证码登录）
- 为兼容后台管理账号，新增 `POST /auth/password-login`，并将 `server/admin/app.js` 登录请求切换到该接口。
- 数据层新增：
  - `users.email` 字段 + 唯一索引
  - `email_verification_codes` 表（验证码 hash、过期时间、尝试次数、消费标记）
  - 迁移文件 `server/src/db/migrations/0001_email_auth_upgrade.sql`
- 鉴权服务新增 SMTP 发信与验证码风控：
  - 60 秒重发冷却
  - 每日发送上限
  - 验证码有效期与最大尝试次数
- 客户端已切换到邮箱验证码交互：
  - `app/login.tsx` 增加发送验证码与倒计时
  - `lib/auth-store.ts` / `lib/auth-provider.tsx` API 参数改为 `email + code`
  - 资料与设置页展示邮箱字段。

## 2026-02-25 (AI配置切换 + 广场高量保护)

- 当前设置页中“文本模型”和“评估模型”字段不对称：文本模型有预设/APIKey/API URL/模型/温度，评估模型缺少预设与温度，用户体验不一致。
- `lib/storage.ts` 当前仅有全局 `temperature`，评估模型调用 `evaluateContinuationQuality` 会复用该值，无法单独控制。
- 广场列表接口目前是 offset 分页，虽然已有 `limit<=50` 防护，但当数据规模增长时深分页会变慢。
- 改造策略：
  - 设置页改为 `文本模型 | 评估模型` 切换面板，共用同一组字段 UI。
  - 新增 `evalTemperature` 存储与调用路径。
  - `stories/prompts` 列表新增可选 `cursor` 参数（针对 newest 排序），保持向后兼容 page/limit。

## 2026-02-25 (AI配置切换 + 广场高量保护 - 实施结果)

- `app/(tabs)/settings.tsx` 已改为 `文本模型 | 评估模型` 切换式配置；两侧统一支持：预设、API Key、API URL、模型、温度。
- `lib/storage.ts` 已新增 `evalTemperature` 持久化键，评估模型温度可独立保存。
- `lib/llm-client.ts` 的 `evaluateContinuationQuality(...)` 已优先使用 `evalTemperature`，不再强制复用文本模型温度。
- 广场列表已新增可选 cursor 分页能力：
  - 路由：`/prompts`、`/stories` 支持 `cursor`
  - 服务：`prompt.service.ts`、`story.service.ts` 在 `newest` 排序下支持 keyset 查询并返回 `nextCursor`
- 客户端：`lib/plaza-api.ts` 与 `shared/api-types.ts` 已兼容 `nextCursor`

## 2026-02-25 (邮箱密码体系调整 + 广场页接入)

- 用户确认邮箱体系改为：注册时设置密码、登录走密码、仅重置密码走邮箱验证码。
- 后端认证接口已对应调整：
  - `/auth/send-email-code` 增加 `purpose`（`register|reset`）
  - `/auth/register` 改为 `email+password+code`
  - `/auth/login` 改为 `email+password`
  - 新增 `/auth/reset-password`（`email+code+newPassword`）
- 客户端登录页已重构为三流程：绑定（含验证码）、密码登录、忘记密码重置。
- 广场页 `app/(tabs)/plaza.tsx` 已接入 cursor 分页并支持“加载更多”。
