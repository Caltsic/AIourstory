# Progress Log

## 2026-02-23

- Initialized planning files for this moderation/admin enhancement task.
- Updated `task_plan.md` with new goal, phases, and validation targets.
- Next: inspect admin backend + frontend implementation details and identify gaps for review/unpublish.
- Completed audit: current admin supports pending approve/reject but cannot manage already-approved content lifecycle.
- Next: implement backend unpublish/recover endpoints and status filtering.
- Added backend moderation endpoints and filters in `server/src/routes/admin.ts`.
- Added `unpublished` status support in schema and shared type layer.
- Reworked admin web UI (`server/admin/index.html` + `server/admin/app.js`) to support moderation lifecycle management.
- Updated mobile "my submissions" page to display `unpublished` status.
- Validation completed:
  - `server/pnpm run build` passed
  - `pnpm run check` passed

## 2026-02-23 (续写风险修复)

- 收到“修复所有高风险问题”的实现请求，开始执行代码级修复而非仅 review。
- 执行 planning catchup：默认脚本路径不存在，已切换到 opencode 技能路径并成功运行。
- 已重写 `task_plan.md` 为本轮续写风险收敛目标与阶段。
- 已完成风险点再次定位并记录到 `findings.md`，开始 Phase 2（`app/game.tsx`）。
- 已在 `app/game.tsx` 完成关键修复：
  - 引入 `persistCurrentIndex`，减少翻页/返回时的陈旧对象覆盖写。
  - 续写后将 AI 初始好感评估改为后台回写，降低主路径等待时间。
  - 去除 pre/post 重复摘要任务调度，保留单次触发。
  - `applySummaryCompressionTask` 改为单次读取并写回，减少冗余 IO。
  - 渲染期 full history 指标改为字符计数聚合，避免构造大字符串。
- 已在 `lib/llm-client.ts` 完成超时与解析策略修复：
  - `continueStory` 与多处直接 `fetch` 统一改为 `fetchWithTimeout`。
  - `parseLLMResponse` 默认改为解析失败显式抛错，不再静默兜底。
- 已补充测试：`tests/story-store.test.ts` 新增 `buildHistoryContextBounded` 边界用例 2 条。
- 验证完成：
  - `pnpm run test -- tests/story-store.test.ts` passed (11/11)
  - `pnpm run check` passed
- 根据新增需求，已在 `app/game.tsx` 增加页面内生成 watchdog：
  - 记录 `generating` 起始时间并设置超时计时器。
  - 超过 180 秒仍为 generating 时自动写回 `failed` 与错误信息。
  - 当前页同步停止 loading 态并弹出超时提示。
- 变更后再次验证：`pnpm run check` passed。

## 2026-02-23 (角色卡片审查)

- Ran review-only audit on `app/game.tsx`, `lib/llm-client.ts`, `lib/llm-prompts.ts`, `lib/story-store.ts`, `lib/prompt-store.ts`, and `tests/story-store.test.ts`.
- Traced character lifecycle from LLM `newCharacters` output to card creation and rendering.
- Identified concrete failure modes causing story characters to not appear in cards, with severity ranking and code references.
- No business code changed in this task.

## 2026-02-23 (后端高风险整改执行)

- 根据用户确认，进入 build 模式并开始执行后端整改。
- 已完成 planning-with-files 要求：session catchup、`git diff --stat`、读取并更新 planning 文件。
- 已重建 `task_plan.md` 为后端整改目标与阶段。
- 当前进行中：Phase 2（修复分页与 total 语义一致性）。
- 已完成 `server/src/services/story.service.ts`：
  - tags 过滤前移到 SQL。
  - 列表查询使用 `leftJoin(users)` 与批量 likes 查询消除 N+1。
  - `toggleLike/recordDownload` 改为事务化并发安全写入。
- 已完成 `server/src/services/prompt.service.ts`：
  - 同步落地分页一致性、N+1 优化与事务化计数更新策略。
- 已完成 `server/src/routes/admin.ts`：
  - 统计接口改为 `group by status`。
  - 审核 `unpublish/restore` 增加条件更新与 `rowsAffected` 并发校验。
  - 审核列表作者信息改为 join，移除逐条 author 查询。
- 已完成 `server/src/routes/stories.ts` 与 `server/src/routes/prompts.ts`：
  - 增加 query schema；分页参数使用正整数解析兜底。
- 验证完成：
  - `server/pnpm run build` passed
  - `pnpm run check` passed

## 2026-02-24 (Recovery + Replay)

- Backed up corrupted files to `.recovery/` and restored `app/game.tsx` + `lib/llm-client.ts` from git tracked state.
- Replayed patch #1 in `app/game.tsx` and patch #3 in `lib/llm-client.ts` with minimal surface area.
- Added focused regression tests:
  - `tests/character-card-utils.test.ts`
  - `tests/new-character-normalizer.test.ts`
- Running full validation now (`pnpm test`, `pnpm run check`).
- Validation results:
  - `pnpm test` passed (3 files, 21 tests)
  - `pnpm run check` passed

## 2026-02-24 (高风险等价修复)

- 已根据新需求重建 `task_plan.md`，目标调整为“按风险顺序修复且不改玩法”。
- 完成会话 catchup、`git diff --stat` 与 planning 文件复盘。
- 已完成实施前复核：确认 `app/game.tsx` 状态覆盖写、`lib/llm-client.ts` 超时不一致、`lib/story-store.ts` 反序列化崩溃点为本轮优先级最高问题。
- 已完成 Phase 2：
  - 增加 `mutateLatestStory(...)` 并替换自动翻页、fallback 修补、点击推进、返回、删除角色的直接原地写回。
  - `proceedWithChoice(...)` 改为基于 `workingStory` 更新，减少共享对象并发覆盖。
  - `handleGenerateImage(...)` 改为基于 `workingStory` 持久化。
- 已完成 Phase 3：
  - `lib/llm-client.ts` 增加 `fetchWithTimeout(...)` 并替换所有直接 `fetch` 调用。
- 已完成 Phase 4：
  - `lib/story-store.ts` 增加 `safeParseJson(...)`，对关键读取链路增加容错。
- 已完成 Phase 5：
  - 对目标文件执行乱码模式扫描，未发现注释乱码残留。
- 验证完成：
  - `pnpm run check` passed
  - `pnpm run test -- tests/story-store.test.ts` passed

## 2026-02-24 (续写与生图策略升级)

- 已完成配置扩展：
  - `lib/storage.ts` 增加评估模型 API Key/API URL/Model 与自动生图步数配置。
  - `app/(tabs)/settings.tsx` 增加对应配置输入项与保存校验逻辑。
- 已完成上下文与总结策略改造：
  - 总结触发阈值改为 15000。
  - `buildHistoryContext` 与 `buildHistoryContextBounded` 默认最近段落数改为 100。
  - 续写请求使用 `buildHistoryContext(...)`（摘要 + 最近 100 段）。
  - `applySummaryCompressionTask` 不再裁剪 segments。
- 已完成生图触发策略改造：
  - 初始剧情自动生图保留 1 次。
  - 删除按 summary 自动生图逻辑，改为按玩家选项次数阈值触发。
  - 引入 `autoBgChoiceCheckpoint` 处理玩家中途改阈值时的触发一致性。
- 已完成 UI 改造：
  - 故事页右侧新增 75% 透明背景缩放滑块与 5 个档位按钮。
  - 缩放值持久化到 story（`backgroundScalePercent`）。
- 已完成评估模型接入：
  - `lib/llm-prompts.ts` 增加续写评估系统提示词。
  - `lib/prompt-store.ts` 增加评估提示词 key 与默认值。
  - `lib/llm-client.ts` 增加 `evaluateContinuationQuality(...)`。
  - `app/game.tsx` 在续写成功后异步评估并写入 `continuationFeedbackHistory`，下一轮续写附带最近评估建议。
- 校验通过：
  - `pnpm run check` passed
  - `pnpm run test -- tests/story-store.test.ts` passed (21 tests)

## 2026-02-24 (缩放交互 UI 优化 - 方案1)

- 按用户选择，实施“方案1：双击呼出短时浮层缩放环”。
- `app/game.tsx` 变更：
  - 场景装饰区双击触发背景缩放浮层。
  - 浮层支持背景/人物切换、滑动调节与档位快捷按钮。
  - 人物头像长按触发人物缩放模式；人物图显示应用缩放百分比。
- `lib/story-store.ts` 变更：新增 `characterScalePercent` 并在迁移/新建存档设置默认值。
- 验证：`pnpm run check` passed。

## 2026-02-25 (restore generation UX/background concurrency) 

- Used planning-with-files workflow for this new request.
- Completed targeted audit across `app/game.tsx`, `app/create-story.tsx`, `app/(tabs)/index.tsx`, `lib/story-store.ts`, `lib/llm-client.ts`, plus historical notes in `BUG.md`/`plan.md`.
- Identified core regression: state fields for cross-page generation status exist but are not consistently written during initial/continue generation, which breaks background/multi-story visibility.
- Next: patch generation lifecycle status writes, add elapsed+cancel UI, remove request timeout interruption in story generation path, then run validation.

## 2026-02-25 (restore generation UX/background concurrency) - Completed

- Implemented generation lifecycle state writeback in `app/game.tsx` for both initial generation and continue generation.
- Added `storyGenerationStartedAt` persistence/migration in `lib/story-store.ts`.
- Added dialogue generation elapsed timer and cancel button.
- Added global in-memory controller registry for per-story cancellation across screen transitions.
- Updated loading flow to avoid duplicate initial generation when a story is already generating in background.
- Added background sync polling while viewing a generating story.
- Updated `lib/llm-client.ts` to accept request options (`signal`, `timeoutMs`) and removed default timeout for `generateStory`/`continueStory` calls.
- Validation completed:
  - `pnpm run check` passed
  - `pnpm run test -- tests/story-store.test.ts` passed
