# Task Plan

## Goal

实现故事续写新策略且不引入卡顿：总结阈值改为 15000、上下文保留最近 100 segments、生图改为“初始一次 + 按选项次数触发”、支持背景图缩放滑块、接入评估模型并把评估结果用于下一轮续写提示。

## Constraints

- 不改变核心玩法（选项推进与骰子机制不变）。
- 评估模型流程必须异步，不阻塞主续写返回。
- 玩家在设置中动态修改生图频率时，不得导致重复触发或漏触发。

## Phases

| Phase | Task                                                  | Status    |
| ----- | ----------------------------------------------------- | --------- |
| 1     | 配置层扩展：新增评估模型配置与生图频率配置            | completed |
| 2     | 上下文与总结策略：15000 阈值 + 100 segments 上下文    | completed |
| 3     | 生图触发改造：初始一次 + 选项计数驱动，含动态变更防抖 | completed |
| 4     | UI 改造：右侧 75% 透明背景缩放滑块（50~150%）         | completed |
| 5     | 评估模型接入：评估续写并在下一轮提示中引用            | completed |
| 6     | 校验与回归测试                                        | completed |

## Risks

- `app/game.tsx` 体量大，触发链路多，修改需避免并发回归。
- 评估模型异步写回需要防止与玩家快速连点造成状态覆盖。
- 上下文策略调整可能影响 token 消耗与响应时间。

## Validation Target

- `pnpm run check`
- `pnpm run test -- tests/story-store.test.ts`

## Validation Result

- `pnpm run check` passed
- `pnpm run test -- tests/story-store.test.ts` passed (21 tests total in run)
