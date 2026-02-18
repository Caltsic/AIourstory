# AI 剧情物语

一款基于 React Native/Expo 开发的 AI 互动故事游戏应用。用户可以创建自己的故事，AI 会根据用户的选择生成剧情走向。

## 特性

- 🎭 多种故事类型：奇幻冒险、校园日常、悬疑推理、科幻未来、古风仙侠等
- 🤖 AI 驱动的剧情生成：根据用户选择实时生成故事内容
- 💾 本地存储：所有故事数据保存在本地，无需联网
- 🔧 自定义 API：支持用户配置自己的 LLM API（OpenAI、DeepSeek、Claude 等）
- 🌙 深色模式支持
- 📱 跨平台：支持 iOS、Android 和 Web

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

### 构建

```bash
# 构建 Web 版本
pnpm build

# 使用 EAS 构建 iOS/Android 版本
eas build --platform ios
eas build --platform android
```

## API 配置

应用需要配置 LLM API 才能生成故事内容。支持以下兼容 OpenAI API 格式的服务：

### 支持的 API 提供商

| 提供商 | API URL | 默认模型 |
|--------|---------|----------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Claude | `https://api.anthropic.com/v1` | `claude-3-haiku-20240307` |
| 自定义 | 用户自定义 | 用户自定义 |

### 配置步骤

1. 打开应用，进入「设置」页面
2. 选择预设（OpenAI、DeepSeek、Claude）或选择「自定义」
3. 输入 API Key
4. 输入 API URL（使用预设会自动填充）
5. 输入模型名称
6. 点击「测试连接」验证配置
7. 点击「保存配置」

### API Key 获取

- **OpenAI**: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **DeepSeek**: [https://platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- **Claude**: [https://console.anthropic.com/](https://console.anthropic.com/)

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
│   └── story-store.ts    # 故事数据存储
├── assets/                # 静态资源
└── eas.json              # EAS 构建配置
```

## 技术栈

- **框架**: React Native + Expo Router
- **语言**: TypeScript
- **样式**: NativeWind (Tailwind CSS for React Native)
- **存储**: AsyncStorage (故事数据) + SecureStore (API Key)
- **AI 集成**: 直接调用 LLM API

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

## 许可证

MIT
