# Stock-footage audio and video timing hotfix

**Date**: 2026-10-30 (IST)  
**Status**: PR ready; preview retest pending
**Branch**: `BUGS_STOCK_FOOTAGE_AV`  
**Worktree**: `D:\Study Material\7AI\.worktrees\BUGS_STOCK_FOOTAGE_AV`  
**Draft PR**: [#139](https://github.com/Neeraj1002/7AI/pull/139)  
**Task doc first commit**: `7325031`  
**Preview run**: `f596f80c-c804-4e20-ab0b-50cfae3bacd7` (founder-supplied terminal output)

## Evidence before render changes

The founder ran read-only SQL and FFprobe on the preview VPS and pasted the results. There are two completed `video_generation` and two completed `video_review` attempts. The data below is from those files, not a local approximation. The deployed commit and exact symptom timestamp remain to be confirmed.

| Attempt | File | Codec | Bitrate | Sample rate | Declared / average FPS | Timebase | Duration |
| --- | --- | --- | ---: | ---: | --- | --- | ---: |
| 1 | voice MP3 (`f612952d-…`) | MP3 | 128.0 kbps | 24 kHz | — | — | 34.464 s |
| 1 | `1-stock.mp4` | H.264 | 7,641.5 kbps | — | 30 / 29.9992 | 1/15360 | 34.665 s |
| 1 | `1.mp4` video | H.264 | 6,445.2 kbps | — | 30 / 29.8861 | 1/15360 | 35.133 s |
| 1 | `1.mp4` audio | AAC | 129.5 kbps | 48 kHz | — | 1/48000 | 35.164 s |
| 2 | voice MP3 (`b2ce15d8-…`) | MP3 | 128.0 kbps | 24 kHz | — | — | 34.536 s |
| 2 | `2-stock.mp4` | H.264 | 10,836.4 kbps | — | 30 / 29.9997 | 1/15360 | 34.732 s |
| 2 | `2.mp4` video | H.264 | 8,294.5 kbps | — | 30 / 29.8581 | 1/15360 | 35.233 s |
| 2 | `2.mp4` audio | AAC | 114.9 kbps | 48 kHz | — | 1/48000 | 35.236 s |

The final video/audio stream duration differences are 0.031 s and 0.003 s. Each final duration is about 0.70 s longer than its voice MP3, matching the designed end tail. The stock intermediates declare 30 fps but have packet durations of 0.032682, 0.033008 and 0.033333 s, so the joined files have slight frame-time variation; both final files include 0.066667 s video packet durations as well as 0.033333 s. A frame-timestamp trace found no gap over 0.05 s in either stock intermediate. The final videos each have isolated 0.067 s gaps at 3.833, 16.233, 20.833 and 30.500 s (attempt 1), and 4.200, 8.633, 12.833, 21.567 and 30.100 s (attempt 2). These isolated single-frame gaps do not by themselves establish the reported several-second speed-up. FFprobe reported AAC `nb_frames` 1,094 and 962 for the two ~35 s finals; the meaning and timestamp continuity of these counts require packet-level confirmation before treating them as dropped audio.

Video Review recorded audio bitrate warnings of 129 and 115 kbps against the shared 160 kbps floor. It recorded 30 fps declared and average rates 29.886 and 29.858, both within the current gate's tolerance. The first attempt had eight detected shots; the second seven. Its loudness and true peak checks passed in both attempts.

## Code path confirmed before changes

`stock-shotlist.ts` calls FFprobe for each downloaded clip's duration, asks Pexels for at least the beat window duration, and compares `clipSeconds` against `windowEndSeconds - positionSeconds` in `planShotSegment`. It trims each clip, holding only the final clip's last frame if needed. It filters each clip with `fps=30` and encodes H.264, then joins segments with the concat demuxer and `-c copy`. It does not inspect each source's frame rate or timebase, nor does it use `setpts` to speed picture.

`generateVideo` calls `synthesizeSpeech(params.scriptText)` on every attempt, then transcribes that new MP3 and feeds it as FFmpeg input 1. The run pipeline obtains `scriptText` from the completed Gate 1 `sanctionedScriptText` on revise, not from a previous MP4. The two different preview MP3 paths independently confirm that revisions did not reuse the same source file. There is no `atempo` narration stretch. `withRetryAndCircuitBreaker` can call the generation again, but the audio bitrate setting remains `QUALITY_SPEC.audio.bitrateKbps`, with no retry-specific reduction.

The Shorts mux requests `-c:a aac -b:a 192k -ar 48000` and adds a 0.7 s audio tail. The shared quality check reads FFprobe's final AAC stream `bit_rate`, rounds it to kbps and warns below `QUALITY_SPEC.audio.minBitrateKbps = 160`. This warning is advisory, not a hard block. The output is genuinely below it despite the 192 kbps encoder request. A local no-cost control encoded a 7.3 s narration at requested 192/256/320 kbps and measured 173.8/217.1/210.2 kbps; that control does not establish which setting would pass on this run's narration.

## Diagnosis, changes and verification

The preview trace establishes slight stock frame-time variation and four or five isolated one-frame gaps in each final. It does **not** establish a multi-second file timestamp jump or whether the audible slur is already in the source voice. The unusually low AAC frame counts suggest missing audio time, but packet timestamps were not available, so this remains a hypothesis. The shared encoder already requested 192 kbps on both attempts; no retry lowered it.

To remove the demonstrated timing variation, every stock segment now gets `fps=30,setpts=N/(30*TB)`, an explicit CFR output mode, and the shared `1/15360` track timebase before concat. The final Shorts mux also assigns consecutive frame timestamps and CFR mode after decoding the joined source. The shared AAC request is raised from 192 to 320 kbps; this is content independent and applies to every Shorts visual source and long-form mastering. The original narration remains the mux input on each attempt, without `atempo` or another time-stretch filter.

No-cost local verification: a mixed 24/29.97/60 fps stock fixture, including a clip starting at a nonzero timestamp, joined at declared/average 30 fps with timebase `1/15360` and no frame gap over 0.034 s. The local stock intermediate had only 0.033333 s video packet durations. The stock and AI-stills Shorts integration renders each probed at exactly 30 fps and `1/15360`, with matching 7.300 s audio/video durations, no frame gap over 0.05 s, and AAC 48 kHz at 210,977 bps. The stock fixture video was still about 7.16 Mbps; the preview's 6.4–8.3 Mbps video streams and potential player buffering have not been ruled out as a separate cause of the reported fast-forward. A local two-attempt stock revision test confirmed distinct fresh MP3 paths, no reference to the prior final MP4, and `320k` in both mux commands. Tests use provider stubs; no LLM/API spend occurred. Build, lint and typecheck passed after generating the local Prisma client.

Preview budget, founder estimate, one same-brief live run, packet probes and audible/visual comparison remain pending. These are required before claiming the reported experience is fixed.

CI: the first PR run's studio job passed, but the app job stopped at `npm ci` because its existing lockfile lacked two transitive `@emnapi` peer packages. Adding those exact dev dependencies and their lock entries made a Linux `npm ci --dry-run` pass. Subsequent PR runs passed both jobs, including GitHub Actions run `41209385623` on commit `b2a0460`. Afterward, `git fetch origin` and `git pull origin main` reported the branch already up to date; the docs scope diff lists only this task doc and report, with no conflicts. PR #139 was marked ready after CI passed; preview playback verification is still a post-merge founder retest.

## Same-cause sweep

- **Fixed here**: AI-stills Shorts use the same final mux, so their final frame clock and AAC target receive the same change. Long-form final audio mastering reads the same `QUALITY_SPEC.audio.bitrateKbps` value, so it also uses 320 kbps.
- **Left alone**: long-form picture joins start with fixed-count `zoompan` frames from still images, encode with explicit `-r`, and have no variable-fps stock source. The separate 96 kbps long-form *preview* encode and 64/128 kbps intermediate MP3 narration are not final AAC quality checks. Test fixture encodes with `192k` are independent source files, not production mux settings.
- **No matching cause found**: `app/` contains no video `setpts`, audio `atempo`, or duplicated AAC target. The player and HTTP Range delivery may need a separate task if the preview retest still shows a seconds-long catch-up while the downloaded MP4 plays normally.
