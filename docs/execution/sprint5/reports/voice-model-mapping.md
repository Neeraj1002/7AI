# Report: TTS model per voice (PR #104)

- **Branch:** `fix/tts-model-per-voice`
- **Worktree:** `D:\Study Material\7AI-fix-tts-voice` (made late; see "Process notes")
- **PR:** [#104](https://github.com/Neeraj1002/7AI/pull/104)
- **Task doc:** none. This report is the record.

## Task prompt (as given, verbatim)

> Bug: Video step fails with OpenAI TTS 400 "Input should be nova, shimmer, echo, onyx, fable, alloy, ash, sage or coral" when the voice is Ballad (also other newer voices). The configured TTS model only accepts those 9 voices.
> Do: (1) find where the voiceover model is chosen; (2) pick the model per voice (newer voices -> gpt-4o-mini-tts, others unchanged) or, if that is not possible, remove unsupported voices from the voice list the app gets; (3) validate the voice before the Video step starts, so it fails early with a clear message, not after spend; (4) add a test; (5) check cost per minute of the newer model is within the estimate.
> Keep replies and tool output short. One PR, one-line status.

Follow-ups from the founder, folded into this PR: a live call per model with a $0.50 ceiling; this report; and the PR review (book `gpt-4o-mini-tts` by audio duration, one call on each of the 13 voices plus a rejection proof, usage-event test or "unverified", the stale-default question, Ballad's pace, commit the report, pull `main`, re-test, mark ready).

## What changed

| File | Change |
|---|---|
| `studio/src/media/registry.ts` | `resolveMediaPurpose(purpose, voice?)`: `ballad`, `verse`, `marin`, `cedar` resolve to `gpt-4o-mini-tts` (`TTS_NEWER_MODEL`); everything else stays on `tts-1-hd`. New `assertSupportedVoice(voice)`. `TtsPricingEntry` gains optional `perMinuteUsd`; new `TTS_PRICING` row for `gpt-4o-mini-tts`. |
| `studio/src/media/client.ts`, `probe.ts` (new), `types.ts` | `synthesizeSpeechViaProvider` books a model with `perMinuteUsd` by measured audio duration (ffprobe, `probeAudioSeconds`). It falls back to the per-character figure, never $0, if the audio cannot be measured. `SynthesizeSpeechResult.costBasis` (`'duration'` or `'characters'`) says which was used. |
| `studio/src/media/index.ts` | `synthesizeSpeech` passes the voice to `resolveMediaPurpose`; exports `assertSupportedVoice`. |
| `studio/src/agents/video-generation/index.ts`, `long-form.ts`, `long-narration.ts` | Every place that records the TTS model or builds the chunk-cache key now passes the voice, so usage records name the model that spoke. |
| `studio/src/run-pipeline/state-machine.ts` | `assertSupportedVoice(resolvedVoice)` right after the voice resolves, before the stage row or any paid call, as a `NonTransientStageError` with the list of valid voices. The long-form narration booking line uses the mapped model instead of the hard-coded `'tts-1-hd'`. |
| `studio/src/api/routers/runs.ts` | `runs.create` runs the same check on the voice the run will use (override, profile or channel default), as a `BAD_REQUEST` before the run exists. |
| Tests | `media/registry.test.ts`, `media/client.test.ts`, `agents/video-generation/closure2-render.test.ts`, `api/routers/runs.long-form.test.ts` (new cases); `run-pipeline/state-machine.plan-recovery.test.ts` fixtures changed from the fake voices `'v'`/`'different'` to real ones (`alloy`/`onyx`), because the new check correctly rejected them. |

The pre-flight estimate (`run-pipeline/cost-estimate.ts`) is unchanged and still prices narration per character at the `tts-1-hd` rate.

## Real calls on dev (OpenAI directly)

All through `synthesizeSpeech`, so the model is the one the registry picks. No database writes.

**1. Long sample, same 354-character script, with Whisper** (before the duration change; the Ballad TTS cost below is the per-character figure of that time)

| | Ballad | Onyx |
|---|---|---|
| Model in the usage fields | `gpt-4o-mini-tts+whisper-1` | `tts-1-hd+whisper-1` |
| Audio length | 25.84 s | 22.24 s |
| Caption alignment | 58/58 words, 97% word match, first word 0 ms, last word ends 360 ms before the audio ends, longest gap 860 ms | 58/58, 97%, first word 0 ms, 340 ms tail, longest gap 1500 ms |
| Cost | TTS $0.005710 + Whisper $0.002584 | TTS $0.010620 + Whisper $0.002224 |
| TTS cost per audio minute | $0.0133 | $0.0287 |

**2. All 13 voices, one short sentence each (62 characters), final code**

| Voice | Model | Audio | Booked | Basis |
|---|---|---|---|---|
| alloy, ash, coral, echo, fable, onyx, nova, sage, shimmer | `tts-1-hd` | 3.6 to 3.9 s | $0.001860 | characters |
| ballad | `gpt-4o-mini-tts` | 4.97 s | $0.001242 | duration |
| verse | `gpt-4o-mini-tts` | 5.06 s | $0.001266 | duration |
| marin | `gpt-4o-mini-tts` | 3.77 s | $0.000942 | duration |
| cedar | `gpt-4o-mini-tts` | 4.46 s | $0.001116 | duration |

All 13 returned audio. Total for the 13 calls: $0.0213.

**3. Rejection proof:** `tts-1-hd` with `ballad` returns HTTP 400, "Input should be 'nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy', 'ash', 'sage' ...", mapped to a `NonTransientStageError`. This is the original bug, reproduced.

Total live spend for this report: about $0.04, against the $0.50 ceiling.

## Cost: unit, estimate or not, and where the pricing row is

- **Unit:** US dollars. `tts-1-hd` is per character: $30 per million, from OpenAI's published rate, and it is what OpenAI bills. `gpt-4o-mini-tts` is per minute of audio: $0.015, booked as measured duration x that rate.
- **Is it an estimate?** The pre-flight estimate is. For `gpt-4o-mini-tts`, even the booked cost is an estimate: OpenAI bills that model by tokens and publishes about $0.015 per minute as an approximation, so the booked figure is not the invoice. Measured: $0.0133 per minute (long sample), which is below the assumed rate. I took the $0.015 from memory of OpenAI's published figure and did not re-check their pricing page: **unverified against the invoice.**
- **Where:** `TTS_PRICING` in `studio/src/media/registry.ts`, key `[TTS_NEWER_MODEL]` (`'gpt-4o-mini-tts'`). Its `perCharacterUsd` (`0.015 / (155 * 6)`) only serves the estimate and the fallback.
- **Within the estimate?** Yes. At about $0.015 per minute against about $0.028 for `tts-1-hd`, the estimate priced on `tts-1-hd` stays an upper bound for these voices.

## Pace: Ballad (and Verse) speak slower

Ballad took 25.84 s for the script Onyx read in 22.24 s: 16% longer, about 14% fewer words per minute (134.7 against 156.5). On the short sentence the gap was larger: Ballad 4.97 s and Verse 5.06 s against 3.6 to 3.9 s for `tts-1-hd` voices (about 30% longer); Marin was equal to them and Cedar 16% longer. One sample each, so the exact figure is noisy, but the direction is clear. A script sized with the shared 155 words per minute will therefore run short in Ballad and Verse. Task 8 R7 (length from each voice's measured pace) is the fix; nothing in this PR changes pacing. The cost per audio minute is by duration, so slower voices cost proportionally more per word.

## Questions answered

- **Can a stale channel default reach `assertSupportedVoice`? Yes.** Writes are validated (`channels.ts`, `channel-profile/schema.ts` use the voice enum), but the stored value is read back as a free string (`Channel.defaultVoice`, the profile JSON). A value written before the list changed, by a seed, or straight in the database resolves through `resolveChannelConfig` into `audioDefaultVoice` and reaches the Video step unchecked. That is the case the state-machine check covers.
- **Can it also run at run creation? Yes, and it now does.** `runs.create` checks the voice the run will use (override, profile or channel default) and returns `BAD_REQUEST` naming the voice, before the run is created. The state-machine check stays as the backstop for a run whose channel changed after creation. Test: `runs.long-form.test.ts`, "stale channel voice".

## Tests

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 120 files passed, 12 skipped; 915 tests passed, 65 skipped, 0 failed (after merging `main` at `67199eb`).
- New: voice-to-model mapping, per-minute price within the estimate, unknown-voice error (`registry.test.ts`); duration booking, per-character booking with no probe, and the fallback when ffprobe fails (`client.test.ts`); usage-event fields name `gpt-4o-mini-tts+whisper-1` (`closure2-render.test.ts`); stale channel voice refused at `runs.create`.
- The first full run after merging `main` had 3 failures in `state-machine.plan-recovery.test.ts`. They were mine: the fixtures used the fake voice `'v'`, which the new check rejects. Fixed in the fixtures; the check is right.

## Unverified

- **Usage-event database write.** The tests cover the usage-event fields (model string and cost) and the booking function, not the actual `insertUsageEvent` row on a real run. I did not run a full video or write to the dev database. The live calls above never touched the database.
- **Cost against the invoice.** See above: `gpt-4o-mini-tts` is billed by tokens; the per-minute rate is OpenAI's approximation, taken from memory.
- **A full pipeline run with a newer voice.** Not done (stills and renders would cost far more than the $0.50 ceiling allows for no extra proof). Unit tests and the live calls cover each piece, not the path end to end.
- **Voice quality, caption timing across a whole video** and chunk-cache behaviour with a changed voice (the cache key already includes the model, so a switch re-synthesizes).

## Files Task 8 R10 or R8.6 may also touch

Task 8 R10 builds the voice catalog; R8.6 completes the pricing table (an unknown model must be an error in tests). Both overlap this PR; expect merge conflicts in:

- `studio/src/media/registry.ts`: `TTS_VOICES` (R10 moves it to a catalog with provider, model and voice id per voice; my `NEWER_VOICES` set and `resolveMediaPurpose` mapping should become that catalog's model field), `TTS_PRICING` and `resolveTtsPricing` (R8.6), `DEFAULT_TTS_VOICE`, `resolveVoice`.
- `studio/src/media/index.ts`, `client.ts`, `types.ts`, `stub.ts` (the stub's per-character rate, hard-coded to `tts-1-hd`), `probe.ts` (new).
- `studio/src/api/routers/options.ts` (voice list the app gets), `runs.ts` (`voice` enum at the edge, the new creation check), `channels.ts` (`defaultVoice` enum).
- `studio/src/channel-profile/schema.ts`, `resolve.ts`; `studio/src/types/channel.types.ts`; `studio/src/models/schema.prisma` (the `defaultVoice` comment); `studio/src/run-pipeline/resolved-options.ts`.
- `studio/src/run-pipeline/state-machine.ts` (the voice check, and the narration booking line that R8.4 also inspects), `cost-estimate.ts` (R8.1: the estimate still assumes `tts-1-hd`).
- `studio/src/agents/video-generation/index.ts`, `long-form.ts`, `long-narration.ts`, `spend.ts` (R8.3/R8.4 usage rows).
- `studio/src/llm/registry.ts` and `studio/src/ai-visuals/registry.ts` (R8.6 pricing, not touched here).
- `app/lib/pipeline-options.ts` (the app's voice list; Task 7 R6).
- Tests: `media/registry.test.ts`, `media/client.test.ts`, `run-pipeline/state-machine.plan-recovery.test.ts`, `agents/video-generation/closure2-render.test.ts`, `api/routers/runs.long-form.test.ts`.

## Process notes (Hard rules)

- **Rule 4:** I first created the branch and commit in the shared `D:\Study Material\7AI` checkout, not a worktree. Another session then switched that checkout to `main`. Nothing was lost because the commit was already pushed. The worktree above was made afterwards and all later work is there.
- **Rule 1:** nothing was pushed or merged to `main`.
- **Rule 5:** no task doc, so nothing to sync.
- **Rule 6:** PR was opened ready by mistake, converted to draft. Before `gh pr ready`: `git fetch` and `git pull origin main` in this worktree (merge commit `45e9e33`, no conflicts), then type-check and the full suite re-run; `git diff --name-only origin/main...HEAD -- docs/` lists only this report.
- **Rule 7:** this report is the only doc I wrote. I did not edit `STATUS.md` or any other doc. The architect records the branch, worktree and PR number from the top of this file.
