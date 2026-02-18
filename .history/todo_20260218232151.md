# Project TODO

## 已完成 ✅

### 阶段1-2：创建前端 LLM 客户端
- [x] 创建 `lib/llm-client.ts` - LLM 调用封装
- [x] 创建 `lib/llm-prompts.ts` - 提示词常量
- [x] 实现 `getLLMConfig()` - 读取用户 API 配置
- [x] 实现 `generateStory()` - 生成初始剧情
- [x] 实现 `continueStory()` - 继续剧情
- [x] 添加错误处理和 JSON 验证

### 阶段3：API 配置界面
- [x] 创建 `app/(tabs)/settings.tsx` - API 配置界面
- [x] 添加 API Key 输入框（SecureStore 存储）
- [x] 添加 API URL 输入框
- [x] 添加模型选择下拉框
- [x] 实现配置保存功能
- [x] 添加配置测试按钮（验证 API Key 有效性）
- [x] 添加默认配置选项（OpenAI、DeepSeek、Claude 等）

### 阶段4：移除 tRPC 调用
- [x] 修改 `app/game.tsx` - 移除 tRPC 调用
- [x] 替换 `generateMutation` 为 `generateStory()` 直接调用
- [x] 替换 `continueMutation` 为 `continueStory()` 直接调用
- [x] 添加 API 配置检查（未配置时提示用户）
- [x] 添加加载状态优化
- [x] 更新错误提示信息
- [x] 修改 `app/create-story.tsx` - 移除 tRPC 调用
- [x] 替换为 `generateStory()` 直接调用
- [x] 添加 API 配置检查

### 阶段5-6：删除后端代码
- [x] 删除 `server/` 目录（整个后端）
- [x] 删除 `drizzle/` 目录（数据库）
- [x] 删除 `hooks/use-auth.ts`（认证）
- [x] 删除 `lib/trpc.ts`（tRPC 客户端）
- [x] 删除 `lib/_core/auth.ts`（认证）
- [x] 删除 `lib/_core/manus-runtime.ts`（Manus Runtime）
- [x] 删除 `app/oauth/` 目录（OAuth）
- [x] 删除 `lib/_core/api.ts`
- [x] 删除 `tests/auth.logout.test.ts` 和 `tests/routers.test.ts`

### 阶段7：清理配置文件
- [x] 修改 `package.json` - 移除后端依赖
- [x] 移除 `@trpc/client`、`@trpc/react-query`、`@trpc/server`
- [x] 移除 `express`、`jose`、`mysql2`、`drizzle-orm`
- [x] 移除 `dotenv`、`cookie`、`superjson`（前端不需要）
- [x] 移除 `@tanstack/react-query`
- [x] 修改 `package.json` - 移除后端脚本
- [x] 删除 `dev:server`、`build`、`start` 脚本
- [x] 修改 `dev` 脚本为仅启动 Metro
- [x] 修改 `app/_layout.tsx` - 移除 tRPC Provider
- [x] 移除 `trpcClient` 创建代码
- [x] 移除 `QueryClient`（如不需要）
- [x] 移除 `initManusRuntime()` 调用
- [x] 移除 SafeArea 相关代码（如不需要）
- [x] 简化 Provider 层级
- [x] 修改 `shared/types.ts` 中的后端类型
- [x] 修改 `scripts/load-env.js` - 移除 OAuth 相关映射

### 阶段8：清理其他文件
- [x] 修改 `app/(tabs)/index.tsx` - 移除认证相关代码
- [x] 移除 `useAuth` hook 调用
- [x] 移除登录按钮（如有）
- [x] 更新 `app.config.ts`（移除后端相关配置）

### 阶段9-10：EAS 构建配置
- [x] 创建 `eas.json` 配置文件
- [x] 配置构建环境变量

### 阶段11：应用资源检查
- [x] 检查应用图标和启动图
- [x] 检查应用名称和包名

### 阶段12：文档更新
- [x] 更新 `README.md` - 说明新的使用方式
- [x] 添加 API 配置说明
- [x] 添加支持的 API 列表

## 待测试 🧪

以下功能需要手动测试验证：

- [ ] 测试 API 配置保存功能
- [ ] 测试 API 配置读取功能
- [ ] 测试 API 连接验证
- [ ] 测试创建新故事功能
- [ ] 测试剧情生成功能
- [ ] 测试剧情继续功能
- [ ] 测试选项选择功能
- [ ] 测试故事保存功能
- [ ] 测试错误处理（API Key 无效、网络错误等）
- [ ] 测试应用重新启动后配置是否保留
