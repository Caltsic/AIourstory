# BUG Record

This file tracks reproducible bugs and fix records.

## Rules

- One bug per entry.
- Include clear repro steps and expected result.
- Do not delete old bugs after fixing. Mark status as fixed.

## Template

### [BUG-YYYYMMDD-001] Title

- Status: open / fixed
- Priority: P0 / P1 / P2 / P3 / P4
- Platform: iOS / Android / Web / Server
- Version:
- Found at:
- Repro steps:

1.
2.
3.

- Actual result:
- Expected result:
- Logs/Screenshots:
- Workaround:
- Fix notes:

## Current Bugs

### [BUG-20260221-002] Logout still keeps bound session

- Status: fixed
- Priority: P2
- Platform: Android
- Version: 1.0.8
- Found at: 2026-02-21 02:48
- Repro steps:

1. Login with bound account.
2. Tap logout.
3. Reopen app.

- Actual result: session still bound.
- Expected result: switch to anonymous session.
- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. `device-login` no longer resumes bound account.
2. Bound registration clears `device_id`.
3. File: `server/src/services/auth.service.ts`.

### [BUG-20260221-003] Story submission page flickers and freezes

- Status: fixed
- Priority: P0
- Platform: Android
- Version: 1.0.8
- Found at: 2026-02-21 02:51
- Repro steps:

1. Open Story Plaza.
2. Tap Submit.
3. Observe continuous flicker/freeze.

- Actual result: page unusable.
- Expected result: page loads normally.
- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. `submit-story` init effect now depends on stable scalar params.
2. File: `app/plaza/submit-story.tsx`.

### [BUG-20260221-004] Debug monitor hidden in APK

- Status: fixed
- Priority: P4
- Platform: Android
- Version: 1.0.8
- Found at: 2026-02-21 03:11
- Repro steps:

1. In Expo Go, monitor is visible.
2. Build APK and install on same phone.
3. Monitor disappears.

- Actual result: monitor not visible in APK.
- Expected result: same visibility as Expo Go.
- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. Removed `__DEV__` guard around `ContextMonitor`.
2. File: `app/game.tsx`.

### [BUG-20260221-005] APK 启动时 initAuth 报 Network Error，导致注册提示 Not authenticated

- Status: fixed
- Priority: P0
- Platform: Android
- Version: 1.0.11
- Found at: 2026-02-21 12:08
- Repro steps:

1. 安装 APK 并启动应用。
2. 进入设置/登录流程。
3. 观察日志出现 `initAuth failed: AxiosError: Network Error`，注册时报 `Not authenticated`。

- Actual result:

1. 匿名会话未建立，后续注册接口因缺少 access token 失败。
2. 登录/初始化阶段提示 Network Error。

- Expected result:

1. `initAuth` 应能建立匿名会话（`/v1/auth/device-login`）。
2. 注册前已有匿名 token，不出现 `Not authenticated`。

- Logs/Screenshots:

1. `[2026-02-21T12:08:05.006Z] [WARN] [console] initAuth failed: AxiosError: Network Error`
2. `[2026-02-21T12:08:04.868Z] [INFO] [logger] App logger initialized`

- Workaround:

1. 构建时设置 `EXPO_PUBLIC_API_BASE_URL=http://8.137.71.118:3000/v1`
2. 构建时设置 `EXPO_PUBLIC_ALLOW_INSECURE_HTTP=1`

- Fix notes:

1. `ensureDeviceSession` 新增网络错误自动回退机制：当默认地址失败时，自动尝试 `http://8.137.71.118:3000/v1`。
2. 生产环境 HTTP 保护新增白名单例外（仅 `8.137.71.118`），用于当前联调阶段。
3. `initAuth` 失败日志增加当前 `apiBaseUrl`，便于快速定位构建变量与网络连通性问题。
4. Files:
   - `lib/auth-store.ts`
   - `lib/api-client.ts`

### [BUG-20260222-006] 自定义行动缺少判定值且创建后生图链路不完整

- Status: fixed
- Priority: P1
- Platform: Android / iOS / Web
- Version: 1.0.13
- Found at: 2026-02-22
- Repro steps:

1. 在游戏中点击“输入自定义行动”，输入偏日常动作。
2. 观察部分情况下未出现掷骰流程（直接续写）。
3. 新建故事后观察生图队列，背景图未按开场自动入队。

- Actual result:

1. 自定义行动存在无判定值分支，掷骰逻辑不一致。
2. 创建后生图链路未统一到初始化队列流程。

- Expected result:

1. 非“无随机”模式下自定义行动都应获得判定值（1-8）。
2. 创建故事后应基于开场自动触发背景生图，并将角色图纳入队列。

- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. `evaluateCustomAction` 改为始终返回 `1-8`，并增加难度兜底。
2. `create-story` 改为仅创建存档并跳转 `game`，由 `game` 初始化统一处理剧情/生图队列。
3. 初始生成后新增 `initial-opening` 背景图入队；角色立绘自动队列保持启用。
4. Files:
   - `lib/llm-client.ts`
   - `app/create-story.tsx`
   - `app/game.tsx`

### [BUG-20260222-007] 继续剧情串行等待过长，长历史未并行压缩

- Status: fixed
- Priority: P1
- Platform: Android / iOS / Web
- Version: 1.0.13
- Found at: 2026-02-22
- Repro steps:

1. 在长剧情存档中点击任意选项继续剧情。
2. 观察续写前会等待摘要刷新，后续又等待续写与再次摘要。
3. 总等待明显偏长，用户长期停留在“剧情生成中...”。

- Actual result:

1. 一次“继续剧情”存在多次串行 LLM 调用。
2. 历史过长时没有并行压缩，超时概率升高。

- Expected result:

1. 选项后应优先进行续写，摘要压缩后台并行执行。
2. 超过 8000 字时自动压缩历史，并保持角色事件标签可用。

- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. `continue` 链路去除前置摘要串行，改为后台摘要压缩任务。
2. 超过 8000 字触发摘要压缩，完成后折叠历史前缀为单条摘要段并保留新段。
3. 新摘要额外调用 LLM 生成短标题，再写入 `summaryHistory`。
4. 节奏字符阈值下调为：慵懒1600、轻松1200、紧张900、紧迫600。
5. Files:
   - `app/game.tsx`
   - `lib/llm-client.ts`

### [BUG-20260222-008] 历史压缩摘要出现在剧情中且角色已知名显示不同步

- Status: fixed
- Priority: P1
- Platform: Android / iOS / Web
- Version: 1.0.15
- Found at: 2026-02-22
- Repro steps:

1. 长剧情触发历史压缩后继续游玩。
2. 观察剧情区出现大段 `[历史压缩摘要]` 文本，自动推进卡顿。
3. 角色在后续剧情中已知真名后，对话区仍显示旧称呼。

- Actual result:

1. 历史压缩结果被直接插入可见剧情段。
2. 对话区角色名直接使用段落原始角色字段，未统一走角色卡显示规则。

- Expected result:

1. 历史压缩仅用于 AI 上下文与总结记录，不在可见剧情展示。
2. 角色知晓真名后，对话区显示应同步切换为真名。

- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. 压缩回写时移除可见摘要段注入，改为仅保留尾部未压缩段并维护索引。
2. 新增基于角色卡的段落角色名映射函数，对话区统一显示映射名。
3. Files:
   - `app/game.tsx`

### [BUG-20260222-009] 输入体验问题与真名揭示滞后

- Status: fixed
- Priority: P1
- Platform: Android / iOS
- Version: 1.0.15
- Found at: 2026-02-22
- Repro steps:

1. 创建故事页编辑“故事开场”，唤起输入法后输入框被遮挡。
2. 游戏内打开“自定义行动”输入到一半关闭弹窗，再次打开草稿丢失。
3. 剧情里角色持续使用真名，但对话区仍显示旧别名。

- Actual result:

1. 输入框可见性受键盘影响，编辑体验差。
2. 自定义草稿关闭即清空，造成重复输入。
3. `isNameRevealed` 对 `knownToPlayer` 依赖过强，自动揭示不及时。

- Expected result:

1. 输入法弹起时“故事开场”应保持可见。
2. 自定义弹窗关闭后草稿应保留，提交成功才清空。
3. 真名稳定出现后应自动切换为真名显示。

- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. `create-story` 增强键盘避让与焦点滚动逻辑。
2. `game` 自定义输入弹窗取消自动清空，仅确认提交后清空。
3. `game` 新增“真名稳定命中>=2 次自动揭示”逻辑，并在对话区使用角色卡映射名。
4. Files:
   - `app/create-story.tsx`
   - `app/game.tsx`

### [BUG-20260222-010] 新角色初始好感度过于单一（长期为0）

- Status: fixed
- Priority: P1
- Platform: Android / iOS / Web
- Version: 1.0.15
- Found at: 2026-02-22
- Repro steps:

1. 多次推进剧情触发新角色入场。
2. 查看角色卡，初始好感多数为 0，关系差异不明显。

- Actual result:

1. 初始好感主要依赖本地规则，关系细节不足，沉浸感弱。

- Expected result:

1. 应由 AI 结合剧情背景与人物关系评估初始好感。
2. 亲属/同伴/敌对等关系应呈现明显差异。

- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. 新增 `evaluateInitialAffinities`，批量评估新角色初始好感（0-100）。
2. 新角色入场后先用本地规则兜底，再由 AI 结果覆盖。
3. AI 调用失败时保留兜底值并不中断剧情流程。
4. Files:
   - `lib/llm-client.ts`
   - `app/game.tsx`

### [BUG-20260223-011] 配置编辑遮挡、URL 自动补全不兼容与日志不可观测

- Status: fixed
- Priority: P1
- Platform: Android / iOS
- Version: 1.0.15
- Found at: 2026-02-23
- Repro steps:

1. 在提示词配置页打开“编辑提示词”弹窗，观察取消/保存被顶部区域遮挡。
2. 弹出输入法后，编辑区域被键盘遮挡。
3. 填写厂商要求的非 OpenAI 标准路径（如 `.../multimodal-generation/generation`），应用仍强行补 `/chat/completions` 或 `/images/generations` 导致失败。
4. 遇到 JSON 格式问题时无法从日志回溯“发送内容/返回内容”。

- Actual result:

1. 弹窗 UI 未按 SafeArea/键盘做适配。
2. URL 被强行拼接固定路径，降低兼容性。
3. 缺少请求/响应日志，排障困难。

- Expected result:

1. 弹窗按钮与输入框不被顶部/键盘遮挡。
2. URL 完全由用户填写并直接生效。
3. 日志可查看每次请求与响应摘要。

- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. 提示词编辑弹窗改为 SafeArea + `KeyboardAvoidingView`。
2. 取消 LLM/生图 URL 自动补全路径，完全使用用户填写的完整 endpoint。
3. LLM/生图请求与响应摘要写入 `app-logger`。
4. 补充主角性别参数，并透传到生成/续写上下文。
5. Files:
   - `app/(tabs)/prompts.tsx`
   - `app/prompt-settings.tsx`
   - `app/(tabs)/settings.tsx`
   - `lib/llm-client.ts`
   - `lib/image-client.ts`
   - `lib/story-store.ts`
   - `app/create-story.tsx`

### [BUG-20260223-012] 切换故事时异步生成回写污染 UI（看起来像串故事）

- Status: fixed
- Priority: P1
- Platform: Android / iOS
- Version: 1.0.16
- Found at: 2026-02-23
- Repro steps:

1. 在故事 A 触发剧情生成或继续剧情。
2. 生成未完成时返回主页面，进入故事 B。
3. 等待故事 A 返回结果。

- Actual result:

1. 故事 A 的异步回调可能在故事 B 页面执行 UI 更新（setStory/setViewIndex/弹窗），造成“串故事”的错觉。

- Expected result:

1. 异步生成应只写回对应 storyId 的存档，不影响当前展示的其他故事 UI。
2. 主页面应可查看每个故事生成状态与最后一次失败原因。

- Logs/Screenshots: none
- Workaround: 等待生成结束后再切换故事
- Fix notes:

1. `game` 生成/续写引入 token+storyId 守卫，UI 更新仅在当前 storyId 且 token 最新时执行。
2. `Story` 增加 `storyGenerationStatus`/`lastStoryGenerationError`，主页面展示 generating/failed 状态。
3. Files:
   - `app/game.tsx`
   - `lib/story-store.ts`
   - `app/(tabs)/index.tsx`

### [BUG-20260223-013] 历史压缩/摘要并发导致 segments 清空、对话框卡死并回到开头

- Status: fixed
- Priority: P0
- Platform: Android / iOS
- Version: 1.0.16
- Found at: 2026-02-23
- Repro steps:

1. 长剧情触发“历史压缩摘要/上文压缩”。
2. 在继续剧情生成的同时触发摘要回写。
3. 观察对话框出现空白卡住；退出重进后故事从开头重新生成，甚至覆盖存档。

- Actual result:

1. 摘要回写会裁剪 segments，极端情况下将 segments 置空，导致 UI 无段落可显示。
2. 重进时 segments 为空触发初始生成，剧情回到开头并覆盖原进度。
3. 并发 updateStory 存在互相覆盖风险，进一步放大回档。

- Expected result:

1. 摘要仅作为 AI 上下文与总结记录，不应修改可见 segments。
2. 续写上文应采用“摘要 + 最近剧情”结构，而不是用摘要替代历史段落。
3. 已受损存档应自动从摘要恢复续写，而不是重新从开头生成。

- Logs/Screenshots: none
- Workaround: none
- Fix notes:

1. 摘要回写仅更新 `storySummary/summaryHistory`，不再裁剪 `segments`。
2. 续写 history 改为 `buildHistoryContext(summary + recent)`，最近剧情扩大到 25 段。

### [BUG-20260223-014] 多故事长期卡在剧情生成中（超过5分钟不返回）

- Status: fixed
- Priority: P0
- Platform: Android / iOS
- Version: 1.0.16
- Found at: 2026-02-23
- Repro steps:

1. 进入两个不同故事并触发剧情生成。
2. 观察其中至少一个故事超过 5 分钟仍停留在生成中。

- Actual result:

1. 生成流程中的部分 LLM 子请求没有超时保护，网络或模型卡住时会无限等待。
2. 历史遗留 `storyGenerationStatus=generating` 在重进时会持续转圈，无法自动回收。

- Expected result:

1. 生成链路任何子请求都应在合理超时后退出并进入 failed。
2. 遗留 generating 状态应在重进时自动回收，避免永久卡死。

- Logs/Screenshots: none
- Workaround: 手动重启应用并重试
- Fix notes:

1. `generateStory/summarizeStory/evaluateInitialAffinities/generateSummaryTitle` 增加 120s 超时。
2. `loadStory` 增加 stale generating 自动回收（3分钟未更新即回收为 failed）。
3. timeout 分支写入日志用于定位。
4. Files:
   - `lib/llm-client.ts`
   - `app/game.tsx`
5. 续写落盘改为合并写回，避免与后台摘要互相覆盖。
6. 若 segments 为空但存在摘要，重进自动走“从摘要恢复续写”。
7. Files:
   - `app/game.tsx`
   - `lib/story-store.ts`
