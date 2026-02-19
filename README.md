# AI 剧情物语

一款基于 React Native/Expo 开发的 AI 互动故事游戏应用。用户可以创建自己的故事，AI 会根据用户的选择生成剧情走向。

## 特性

- 🎭 多种故事类型：奇幻冒险、校园日常、悬疑推理、都市情感、古风仙侠等
- 🤖 AI 驱动的剧情生成：根据用户选择实时生成故事内容
- 💾 本地存储：所有故事数据保存在本地，无需联网
- 🔧 自定义 API：支持用户配置自己的 LLM API（OpenAI、DeepSeek、Grok、KIMI、GLM、Seed、AIHubMix、Claude 等）
- 🖼️ AI 图片生成：支持自定义图片 API 和可选尺寸配置
- 🌙 深色模式支持
- 📱 跨平台：支持 iOS、Android 和 Web
- 🔢 自动版本管理：每次提交自动递增版本号

## 快速开始

### 前置要求

- Node.js >= 20.19.4
- pnpm >= 9.0.0

### 安装依赖

```bash
pnpm install
```

### 运行开发服务器

```bash
pnpm dev
```

在文件目录终端运行指令后选择"y"直接跳转至网页，并生成expo go的测试码。

### 构建

```bash
# 构建 Web 版本
pnpm build

# 使用 EAS 构建 iOS/Android 版本
eas build --platform ios
eas build --platform android
eas build --platform android --profile preview（构建.Apk）
```

## API 配置

应用需要配置 LLM API 才能生成故事内容。支持以下兼容 OpenAI API 格式的服务：

### 支持的 API 提供商

| 提供商              | API URL                                    | 默认模型                   |
| ------------------- | ------------------------------------------ | -------------------------- |
| OpenAI              | `https://api.openai.com/v1`                | `gpt-4o-mini`              |
| DeepSeek            | `https://api.deepseek.com/v1`              | `deepseek-chat`            |
| Grok (xAI)          | `https://api.x.ai/v1`                      | `grok-2-latest`            |
| KIMI (Moonshot)     | `https://api.moonshot.cn/v1`               | `moonshot-v1-8k`           |
| GLM (Z.ai)          | `https://open.bigmodel.cn/api/paas/v4`     | `glm-4-flash`              |
| Seed (Doubao)       | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-1-6-250615`   |
| AIHubMix            | `https://api.aihubmix.com/v1`              | `gpt-4o-mini`              |
| Claude (OpenRouter) | `https://openrouter.ai/api/v1`             | `anthropic/claude-3-haiku` |
| 自定义              | 用户自定义                                 | 用户自定义                 |

### 配置步骤

#### 文本模型配置

1. 打开应用，进入「设置」页面
2. 选择预设（OpenAI、DeepSeek、Grok、KIMI、GLM、Seed、AIHubMix、Claude）或选择「自定义」
3. 输入 API Key
4. 输入 API URL（使用预设会自动填充）
5. 输入模型名称
6. 点击「测试连接」验证配置
7. 点击「保存配置」

#### 图片生成配置（可选）

1. 在设置页面找到「图片生成配置」部分
2. 输入图片 API Key、API URL 和模型名称
3. **Size（可选）**: 输入图片尺寸（如 `1024x1024`），留空则让服务商使用默认尺寸
4. 点击「保存图片配置」

### API Key 获取

- **OpenAI**: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **DeepSeek**: [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- **Grok (xAI)**: [https://console.x.ai/](https://console.x.ai/)
- **KIMI (Moonshot)**: [https://platform.moonshot.cn/](https://platform.moonshot.cn/)
- **GLM (Z.ai)**: [https://open.bigmodel.cn/](https://open.bigmodel.cn/)
- **Seed (Doubao)**: [https://console.volces.com/](https://console.volces.com/)
- **AIHubMix**: [https://aihubmix.com/](https://aihubmix.com/)
- **Claude (OpenRouter)**: [https://openrouter.ai/](https://openrouter.ai/)

## 项目结构

```
ai-story-game/
├── app/                    # Expo Router 页面
│   ├── (tabs)/            # 底部标签页
│   │   ├── index.tsx      # 首页（故事列表）
│   │   ├── settings.tsx   # 设置页（API 配置）
│   │   └── _layout.tsx    # 标签页布局
│   ├── create-story.tsx   # 创建新故事
│   ├── game.tsx          # 游戏主界面
│   └── _layout.tsx       # 根布局
├── components/             # 可复用组件
├── lib/                   # 核心库
│   ├── llm-client.ts     # LLM API 客户端
│   ├── llm-prompts.ts    # AI 提示词
│   ├── story-store.ts    # 故事数据存储
│   ├── image-client.ts   # 图片生成 API 客户端
│   ├── storage.ts        # 存储管理
│   └── dice.ts           # 骰子判定逻辑
├── scripts/               # 脚本工具
│   └── bump-version.js   # 自动版本递增脚本
├── assets/                # 静态资源
└── eas.json              # EAS 构建配置
```

## 技术栈

- **框架**: React Native + Expo Router
- **语言**: TypeScript
- **样式**: NativeWind (Tailwind CSS for React Native)
- **存储**: AsyncStorage (故事数据/Web) + SecureStore (API Key/原生)
- **AI 集成**:
  - 文本生成：直接调用 OpenAI 兼容格式的 LLM API
  - 图片生成：支持 SiliconFlow、FLUX、Seedream 等图片 API
- **版本管理**: 基于 Git 钩子的自动版本递增

## 开发

### 代码检查

```bash
pnpm check
```

### 代码格式化

```bash
pnpm format
```

### 运行测试

```bash
pnpm test
```

### 版本管理

项目配置了自动版本递增功能，每次提交时会自动将版本号 +0.01（语义化版本中的 patch 号 +1）：

- **自动版本脚本**: `scripts/bump-version.js`
- **Git 钩子**: `.git/hooks/pre-commit`（在每次 `git commit` 前自动执行）
- **更新文件**: `package.json` 和 `app.config.ts` 中的版本号

版本格式遵循语义化版本：`主版本.次版本.修订号`（如 `1.0.2`）

## 许可证

MIT
