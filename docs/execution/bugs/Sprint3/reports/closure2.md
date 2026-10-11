# Bugs Sprint 3 Closure, Part 2: Report (in progress)

Branch `Sprint3_CLOSURE2`, cut from `origin/main` at `aee3175` (PR #56 merge). Preconditions checked on GitHub: PRs #46, #47, #48, #52, #54, #55 and #56 are all merged. **Whether they are deployed to preview is a founder check (P1).**

This report is partial on purpose. The code items are done; the items that need the founder's phone or the preview server (P1, P2, and everything in P3/P4 that depends on P2) have not been run, and P6 needs the Project copies of the docs. Nothing below claims a result that was not observed. The draft PR stays a draft until the P2 table is filled in.

## Status by item

| Item | State |
|---|---|
| P1 Put the real build on preview | **Founder.** Not run. |
| P2 Triage all 24 reports | **Founder tests, agent records.** Not started: the table below is empty. No report has been changed through `bugs.updateTriage`. |
| P3 Reports 12-15 in detail | Waits for P2 (re-test first, code only if it still reproduces). |
| P4 Leftovers (17, 18, 19, 20) | Waits for P2. |
| P5 Failed-render spend | **Built** (commit `BUGS_CLOSURE2_P5_P8`). Live check only possible when a real render fails. |
| P6 Bug docs up to date | **Done** (commit `BUGS_CLOSURE2_P6`). The protocol: the repo copy had no edit newer than the Project copy (a sentence-level comparison found only the Project's new material), so I added the Project's "Bug lifecycle: triage and closure" section and the triage-pass kickoff in the repo's formatting and kept the repo's relative links (plus an admin-module link). `closureTask.md` and `closureTask2.md` are replaced by the Project copies. STATUS: only the status text of the closure part 1, part 2, Task 10 and Task 11 rows was changed (merged PR numbers and dates). |
| P7 Inbox chip | **Verify only**, on the deployed build after the OTA (P2 report 10). Not run. |
| P8 End tail | **Built and checked on local test renders** (details below). The founder judges the ending by ear. |
| P9 Ended runs findable | **Built** (typecheck/lint only, never run on a device). |
| P10 Polish | Item 1 built. **Item 2 deliberately skipped** (reason below). |

## P5: spend rows

**What the repo already shows (from the task, founder SQL 2026-10-08, not re-checked by me):** the six `gpt-image-1.5` rows at $0 are all from 2026-09-28; run `c3a0175c` booked its `video-generation` row at $0.2001 including $0.182 of stills ($0.013 each), no `unknown` rows. The success path records image cost correctly; the old $0 rows are closed as pre-Task 8.

**Per-still price ($0.013, gpt-image-1.5, 1024x1536, `low`):** **not confirmed against the provider's published price by me** (no verified source in this session). It is the figure in `ai-visuals/registry.ts` and the weekly budget gate uses it. Founder: please compare it with OpenAI's current price for that size and quality.

**Failed-render gap, fixed.** Before: when `generateVideo` threw after TTS, Whisper or image calls were already paid, the catch in `state-machine.ts` booked provider/model `unknown` at $0, once per retry. Now:
- `agents/video-generation/spend.ts` (new): a per-attempt `VideoSpend` tally (TTS characters/cost, transcription seconds/cost, stills count/cost, the stub flags) and `failedRenderUsage`, which turns it into one `video-generation` usage event (provider `openai`, model e.g. `tts-1-hd+whisper-1+gpt-image-1.5`, real total cost, characters, audio seconds, metadata with `failedRender: true`, the failure message and `stubFlags`). With nothing spent yet it returns null and the old row is kept.
- `generateVideo` takes an optional `spend` and fills it as each paid call finishes.
- `ai-visuals/client.ts`: a failure part-way through the stills now carries `partialStillCount` / `partialCostUsd` in the thrown error's context (the already-generated stills were billed). The error class is unchanged, so the retry logic is unaffected.
- `state-machine.ts`: `attemptVideoOnce` creates a fresh tally per attempt (each retry pays again) and the catch books it.
- Chose a tally passed in over attaching the usage to the thrown error: `generateVideo` can fail with plain errors (an ffmpeg exit) whose class the retry logic depends on, and I did not want to wrap or change them. It reuses the same idea as Task 11's `stage-failure.ts` (real usage on the failure row) but is a running tally because a render makes several different paid calls.
- Tests (`closure2-render.test.ts`): a mocked failure after TTS (TTS cost kept), and after image generation part-way (TTS + transcription + partial stills), plus `failedRenderUsage` totals and stub flags.
- Live check still pending a real failed render; when one happens the founder pastes:

```sql
SELECT "createdAt", model, "costUsd", metadata FROM usage_events
 WHERE model = 'gpt-image-1.5' OR provider = 'unknown' ORDER BY "createdAt" DESC LIMIT 10;
```

## P8: short tail after the last spoken word

`END_TAIL_SECONDS = 0.7` in `agents/video-generation/quality-spec.ts`. With it:
- the picture is held with `tpad=stop_mode=clone` (the last image stays on screen); for `ai-stills` the old `-stream_loop -1` is dropped while a tail is set, because looping would flash the first still back in the tail (the held-frame approach also covers the sub-frame gap the loop used to cover);
- the last caption stays on screen for the tail (`buildAss(holdLastCueMs)`, last cue only);
- the voice gets `apad` silence of the tail length, and with a music bed the bed is faded out across it (`afade`, starting where the voice ends); with `audioLayer: none` the tail is plain silence;
- the loudness measuring pass sees the same tail, so the two-pass normalisation still matches;
- Whisper is untouched: it transcribes the TTS file, which never gets the tail. No fade to black and no end card.
- With the constant at 0 the audio graph string is identical to before (unit-tested), and the video uses the old loop.

Answers to the task's four questions, from two local test renders (real TTS, `AI_VISUALS_STUB`/`STOCK_FOOTAGE_STUB` visuals, `audioLayer: calm`, 11.7 s voice):
- **Loudness:** `ai-stills` -14.0 LUFS / -1.5 dBTP, stock -14.0 LUFS / -1.5 dBTP, no hard failure. The last 1.3 s of the stills render has a mean volume of -36 dB against -16.6 dB for the speech part: the bed fades down and the tail is near-silent.
- **Length:** the videos are 12.5 s and 12.6 s against 11.7 s / 11.8 s of voice: the tail is about 0.8 s (0.7 plus the AAC frame padding). I did not find a maximum-length check that the tail could trip (`targetDurationSec` is a script-length hint, not a hard limit on the file); not run against a 59 s script.
- **Held frame:** SSIM between two frames inside the tail is 0.99; between the last frame and the first frame 0.62, so there is no loop flash back to the start.
- **Longest shot:** the test renders use stub visuals (flat single frames), so the shot-detection numbers are meaningless here ("Longest single shot 12.5 s", "Only 1 distinct shot" for the stock stub). On real footage the last shot grows by about 0.7 s through the held frame; if a last shot was already between 3.3 s and 4 s the soft warning will appear. I held the last frame rather than spreading it across two shots, since a spread would change the shot windows PR #46 tuned. **The `qualityMetrics` for one real `ai-stills` and one real stock run are the founder's P8 check** (the task's verify step needs the deployed build).
- **Captions/transcription:** timestamps unchanged; `qualityMetrics.duration` includes the tail because it measures the finished file.
- Tests (`closure2-render.test.ts`): tail defaults under a second; zero tail gives the identical graph; voice padded and bed faded from the voice end; no fade without a bed; the measuring pass has the same tail; the last caption (only) is held.
- Tuning: only the constant changes.

## P9: where ended runs can be found

**Before (read from the code):**
- Queue tab (`(tabs)/index.tsx`) asks `runs.list` for `paused_gate1`, `paused_gate2`, `needs_attention`, `running`, `pending` only. No ended run (`completed`, `failed`: cancelled, rejected and channel-deleted runs are all `failed`) is in it.
- Dashboard shows counts only. The channel screen (`channel/[id].tsx`) has no run list.
- The Inbox lists notifications; a resolved gate card links to its run ("Open run"), and a push opens its run. So an ended run was reachable only through the Inbox card of a gate, never for a run that ended without one (a budget-refused or cancelled-while-running run, for example): the founder's case.

**After:** the Queue tab ends with an "Ended runs" section (collapsed; opening it loads `runs.list` for `completed` and `failed`, newest first by creation, 20 at a time with "Show more"). Each row: a status chip (Completed, Failed, Cancelled, Rejected at Gate 1/2, Channel deleted; derived from `lastError`, the same strings the server's `deriveEndReason` matches), the run's topic line, the channel and the date. Tapping opens the run and its Details. The topic line (`runTopic`: the intake-parsed topic, otherwise the brief's first non-empty line, 90 characters at most) also replaces the whole brief on the Queue cards and is shown on every Inbox card that belongs to a run (lazy per card, cached by run id). No backend change; `runs.list` already returns ended runs. All ended runs are fetched at once when the section is opened (no server-side paging); fine at this volume, an additive limit would be the next step.
- Not verified on a device (typecheck and lint only). Screenshots pending (founder).

## P10: polish

1. Done: the Details list prints "gate 1" / "gate 2" (`stageLabel`).
2. **Skipped on purpose:** disabling "Retry this step" for a budget-skipped run would need the app to know the limit is still exceeded. The run only stores the old refusal text, so after the founder raised the limit (or on Monday) the button would stay disabled until the run was cancelled. That is worse than today's behaviour (Retry works and `runs.retry` explains if still refused), and it is more than a few lines (it needs a live budget check in `runs.get`).

## Files touched that PR #46, #47 or other merged work had changed

- `agents/video-generation/index.ts`, `audio-mix.ts`, `captions-ass.ts`, `quality-spec.ts` (PR #46): P8 tail and the P5 tally. Additive; existing tests pass untouched.
- `ai-visuals/client.ts` (PR #46): partial-spend context on failure (P5).
- `run-pipeline/state-machine.ts` (PR #46/#55 area): the video-generation catch path books the tally (P5).
- App: `(tabs)/index.tsx`, `(tabs)/notifications.tsx`, `run/[id].tsx`, `lib/run-labels.ts` (P9/P10). PR #56 changed `notifications.tsx`; I read it first and only added the topic line.

## Verification run

- studio: `npm run typecheck`, `npm run lint` clean; `npx vitest run`: 345 passed, 49 skipped (55 files passed, 9 skipped, no failures).
- app: `npx tsc --noEmit` clean; `eslint` on the changed screens shows only a pre-existing `Array<T>` warning in `run-labels.ts` (line 57, not mine).
- Two local test renders for P8 (real OpenAI TTS and Whisper, a few cents; stubbed visuals). The earlier `audio-bed` test render pattern was reused. No server was started, `sevenai_preview` was never touched.

## The 24 reports (P2): not started

| # | Classification | area | status | evidence | fixed by |
|---|---|---|---|---|---|
| 1-24 | _to be filled after P1 and the device tests_ | | | | |

## What is left, and what I need

1. **Founder, P1:** confirm the deploy (`git log -1 --oneline` in `/var/www/7AI`, `pm2 status`, `prisma migrate status`), the R2 variable names, the stub flags, and the five audio-bed files. Paste the results.
2. **Founder, P2:** run the scenarios in the task's P2 table on the deployed build (it also covers P7, the tail by ear for P8, and P9 after the OTA). I then record every report through `bugs.updateTriage` and fill the table. This also answers 12-16 and decides whether any P3/P4 code is needed.
3. ~~P6 docs~~ done, see above.
4. **Ship:** the server needs a deploy (P5, P8) and the app an OTA, `eas update --branch preview` (P9, P10): JS only, no APK, but the OTA must target the runtime of the Task 10 APK the founder installed.
