# Project TODO

## 说明

- 历史旧清单已因编码损坏迁移到 `todo.garbled.backup.md`。
- 本文件从 2026-02-20 起使用 UTF-8 重新整理。

## 22. 本轮新增：设置页日志功能

### 22.1 执行结果

- [x] 新增 `lib/app-logger.ts`，实现本地日志存储、读取、清空、导出格式化。
- [x] 在 `app/_layout.tsx` 初始化日志系统并接管 `console.log/warn/error`。
- [x] 在 `app/(tabs)/settings.tsx` 增加日志区域（查看、清空、导出）。
- [x] 完成日志查看 Modal（可滚动、可刷新）。
- [x] `pnpm run check` 已通过。

## 23. 本轮新增：BUG.md 问题修复

### 23.1 执行结果

- [x] 已修复退出登录后仍保持绑定账号的问题（服务端匿名回退）。
- [x] 已修复故事投稿页频闪问题（`submit-story` effect 依赖收敛）。
- [x] 已修复 APK 调试仪表盘不可见问题（去掉 `__DEV__` 限制）。
- [x] 已更新 `BUG.md` 修复记录。
- [x] `pnpm run check` 通过。
- [x] `server/pnpm run build` 通过。

## 24. Security Hardening (This round)

### 24.1 ToDo

- [ ] Add backend security headers (`@fastify/helmet`).
- [ ] Split rate limits by route sensitivity (auth/admin stricter).
- [ ] Add production safety validation in config (JWT secret length, sane defaults).
- [ ] Create `SECURITY.md` with actionable server hardening checklist.
- [ ] Run `pnpm run check` and `server/pnpm run build`.

### 24.2 Result

- [x] Added backend security headers via `@fastify/helmet`.
- [x] Added stricter route-level limits for auth/admin endpoints.
- [x] Added production config safety checks (`JWT_SECRET` length, proxy/rate defaults).
- [x] Added `server/SECURITY.md` hardening runbook.
- [x] `pnpm run check` passed.
- [x] `server/pnpm run build` passed.

## 25. 本轮新增：交互与生图链路修复

### 25.1 ToDo

- [x] 修复自定义行动判定值丢失（确保始终返回 1-8）。
- [x] 优化随机主角外貌兜底逻辑，按题材与性格生成。
- [x] 调整创建故事流程，改为进入 game 后统一执行初始生成。
- [x] 初始生成后按“故事开场”自动入队背景生图。
- [x] 保持角色立绘自动生图队列在创建后链路可用。

### 25.2 Result

- [x] `lib/llm-client.ts`：`evaluateCustomAction` 现在强制返回判定值并增加难度兜底。
- [x] `lib/llm-client.ts`：外貌兜底改为 `genre + personality + premise` 语义生成。
- [x] `app/create-story.tsx`：移除创建页直接生成剧情，统一交由 `app/game.tsx` 初始化流程处理。
- [x] `app/game.tsx`：初始生成后新增 `initial-opening` 背景图入队，并保留角色立绘队列。

## 26. 本轮新增：续写链路并行化与长历史压缩

### 26.1 ToDo

- [x] 将继续剧情前置摘要刷新改为并行后台任务（不阻塞续写）。
- [x] 续写请求改为使用完整历史上下文；超过 8000 字时触发摘要压缩。
- [x] 摘要完成后折叠历史段为单条摘要段，并保留后续新段，避免改坏主流程。
- [x] 新摘要生成后追加“简短标题”LLM 调用，并写入 summaryHistory。
- [x] 下调节奏目标字符：慵懒1600、轻松1200、紧张900、紧迫600。
- [x] 回归验证 `pnpm run check` 与 `pnpm test`。

### 26.2 Result

- [x] `app/game.tsx`：继续剧情改为“先续写、后后台摘要压缩”，去除前置摘要串行阻塞。
- [x] `app/game.tsx`：超 8000 字触发并行摘要任务，完成后压缩为单条历史摘要段并保留新增段。
- [x] `app/game.tsx` + `lib/llm-client.ts`：新摘要生成后追加短标题生成调用并写入 `summaryHistory`。
- [x] `lib/llm-client.ts`：`PACE_MIN_CHARS` 已调整为 1600/1200/900/600。
- [x] `pnpm run check` 与 `pnpm test` 已通过。

## 27. 本轮新增：角色好感度可感知与结算增强

### 27.1 ToDo

- [x] 重构好感结算函数，返回结构化变化结果。
- [x] 扩展正负关键词，并支持负向降好感。
- [x] 增加角色关联兜底（最近对话 + 最近摘要角色）。
- [x] 加入掷骰结果加权与单回合变化上限。
- [x] 增加“好感变化”短时提示与 Debug Context 结算摘要。
- [x] 回归验证 `pnpm run check` 与 `pnpm test`。

### 27.2 Result

- [x] `app/game.tsx`：`applyAffinityFromChoice` 已升级为结构化结算，支持正负双向与来源追踪。
- [x] `app/game.tsx`：新增最近摘要角色兜底关联，降低“无变化”概率。
- [x] `app/game.tsx`：掷骰 `better/exact/worse` 已纳入好感变化幅度加权，单回合限制 `[-3, +3]`。
- [x] `app/game.tsx`：新增“好感变化”短时提示条，并在 Debug Context 显示最近结算摘要。
- [x] `pnpm run check` 与 `pnpm test` 已通过。
