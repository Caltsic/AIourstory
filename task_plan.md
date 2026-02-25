# Task Plan

## Goal

瀹炵幇鏁呬簨缁啓鏂扮瓥鐣ヤ笖涓嶅紩鍏ュ崱椤匡細鎬荤粨闃堝€兼敼涓?15000銆佷笂涓嬫枃淇濈暀鏈€杩?100 segments銆佺敓鍥炬敼涓衡€滃垵濮嬩竴娆?+ 鎸夐€夐」娆℃暟瑙﹀彂鈥濄€佹敮鎸佽儗鏅浘缂╂斁婊戝潡銆佹帴鍏ヨ瘎浼版ā鍨嬪苟鎶婅瘎浼扮粨鏋滅敤浜庝笅涓€杞画鍐欐彁绀恒€?
## Constraints

- 涓嶆敼鍙樻牳蹇冪帺娉曪紙閫夐」鎺ㄨ繘涓庨瀛愭満鍒朵笉鍙橈級銆?- 璇勪及妯″瀷娴佺▼蹇呴』寮傛锛屼笉闃诲涓荤画鍐欒繑鍥炪€?- 鐜╁鍦ㄨ缃腑鍔ㄦ€佷慨鏀圭敓鍥鹃鐜囨椂锛屼笉寰楀鑷撮噸澶嶈Е鍙戞垨婕忚Е鍙戙€?
## Phases

| Phase | Task                                                  | Status    |
| ----- | ----------------------------------------------------- | --------- |
| 1     | 閰嶇疆灞傛墿灞曪細鏂板璇勪及妯″瀷閰嶇疆涓庣敓鍥鹃鐜囬厤缃?           | completed |
| 2     | 涓婁笅鏂囦笌鎬荤粨绛栫暐锛?5000 闃堝€?+ 100 segments 涓婁笅鏂?   | completed |
| 3     | 鐢熷浘瑙﹀彂鏀归€狅細鍒濆涓€娆?+ 閫夐」璁℃暟椹卞姩锛屽惈鍔ㄦ€佸彉鏇撮槻鎶?| completed |
| 4     | UI 鏀归€狅細鍙充晶 75% 閫忔槑鑳屾櫙缂╂斁婊戝潡锛?0~150%锛?        | completed |
| 5     | 璇勪及妯″瀷鎺ュ叆锛氳瘎浼扮画鍐欏苟鍦ㄤ笅涓€杞彁绀轰腑寮曠敤            | completed |
| 6     | 鏍￠獙涓庡洖褰掓祴璇?                                       | completed |

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
| Phase | Task | Status |
| --- | --- | --- |
| A | Audit current generation flow and regressions | completed |
| B | Restore per-story status writes (`generating/idle/failed`) and background-safe writeback | completed |
| C | Add generating elapsed seconds + cancel button in dialogue area | completed |
| D | Remove story generation timeout interruption and support AbortSignal cancel | completed |
| E | Validate with typecheck/tests and manual behavior checks | completed |

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

