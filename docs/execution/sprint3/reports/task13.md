# Sprint 3 Task 13 Report: Stage-Artifact Capture to R2 + PR #45 Deploy Verification

Branch `MEDIAARTIFACTS_BE`, draft PR [#47](https://github.com/Neeraj1002/7AI/pull/47).
Build/typecheck/lint clean, `vitest` 108/108.

## Outcome per item

| Item | State |
|---|---|
| R1 | Code done (production-only boot warning in `studio/src/index.ts`). **VPS checks 1-3 and 5 are founder actions, not performed**, so whether production objects now appear is **unknown** |
| R2 | Done. `generateVideo` returns `artifacts`; transcript/plan/ffmpeg-args JSON written before the FFmpeg call. Stub run verified for both `stock-footage` and `ai-stills`: every path exists, transcript has 11 word segments |
| R3 | Done (`storage/attempt-bundle.ts`, wired into the Task 12 block in `runVideoGenerationStage`). Live-verified through a real stage run (below) |
| R4 | Done (`runs.getAttemptBundle`, `getObjectText`). Live-verified as a real procedure call against a real run |
| R5 | Done (`hasR2Bundle` on `runs.get`), verified true/false |

## Pipeline-level verification (2026-10-06, stub mode, real R2 bucket, real Postgres)

Dev tenant `…0001` `agent_quotas.budgetCeilingUsd` was **$2 originally**, raised to **$10** for this
verification (founder-approved), and **restored to $2** afterwards. Both throwaway runs used the active
dev channel `8bbd0504…`, were driven through a scratch script (not `resumeOnStartup`), and were set to
`failed` afterwards so they can't be resumed. R2 test objects were deleted.

- **R2 configured** (run `956547d1…`): `runVideoGenerationStage` advanced to `video_review`. The stage
  output in Postgres held `r2DraftKey`, `r2BundlePrefix`
  (`videos/development/drafts/<tenant>/<run>/1/`), `r2ManifestKey` and `r2BundleUploadedAt`.
  `runs.getAttemptBundle` (real procedure call via `appRouter.createCaller`) returned 8 files
  (voiceover, transcript, plan, ffmpeg-args, script, captions.srt, stock-clip.mp4, audio-bed.mp3); every
  URL returned 200 with bytes matching the manifest; `hasR2Bundle` was `true`.
- **R2 unconfigured** (`R2_BUCKET` cleared, run `0552a595…`): `video_generation` completed and the run
  advanced to `video_review` exactly as before; stage output has no R2 keys; `getAttemptBundle` returned
  `{ available: false }`, `hasR2Bundle` `false`.

## Still open (founder)

R1's VPS checks: deploy ran, `grep -o '^R2_[A-Z_]*' studio/.env`, `NODE_ENV=production`, one real run.
Whether production objects now appear is unknown until then.

## Real-bucket round trip (stub checkout, throwaway prefix `videos/development/task13-test/`, deleted afterwards)

`generateVideo` (ai-stills, stub flags all true) -> `uploadAttemptBundle` -> `getObjectText(manifest)` ->
presigned URL per file -> plain `fetch` with no credentials: all 9 files returned 200 and byte sizes
matched the manifest. Sample manifest (trimmed):

```json
{
  "runId": "task13-live", "attemptNumber": 1, "channelId": "chan",
  "ttsModel": "m", "voice": null, "transcriptionModel": "t",
  "visualSource": "ai-stills", "captionStyle": "phrase-grouped", "audioLayer": "none",
  "stubFlags": { "media": true, "stockFootage": true, "aiVisuals": true },
  "createdAt": "2026-10-06T00:16:50.900Z",
  "files": [
    { "name": "voiceover.mp3", "key": "videos/development/task13-test/live/1/voiceover.mp3", "contentType": "audio/mpeg", "bytes": 21332 },
    { "name": "transcript.json", "...": "...", "bytes": 517 },
    "... plan.json, ffmpeg-args.json, script.txt, captions.srt, stills-video.mp4, still-0.png, still-1.png"
  ]
}
```

## `getAttemptBundle` call shape

tRPC query, same auth as `runs.getVideoUrl` (the app's session bearer token; replace host/path to match
your tRPC mount):

```bash
curl -G "https://7aistudio.tech/trpc/runs.getAttemptBundle" \
  -H "Authorization: Bearer <session token>" \
  --data-urlencode 'input={"runId":"<runId>","attemptNumber":1}'
```

Returns `{ available: true, attemptNumber, manifest, files: [{ name, contentType, bytes, url }], expiresAt }`
(fresh 24h URLs; each `url` downloads with plain `curl -o <name> "<url>"`), or `{ available: false }`.
`attemptNumber` optional (defaults to latest attempt with a manifest).

## Notes

- Retries: the bundle is built from the artifacts of the attempt that actually succeeded.
- Behaviour unchanged: draft `.mp4` key, `r2DraftKey`, persisted output shape.
