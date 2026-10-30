# Stock-footage audio and video timing hotfix

**Date**: 2026-10-30 (IST)  
**Status**: Investigation in progress  
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

The final video/audio stream duration differences are 0.031 s and 0.003 s. Each final duration is about 0.70 s longer than its voice MP3, matching the designed end tail. The stock intermediates declare 30 fps but have packet durations of 0.032682, 0.033008 and 0.033333 s, so the joined files have slight frame-time variation; both final files include 0.066667 s video packet durations as well as 0.033333 s. Exact locations and audible effect are pending a frame/packet trace. FFprobe reported AAC `nb_frames` 1,094 and 962 for the two ~35 s finals; the meaning and timestamp continuity of these counts require packet-level confirmation before treating them as dropped audio.

Video Review recorded audio bitrate warnings of 129 and 115 kbps against the shared 160 kbps floor. It recorded 30 fps declared and average rates 29.886 and 29.858, both within the current gate's tolerance. The first attempt had eight detected shots; the second seven. Its loudness and true peak checks passed in both attempts.

## Code path confirmed before changes

`stock-shotlist.ts` calls FFprobe for each downloaded clip's duration, asks Pexels for at least the beat window duration, and compares `clipSeconds` against `windowEndSeconds - positionSeconds` in `planShotSegment`. It trims each clip, holding only the final clip's last frame if needed. It filters each clip with `fps=30` and encodes H.264, then joins segments with the concat demuxer and `-c copy`. It does not inspect each source's frame rate or timebase, nor does it use `setpts` to speed picture.

`generateVideo` calls `synthesizeSpeech(params.scriptText)` on every attempt, then transcribes that new MP3 and feeds it as FFmpeg input 1. The run pipeline obtains `scriptText` from the completed Gate 1 `sanctionedScriptText` on revise, not from a previous MP4. The two different preview MP3 paths independently confirm that revisions did not reuse the same source file. There is no `atempo` narration stretch. `withRetryAndCircuitBreaker` can call the generation again, but the audio bitrate setting remains `QUALITY_SPEC.audio.bitrateKbps`, with no retry-specific reduction.

The Shorts mux requests `-c:a aac -b:a 192k -ar 48000` and adds a 0.7 s audio tail. The shared quality check reads FFprobe's final AAC stream `bit_rate`, rounds it to kbps and warns below `QUALITY_SPEC.audio.minBitrateKbps = 160`. This warning is advisory, not a hard block. The output is genuinely below it despite the 192 kbps encoder request. A local no-cost control encoded a 7.3 s narration at requested 192/256/320 kbps and measured 173.8/217.1/210.2 kbps; that control does not establish which setting would pass on this run's narration.

## Diagnosis, changes and verification

Pending the preview file's frame/audio timestamp trace, the glitch timestamp, and a check of raw voice versus final audio. No render code has been changed yet.

## Same-cause sweep

Pending cause confirmation. The shared Shorts mux also processes AI-stills and the long-form path has separate picture joins and an AAC encode; each must be classified once the cause is known.
