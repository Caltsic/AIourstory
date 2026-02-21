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