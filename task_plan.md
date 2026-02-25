# Task Plan

## Goal

瀹炵幇鏁呬簨缁啓鏂扮瓥鐣ヤ笖涓嶅紩鍏ュ崱椤匡細鎬荤粨闃堝€兼敼涓?15000銆佷笂涓嬫枃淇濈暀鏈€杩?100 segments銆佺敓鍥炬敼涓衡€滃垵濮嬩竴娆?+ 鎸夐€夐」娆℃暟瑙﹀彂鈥濄€佹敮鎸佽儗鏅浘缂╂斁婊戝潡銆佹帴鍏ヨ瘎浼版ā鍨嬪苟鎶婅瘎浼扮粨鏋滅敤浜庝笅涓€杞画鍐欐彁绀恒€?

## Constraints

- 涓嶆敼鍙樻牳蹇冪帺娉曪紙閫夐」鎺ㄨ繘涓庨瀛愭満鍒朵笉鍙橈級銆?- 璇勪及妯″瀷娴佺▼蹇呴』寮傛锛屼笉闃诲涓荤画鍐欒繑鍥炪€?- 鐜╁鍦ㄨ缃腑鍔ㄦ€佷慨鏀圭敓鍥鹃鐜囨椂锛屼笉寰楀鑷撮噸澶嶈Е鍙戞垨婕忚Е鍙戙€?

## Phases

| Phase | Task                                                                        | Status    |
| ----- | --------------------------------------------------------------------------- | --------- |
| 1     | 閰嶇疆灞傛墿灞曪細鏂板璇勪及妯″瀷閰嶇疆涓庣敓鍥鹃鐜囬厤缃?                | completed |
| 2     | 涓婁笅鏂囦笌鎬荤粨绛栫暐锛?5000 闃堝€?+ 100 segments 涓婁笅鏂?              | completed |
| 3     | 鐢熷浘瑙﹀彂鏀归€狅細鍒濆涓€娆?+ 閫夐」璁℃暟椹卞姩锛屽惈鍔ㄦ€佸彉鏇撮槻鎶? | completed |
| 4     | UI 鏀归€狅細鍙充晶 75% 閫忔槑鑳屾櫙缂╂斁婊戝潡锛?0~150%锛?                  | completed |
| 5     | 璇勪及妯″瀷鎺ュ叆锛氳瘎浼扮画鍐欏苟鍦ㄤ笅涓€杞彁绀轰腑寮曠敤               | completed |
| 6     | 鏍￠獙涓庡洖褰掓祴璇?                                                       | completed |

## Risks

- `app/game.tsx` 浣撻噺澶э紝瑙﹀彂閾捐矾澶氾紝淇敼闇€閬垮厤骞跺彂鍥炲綊銆?- 璇勪及妯″瀷寮傛鍐欏洖闇€瑕侀槻姝笌鐜╁蹇€熻繛鐐归€犳垚鐘舵€佽鐩栥€?- 涓婁笅鏂囩瓥鐣ヨ皟鏁村彲鑳藉奖鍝?token 娑堣€椾笌鍝嶅簲鏃堕棿銆?

## Validation Target

- `pnpm run check`
- `pnpm run test -- tests/story-store.test.ts`

## Validation Result

- `pnpm run check` passed
- `pnpm run test -- tests/story-store.test.ts` passed (21 tests total in run)

## 2026-02-25 - Restore Story Generation UX + Background/Concurrent Support

### Goal

1. Keep story generation running in background and persist results even when leaving `game` screen.
2. Restore reliable per-story generation state for multi-story concurrent generation.
3. Replace forced timeout interruption with user-visible elapsed seconds and manual cancel.

### Phases

| Phase | Task                                                                                     | Status    |
| ----- | ---------------------------------------------------------------------------------------- | --------- |
| A     | Audit current generation flow and regressions                                            | completed |
| B     | Restore per-story status writes (`generating/idle/failed`) and background-safe writeback | completed |
| C     | Add generating elapsed seconds + cancel button in dialogue area                          | completed |
| D     | Remove story generation timeout interruption and support AbortSignal cancel              | completed |
| E     | Validate with typecheck/tests and manual behavior checks                                 | completed |

### Risks

- `app/game.tsx` is large; generation logic is spread across initial generation, continue generation, and custom action evaluation.
- Removing timeout without manual cancel can re-introduce stuck generating states if cancellation is not wired end-to-end.
- Background-safe updates must not overwrite newer story snapshots.

### Validation Target

- `pnpm run check`
- `pnpm run test -- tests/story-store.test.ts`

### Validation Result (2026-02-25)

- pnpm run check passed
- pnpm run test -- tests/story-store.test.ts passed

## 2026-02-25 - 邮箱验证码注册/登录改造

### Goal

1. 将 App 账号体系从“用户名+密码”切换为“邮箱+验证码”。
2. 保留匿名设备会话与 `isBound` 机制，绑定账号时必须使用邮箱验证码。
3. 后端补齐验证码发送、校验、限流与存储；前端登录页切换为邮箱流程。

### Constraints

- 不破坏现有匿名设备登录与刷新令牌机制。
- `requireBound` 行为保持不变，广场投稿等权限逻辑不回归。
- 管理端账号密码登录路径保留（单独接口），避免影响管理员后台。

### Phases

| Phase | Task                                                     | Status    |
| ----- | -------------------------------------------------------- | --------- |
| 1     | 现状审计与方案落地（路由/服务/数据结构/UI）              | completed |
| 2     | 数据库与后端改造（邮箱字段、验证码表、SMTP发信、新接口） | completed |
| 3     | 客户端改造（登录页、auth-store/provider、资料展示）      | completed |
| 4     | 回归验证（类型检查、服务端构建、关键流程自测）           | completed |

### Risks

- 邮箱验证码链路包含外部 SMTP 网络调用，开发环境可能受网络波动影响。
- 旧用户名密码接口若直接移除，管理员后台会受影响，需提供保留路径。
- 数据迁移新增唯一索引时需兼容已有空值数据。

### Validation Target

- `pnpm run check`
- `pnpm run build` (in `server/`)

### Validation Result (2026-02-25)

- `pnpm run build` (in `server/`) passed
- `pnpm run check` passed

## 2026-02-25 - AI配置切换 + 广场高量保护

### Goal

1. 将设置页 AI 文本模型与评估模型改为同构字段 + 点击切换配置。
2. 为评估模型补齐独立温度配置，避免和文本模型共用一个温度。
3. 为提示词/故事广场列表增加高数据量下更稳的游标分页能力（兼容现有分页）。

### Phases

| Phase | Task                                                   | Status    |
| ----- | ------------------------------------------------------ | --------- |
| 1     | 设置页与存储结构审计，确定同构字段改造方案             | completed |
| 2     | 落地 AI 配置切换 UI 与评估模型温度配置                 | completed |
| 3     | 落地广场 cursor 分页能力（后端+客户端类型）            | completed |
| 4     | 回归验证（`pnpm run check` + `server/pnpm run build`） | completed |

### Validation Result (2026-02-25)

- `server/pnpm run build` passed
- `pnpm run check` passed

## 2026-02-25 - 广场分页 + 邮箱密码体系调整

### Goal

1. 广场页接入后端 cursor 分页能力，支持继续加载，降低大数据量压力。
2. 邮箱账号流程改为“注册设密码 + 密码登录 + 忘记密码验证码重置”。

### Phases

| Phase | Task                                                                      | Status    |
| ----- | ------------------------------------------------------------------------- | --------- |
| 1     | 调整后端认证接口与服务（register/login/reset-password/send-code-purpose） | completed |
| 2     | 调整客户端登录页与 auth-store/provider 调用                               | completed |
| 3     | 接入广场页加载更多（cursor）                                              | completed |
| 4     | 回归验证（`server/pnpm run build` + `pnpm run check`）                    | completed |

### Validation Result (2026-02-25)

- `server/pnpm run build` passed
- `pnpm run check` passed
