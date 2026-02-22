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

## 28. 本轮新增：IP 直连联调默认配置修复

### 28.1 ToDo

- [x] 将客户端默认 API 基址调整为 `http://8.137.71.118:3000/v1`。
- [x] 在 `app.config.ts` 根据默认 API 地址自动启用 Android `usesCleartextTraffic`。
- [x] 保留 `EXPO_PUBLIC_ALLOW_INSECURE_HTTP` 的显式覆盖能力。
- [x] 回归验证 `pnpm run check`。

### 28.2 Result

- [x] `lib/api-client.ts`：默认回退基址已改为 IP HTTP 直连。
- [x] `app.config.ts`：新增 `defaultApiBaseUrl` 与 `shouldEnableCleartextTraffic`，自动判断清流量放行。
- [x] Android 构建在未配置环境变量时可直接用于 IP 直连联调。
- [x] `pnpm run check` 已通过。

## 29. 本轮新增：DashScope 生图 404 兼容修复

### 29.1 ToDo

- [x] 增加 DashScope 生图端点识别与候选请求策略。
- [x] 增加 DashScope 原生生图响应解析（同步/异步）。
- [x] 增加任务轮询逻辑，支持 task_id 自动获取最终图片 URL。
- [x] 保持 OpenAI 兼容生图逻辑不回归。
- [x] 回归验证 `pnpm run check`。

### 29.2 Result

- [x] `lib/image-client.ts`：新增 DashScope 主机识别与原生端点回退（避免 `.../images/generations` 404）。
- [x] `lib/image-client.ts`：支持 DashScope `task_id` 异步轮询 `/api/v1/tasks/{task_id}` 直到拿到图片 URL。
- [x] `lib/image-client.ts`：保留并兼容原 OpenAI images API 解析逻辑。
- [x] `pnpm run check` 已通过。

## 30. 本轮新增：图片配置主流厂商预设

### 30.1 ToDo

- [x] 新增图片预设列表（火山、千问、千帆、Grok、自定义）。
- [x] 在设置页图片配置区增加“预设选择”入口与弹窗。
- [x] 选择预设后自动回填 `imageApiUrl` 与 `imageModel`。
- [x] 增加 DashScope 异步模型提示文案。
- [x] 回归验证 `pnpm run check`。

### 30.2 Result

- [x] `app/(tabs)/settings.tsx`：新增 `IMAGE_API_PRESETS`，覆盖火山、千问、千帆、Grok 与自定义。
- [x] `app/(tabs)/settings.tsx`：图片配置新增预设选择卡片与独立弹窗，可一键回填 URL/模型。
- [x] `app/(tabs)/settings.tsx`：新增 DashScope 异步说明文案，提示 `qwen-image`/万相差异。
- [x] `pnpm run check` 已通过。

## 31. 本轮新增：生图日志可观测与温度可配置

### 31.1 ToDo

- [x] 在图片生成客户端补充失败日志（端点、状态码、错误摘要）。
- [x] 增加温度配置持久化字段（读/写/清理）。
- [x] 设置页增加温度输入、校验，并接入测试连接。
- [x] LLM 调用统一读取并应用温度配置。
- [x] 回归验证 `pnpm run check`。

## 32. 本轮新增：Grok 生图 size 参数兼容修复

### 32.1 ToDo

- [x] 识别 `Argument not supported: size` 错误分支。
- [x] 失败后移除 `size` / `image_size` 参数重试一次。
- [x] 增加该重试路径日志。
- [x] 回归验证 `pnpm run check`。

### 32.2 Result

- [x] `lib/image-client.ts`：新增 size 参数不支持错误识别，命中时自动降级重试。
- [x] `lib/image-client.ts`：重试会移除 `size` 与 `image_size`，兼容 Grok 图像接口。
- [x] `lib/image-client.ts`：新增重试日志 `generation retry without size`。

## 33. 本轮新增：图片 size 传参策略回归修复

### 33.1 ToDo

- [x] 恢复“未填写 size 不传 size 参数”。
- [x] DashScope 原生请求仅在有 size 时才发送 `parameters.size`。
- [x] 调整错误分支优先级，确保 Grok size 不支持先命中去参重试。
- [x] 回归验证 `pnpm run check`。

### 33.2 Result

- [x] `lib/image-client.ts`：`imageSize` 为空时不再默认注入 `1280x720`。
- [x] `lib/image-client.ts`：DashScope 原生请求仅在用户填写 size 时才传 `parameters.size`。
- [x] `lib/image-client.ts`：size 不支持错误优先进入“去 size 重试”分支，并支持清理嵌套 `parameters.size`。

## 34. 本轮新增：互动即结算的好感度重构

### 34.1 ToDo

- [x] 去掉“未命中关键词直接无变化”的硬门槛。
- [x] 只要命中互动角色就执行好感结算。
- [x] 按难度重设好感增减幅度（简单高增低减，噩梦低增高减）。
- [x] 中性互动引入掷骰兜底方向。
- [x] 回归验证 `pnpm run check`。

## 35. 本轮新增：历史压缩可见性与角色名显示修复

### 35.1 ToDo

- [x] 历史压缩时不再向可见剧情插入摘要段。
- [x] 压缩后仅保留尾部段落并维护索引与角色首登场位置。
- [x] 对话区角色名改为基于角色卡的显示名映射。
- [x] 回归验证 `pnpm run check`。

## 36. 待确认：输入体验与真名自动揭示优化

### 36.1 ToDo

- [x] `create-story` 页面键盘遮挡修复（故事开场输入可见性）。
- [x] 自定义选项输入草稿持久化（关闭弹窗不丢失）。
- [x] 角色真名稳定出现后自动置 `isNameRevealed=true`。
- [x] 联动验证角色卡显示名与对话区显示名同步。
- [x] 回归验证 `pnpm run check`。

### 36.2 Result

- [x] `app/create-story.tsx`：增强键盘避让与焦点滚动，修复“故事开场”被输入法遮挡。
- [x] `app/game.tsx`：自定义行动弹窗关闭不再清空草稿，仅提交成功时清空。
- [x] `app/game.tsx`：新增真名稳定出现自动揭示逻辑（最近对话命中真名>=2）。
- [x] `app/game.tsx`：历史与当前对话区角色名统一走角色卡映射显示。

## 37. 本轮新增：AI 驱动的初始好感度评估

### 37.1 ToDo

- [x] `llm-client` 新增批量评估新角色初始好感接口。
- [x] 新角色入场后接入 AI 初始好感覆盖逻辑。
- [x] 保留本地兜底值，AI 失败时不中断流程。
- [x] 回归验证 `pnpm run check`。

### 37.2 Result

- [x] `lib/llm-client.ts`：新增 `evaluateInitialAffinities`，基于主角与角色关系批量评估 0-100 初始好感。
- [x] `app/game.tsx`：在新角色入场后调用 AI 评估并覆盖初始好感值。
- [x] `app/game.tsx`：AI 失败时保留本地关系兜底值并记录警告，不影响主流程。
