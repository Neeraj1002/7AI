# Sprint 4 Frontend Task 1 — Report

## E1 — Gate 2 Quality checks

**Status: Built, awaiting founder device verification. Provisional pending the board** (the "Gate 2 — quality checks" screenshot was not attached; built from the E1 text using the existing Video review card styling, no new visual language). Not "Done" until the founder's phone screenshot sits beside the board.

**What changed (additive, `app/` only, JS-only)**
- `app/lib/quality-checks.ts` — pure parser: `video_review` output → rows (Loudness, True peak, Resolution, Longest shot, Captions) + `softWarnings`.
- `app/components/QualityChecksCard.tsx` — the card; renders nothing when `qualityMetrics` is absent.
- `app/app/(app)/run/[id].tsx` — one import and one line under the Video review card (Gate 2 only). Bugs Task 10's cancel UI is untouched.

**Rules implemented (founder decisions)**
- No thresholds anywhere in `app/`; no copy of `QUALITY_SPEC`. Resolution, fps and loudness are shown as measured values, never pass/fail.
- Red ✕ only when `hasAudio` is false. Amber ! when `captionsExpected` and `captionsDetected === false`. Everything else green ✓.
- `qualityMetrics.softWarnings` strings are shown verbatim in a card-level amber note; not parsed, no row coloured from them.
- Absent/malformed `qualityMetrics` → card hidden, nothing throws.

**Verification**
- `node --test lib/quality-checks.test.ts` → 6/6 pass. Fixtures: run `75f69faa-…` (one soft warning), run `dc2062a2-…` (all clear), plus no audio, captions expected but missing, captions not expected, and absent/malformed metrics. (The app has no test runner and no dependency was added; this uses Node's built-in `node:test`.)
- `cd app && npx tsc --noEmit`: no errors in `app/`. It reports 22 errors under `studio/` (stale generated Prisma client, missing `@aws-sdk/*` in this worktree), none from this change. `npm run lint` (expo lint) exits 0 with no output; the known `expo-image-picker` `import/no-unresolved` in `channel/[id].tsx` did not print here, and it is not from this change.
- `package.json`, `package-lock.json`, `app.json`, native code: unchanged → fingerprint matches `main`, OTA-eligible.

**Not exercised:** rendering on a device/emulator (no phone screenshots possible), and the live API path for the two preview runs (fixtures only; I did not connect to `sevenai_preview`).

**Founder actions**
1. Attach the board and compare; screenshot Gate 2 on the OnePlus (tenant account `7aistudiochannel@gmail.com`) beside it.
2. After installing the Task 10 APK: `eas update --branch preview`. Not run by the agent.
