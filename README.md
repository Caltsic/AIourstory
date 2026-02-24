# AI Story Game

一个基于 Expo + React Native 的 AI 互动剧情应用。

## 功能概览

- 多题材剧情生成（奇幻、校园、悬疑、都市等）
- 本地存档与剧情继续
- 可配置文本模型 API（OpenAI 兼容）
- 可配置图片生成 API
- 支持 iOS / Android / Web
- 内置社区广场（投稿、审核、点赞、下载）

## 环境要求

- Node.js >= 20
- pnpm >= 9

## 本地启动

```bash
pnpm install
pnpm dev
```

## 常用命令

```bash
pnpm check      # TypeScript 检查
pnpm lint       # ESLint
pnpm test       # 单元测试
pnpm format     # 格式化
```

## 服务端（可选）

```bash
cd server
pnpm install
pnpm dev
```

默认服务端为 Fastify + Drizzle + SQLite。

## API 配置说明

应用支持 OpenAI 兼容格式的文本接口（`/chat/completions`），常见服务包括：

- OpenAI
- DeepSeek
- xAI Grok
- Moonshot (Kimi)
- Zhipu (GLM)
- Doubao/Ark
- OpenRouter

图片接口支持 OpenAI Images 兼容格式，部分厂商（如 DashScope）包含异步任务轮询兼容逻辑。

## 文档编码说明

历史上存在部分文档编码损坏问题。本仓库当前文档统一按 UTF-8 维护；历史乱码文件已归档到带 `garbled.backup` 后缀的文件中。
