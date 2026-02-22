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
