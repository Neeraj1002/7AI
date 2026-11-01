# Shorts audio holes: separate video and audio filter graphs, and an audio-gap guard

**Date**: 2026-11-02 (IST)
**Status**: PR open, not merged, not deployed
**Branch**: `BUGS_SHORTS_AUDIO_HOLES`
**Follows**: PR #156 (`BUGS_SHORTS_DURATION`), which fixed the picture being cut short. This is a second, separate defect found while looking at the regenerated honey Short.

## Symptom

The founder's phone recording of the regenerated honey Short (run `e8df00af`, attempt 3) showed the app player reporting 37 s while the speech lasted about 24.6 s in real time (the voice itself is 36.64 s). The app plays the final file directly (`GET /runs/:id/video`, no transcode, proxy or R2 draft for Shorts) and sets no playback speed (`expo-video` 57.0.5, `p.loop = false` only), so the file was measured.

## Cause (proven by replay on the production host, ffmpeg 8.0.1-3ubuntu2)

The final mux put the video chain and the audio chain in one `-filter_complex`. With a real stock-footage file as the picture, that graph dropped about 3 s chunks of audio: the finished AAC track has far fewer packets than its length needs, with 3 s holes in the packet timestamps. The count varies from run to run (1167 to 1200 packets for the same inputs), so it is timing-dependent. Why ffmpeg 8.0.1 does this is not diagnosed; it does not reproduce on ffmpeg 9.0.1 locally.

It predates #139 and PR #156: the `f596f80c` renders of 2026-10-30 have it. The #139 report recorded these audio frame counts (1,094 and 962) and the low audio bitrates (129 and 115 kbps against 192 kbps requested) and noted they needed packet-level confirmation; this is that confirmation.

### Audio packets in the finished files (production)

An AAC track of N seconds at 48 kHz needs about 46.9 N packets (1024 samples each).

| File (written) | Source | Audio length | Packets needed | Packets present | Largest gap |
| --- | --- | ---: | ---: | ---: | ---: |
| `e8df00af/3.mp4` (11-01 19:28) | stock | 37.38 s | 1752 | 1200 | 2.99 s |
| `e8df00af/2.mp4` (11-01 13:23) | stock | 12.77 s | 599 | 461 | 2.98 s |
| `e8df00af/1.mp4` (11-01 13:19) | stock | 13.02 s | 610 | 330 | 3.08 s |
| `f596f80c/2.mp4` (10-30 00:11) | stock | 35.24 s | 1652 | 962 | 3.01 s |
| `f596f80c/1.mp4` (10-30 00:05) | stock | 35.16 s | 1648 | 1094 | 3.01 s |
| `63be93e4/1.mp4` (11-01 13:05) | AI stills | 41.30 s | 1936 | 1936 | 0.06 s |
| `67b248b0/1.mp4` | AI stills | 38.80 s | 1819 | 1819 | 0.06 s |
| `2fc078d6/1.mp4` | AI stills | 37.10 s | 1739 | 1736 | 0.11 s |

All five stock-footage files seen are affected; all three AI-stills files are clean. Every packet is the normal 21.3 ms long: the track has fewer packets than its timeline needs, with holes in between.

### What was isolated (replays of the saved command of `e8df00af/3`, output to a temporary directory)

| Variant | Audio packets (clean = 1752) | Largest gap |
| --- | ---: | ---: |
| as saved (one graph) | 1175 to 1200 | 3.26 to 3.27 s |
| without `-shortest` | 1184 | 3.27 s |
| `-filter_complex_threads 1` | 1167 | 3.27 s |
| audio graph alone, no picture mapped | 1752 | 0.07 s |
| synthetic picture instead of the stock file | 1752 | 0.07 s |
| video and audio as two separate graphs | 1752 | 0.07 s |
| audio mixed first into its own file, then copied into the mux | 1752 | 0.07 s |

## Change

- `generateVideo` (`studio/src/agents/video-generation/index.ts`): the video chain and the audio chain are two separate `-filter_complex` options. The filters themselves are unchanged. The saved `ffmpeg-args.json` stores `filterGraphs: { video, audio }` in place of the single `filterComplex` string.
- Guard after the final mux (`audio-guards.ts`, Shorts only, `NonTransientStageError`, no LLM): the stage fails with a plain reason if the largest gap between consecutive audio packet timestamps is over 0.5 s, or if the audio has fewer than 98% of the packets its length needs (length x sample rate / 1024). Speech pauses are encoded as packets and leave no gap, so they do not trigger it.
- Long-form is untouched.
- `scripts/diagnose-run-duration.ts`: `--frame-table` replays the old (one graph) and new (two graphs) command with `--repeat N` and prints video frame gaps and audio packets per render; `--audio-guard-recent N` runs the guard on the newest finished files.

## Evidence for the fix (production host, free replay into a temporary directory, three repeats)

### Honey stock Short (`e8df00af`, attempt 3)

| Render | Frames | First..last (s) | Min gap ms | Max gap ms | Repeated | Missing | Audio packets (needs) | Largest audio gap | Guard |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| picture fed to the mux | 1107 | 0.000..36.867 | 33.33 | 33.33 | 0 | 0 | | | |
| saved final file | 1121 | 0.000..37.333 | 33.33 | 33.33 | 0 | 0 | 1200 (1752) | 2.99 s | FAIL |
| current command, one graph #1 | 1121 | 0.000..37.333 | 33.33 | 33.33 | 0 | 0 | 1182 (1752) | 3.17 s | FAIL |
| current command, one graph #2 | 1123 | 0.000..37.400 | 33.33 | 33.33 | 0 | 0 | 1183 (1755) | 3.18 s | FAIL |
| current command, one graph #3 | 1122 | 0.000..37.367 | 33.33 | 33.33 | 0 | 0 | 1189 (1754) | 3.17 s | FAIL |
| **new command, two graphs #1** | 1122 | 0.000..37.367 | 33.33 | 33.33 | 0 | 0 | **1752 (1753)** | **0.07 s** | pass |
| **new command, two graphs #2** | 1122 | 0.000..37.367 | 33.33 | 33.33 | 0 | 0 | **1752 (1753)** | **0.07 s** | pass |
| **new command, two graphs #3** | 1122 | 0.000..37.367 | 33.33 | 33.33 | 0 | 0 | **1752 (1753)** | **0.07 s** | pass |

The constant 33.33 ms frame clock from #139 holds in every row (min gap = max gap = 33.33 ms, nothing repeated or missing). The video length is the full 37.37 s (voice 36.64 s + 0.70 s tail). The one-graph command gives a different frame count from run to run (1121 to 1123); the two-graph command gives 1122 each time.

### AI-images Short (`63be93e4`, attempt 1): unchanged

All six replays (one graph x3, two graphs x3) match the saved file: 1239 frames, 0.000..41.267 s, min and max gap 33.33 ms, nothing repeated or missing, audio 1936 packets (needs 1936), largest gap 0.06 s, guard pass.

## Guard proof on the saved files (production)

The guard (`--audio-guard-recent 8`, same function the pipeline calls) on the newest eight finished files:

| File | Source | Result | Reason printed |
| --- | --- | --- | --- |
| `e8df00af/3.mp4` | stock | FAIL | audio has a hole of 3.0s at 13.9s: part of the voiceover is missing from the file |
| `e8df00af/2.mp4` | stock | FAIL | hole of 3.0s at 9.5s |
| `e8df00af/1.mp4` | stock | FAIL | hole of 3.1s at 7.7s |
| `63be93e4/1.mp4` | AI stills | pass | |
| `f596f80c/2.mp4` | stock | FAIL | hole of 3.0s at 30.2s |
| `f596f80c/1.mp4` | stock | FAIL | hole of 3.0s at 16.1s |
| `67b248b0/1.mp4` | AI stills | pass | |
| `2fc078d6/1.mp4` | AI stills | pass (1736 of 1739 packets) | |

Every broken file fails with the reason; every clean file, including the AI-images Short, passes. Unit tests cover a 3 s hole, the largest healthy gap, missing packets without one large hole, and no audio. A media test builds a real file with a 3 s packet-timestamp hole (`setts` bitstream filter) and checks the guard reports it and passes the same file without the hole.

## Checks

Local, on the final code (one commit on current `main` c6022d3), the full vitest run alone on this machine:

- tsc: clean (no errors). eslint (whole `studio` tree plus the diagnostic script): clean.
- vitest, full run: 206 files: 193 passed, 13 skipped, 0 failed. 1931 tests: 1852 passed, 79 skipped, 0 failed.
- An earlier full run on the previous commit had one failure: `audio-guards.media.test.ts` (my new media test) timed out at vitest's 5 s default under load, 5039 ms. It passed alone in 2.4 to 2.9 s. The test now has an explicit 30 s limit.
- The changed-area tests (`audio-guards`, `audio-guards.media`, `shorts-command`) pass alone.
- CI does **not** run the studio's vitest (it runs the studio typecheck, lint and build, and the app's typecheck, lint and tests), so the vitest counts above are local only. CI result for the PR head is in the PR.

## Not done

- Not merged, not deployed, no paid run. The regenerated Short needs one more regeneration after deploy to confirm on the phone; that is a paid TTS run and is the founder's call.
- What the phone player did with the holed file (speech in about 25 s) is consistent with the holes but was not reproduced here. After this fix the file has no holes; whether the pace is then normal on the phone is unconfirmed until that regeneration.
- Follow-up rows kept from earlier: no ffmpeg pin now; long-form final-length guard needs real-run data and a tolerance that scales with length.
- After merge: sweep of other ffmpeg commands that put video and audio in one `-filter_complex` (long-form join, music mix, previews), reported, nothing fixed without a verdict.
