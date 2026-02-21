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
