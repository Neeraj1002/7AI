# Sprint 3 Task 13: Stage-Artifact Capture to R2 (Per-Attempt Debug Bundle) + PR #45 Deploy Verification

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git
Workflow, the `STATUS.md` update this task must make, and the section structure this file follows.

**Note on why this is a Sprint 3 task, not Sprint 4**: same reasoning as Tasks 8–12. This is a direct
follow-on to Task 12 (PR #45), on its own branch, filed as a seventh Sprint 3 reopen.

**Objective**: Task 12 made the *finished* video of every attempt reviewable outside the VPS. That's
enough to say what's wrong with a video, but not enough to say **which stage caused it**. A quality
review (2026-09-28, external architect session) could only trace problems to a stage by also having the
raw voiceover, the caption file, the production plan and the source visuals for the same attempt. On the
VPS those files either sit in temp folders with no link back to the run, or exist only inside a stage's
DB output. This task uploads a complete, self-describing **debug bundle** for every `video_generation`
attempt next to the draft video Task 12 already uploads. It also closes out Task 12 by verifying PR #45
is actually live on the preview VPS.

**Duration**: R1 ~0.5–1h (mostly founder action + checks), R2 ~1.5–2h, R3 ~2–2.5h, R4 ~1.5h, R5
(optional) ~0.5h. ~6–7h core.

**Depends On**: Task 12 / PR #45 merged to `main` (the founder is merging it now). Don't start R2+ on a
branch cut from a `main` that doesn't yet contain `studio/src/storage/r2-client.ts`.

**Owning Component**: Video Generation (`studio/src/agents/video-generation/index.ts`), Orchestrator
(`studio/src/run-pipeline/state-machine.ts`), `studio/src/storage/`, `studio/src/api/routers/runs.ts`,
Infra (VPS env).

**Success Criteria**: (1) A real preview-VPS run produces objects under `videos/production/...` in the
`7ai-preview` bucket. (2) Every completed `video_generation` attempt, real or stub, gets a debug bundle
in R2 containing the raw TTS audio, the word-level transcript, the SRT, the production plan, the visual
source(s), the exact FFmpeg command, and a `manifest.json` describing all of it. (3) A single API call
returns presigned URLs for every file in a run attempt's bundle. (4) None of this can block, slow or fail
the pipeline. Same best-effort posture as Task 12.

---

## Verified findings (2026-10-06, read from `D:\Study Material\7AI\studio` with PR #45's code present locally; re-verify before rework, don't re-litigate)

**What exists after an attempt today, and where it goes:**

| Artifact | Produced at | Where it lives today | Linked to the run? |
|---|---|---|---|
| Final draft video | `generateVideo` → `DATA_DIR/videos/<runId>/<attempt>.mp4` | local + R2 (`r2DraftKey`, Task 12) | Yes |
| SRT captions | `index.ts` ~L402, `DATA_DIR/videos/<runId>/<attempt>.srt` (only when `captionsEnabled`) | local only | Only by path convention |
| Raw TTS audio | `synthesizeSpeech` (index.ts ~L381) → `DATA_DIR/media-tmp/<uuid>.mp3` | local temp, **never deleted, never recorded** | **No** — `tts.audioPath` is not returned from `generateVideo` |
| Word-level transcript (`asr.segments`) | `transcribe` (~L382) | **in memory only, discarded** | **No** |
| Production plan | `plan.ts` LLM step | `pipeline_stages.output.plan` (DB) | Yes, DB only |
| Stock clip | `searchStockFootage` (~L437) → `DATA_DIR/stock-footage-tmp/<uuid>.mp4` | local temp, never deleted | Only `sourceId`/query in `UsageEvent.metadata` |
| AI stills | `generateStills` (~L421) → `ai-visuals-tmp/<uuid>.png` | local temp, never deleted | **No** — `stills.imagePaths` not returned |
| Ken-Burns stills video | `buildKenBurnsVideo` → `videos/<runId>/<attempt>-stills.mp4` | local only | Only by path convention |
| FFmpeg args | built inline (~L490), executed, discarded | **nowhere** | **No** |
| Audio bed track | `pickAudioBedTrack` → checked-in `data/audio-beds/` file | repo | Only `audioLayer` mood tag |

So the root cause is in `generateVideo`: it returns `{ videoPath, durationSeconds, aspectRatio, plan }`
and drops every intermediate path and the transcript. The orchestrator can't upload what it was never
handed.

**Task 12's draft upload** is at `state-machine.ts` ~L952–972 (`runVideoGenerationStage`), after the
completing `prisma.$transaction`, wrapped in its own `try/catch`, skipped when `!isR2Configured()`. Key:
`videos/${env.NODE_ENV}/drafts/${run.tenantId}/${runId}/${attemptNumber}.mp4`, recorded via
`patchStageOutput(stage.id, { r2DraftKey, r2DraftUploadedAt })`. This task extends exactly that block.
It does not add a second integration point.

**`uploadToR2({ key, filePath, contentType })`** is the only upload primitive (`storage/r2-client.ts`).
It reads a file from disk. Generated content that isn't a file yet (transcript, plan, manifest, FFmpeg
args) gets written to a JSON file in the attempt's own output dir first, then uploaded the same way. No
new upload primitive is needed.

**Stub mode matters for reviewers.** On a checkout with `MEDIA_STUB`/`STOCK_FOOTAGE_STUB`/
`AI_VISUALS_STUB=1`, the "voiceover" is a 440 Hz sine tone, the stock clip is FFmpeg's colour-bar test
pattern, and AI stills are 14-byte `fake png bytes` text files (all confirmed by direct inspection on
2026-09-28). A reviewer who gets a stub bundle without knowing it will misdiagnose it, so the manifest
must state stub flags explicitly (R2).

**Observed in R2 (founder screenshot, 2026-10-06)**: the only objects are under `videos/test/...` for
tenant `00000000-0000-0000-0000-000000000001`, dated 28 Sep, which matches Task 12's own live-verification
runs. Nothing under `videos/production/`, although the founder has published 15 videos from the preview
VPS. That's consistent with PR #45 not yet being deployed and/or `R2_*` not set in the VPS's `studio/.env`.
`isR2Configured()` skips silently in that case, so nothing would have surfaced it. R1 closes this.

---

## Founder decisions already made — don't reopen

- Same bucket (`7ai-preview`), same `NODE_ENV` namespacing, same best-effort/never-block posture as
  Task 12.
- **No backfill** of the 15 already-published videos. The founder will share those directly from YouTube.
- Bundles are for review/fine-tuning, not a pipeline dependency. Local filesystem stays the source of
  truth for the pipeline itself, exactly as Task 12 established.

---

### R1 (Role: `BE` + **Founder**) — Verify PR #45 is live on the preview VPS

**Fix / checks** (no code unless a check fails):
1. Founder merges PR #45. Confirm the GitHub Actions deploy ran and `deploy.sh` completed (`pm2 logs
   sevenai`, look for a clean `[boot]` line after the deploy time).
2. On the VPS, confirm (key **names only**, never print values) that `studio/.env` contains
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` (and optionally
   `R2_REGION`): `grep -o '^R2_[A-Z_]*' /var/www/7AI/studio/.env`.
3. Confirm `NODE_ENV=production` on the VPS process, so keys land under `videos/production/`.
4. Add one **loud, once-per-boot** log line in production when `!isR2Configured()` (e.g. `[boot] R2 not
   configured — drafts/final/bundles will NOT be uploaded`). Today's silent skip is right for local dev,
   but it is how 15 production videos went unrecorded without anyone noticing. A log line only; don't
   fail boot.
5. Drive one real run on the VPS through `video_generation`.

**Verify**: an object exists at `videos/production/drafts/<tenantId>/<runId>/1.mp4` in the R2 dashboard,
and `runs.getVideoUrl` returns `{ available: true }` for that run. If not, record exactly which check
failed in the report.

---

### R2 (Role: `BE`) — `generateVideo` returns an artifact manifest instead of dropping intermediates

**Fix**:
1. Extend `VideoGenerationResult` with an `artifacts` object (not part of the persisted
   `VideoGenerationOutputSchema`; it's returned alongside `output`/`usage`):
   ```ts
   type VideoArtifacts = {
     ttsAudioPath: string;                 // tts.audioPath
     transcriptJsonPath: string;           // NEW: asr.segments + audioDurationSeconds, written to <outputDir>/<attempt>.transcript.json
     srtPath?: string;                     // only when captionsEnabled
     planJsonPath: string;                 // NEW: plan written to <outputDir>/<attempt>.plan.json
     stockClipPath?: string;               // stock path
     stillImagePaths?: string[];           // ai-stills path
     stillsVideoPath?: string;             // ai-stills path (<attempt>-stills.mp4)
     audioBedPath?: string;                // checked-in track path, when audioLayer !== 'none'
     ffmpegArgsJsonPath: string;           // NEW: the exact ffmpegArgs array + filterComplex, written before execFile runs
     stubFlags: { media: boolean; stockFootage: boolean; aiVisuals: boolean }; // from env.*_STUB
   };
   ```
2. Write the three new JSON files **before** the final FFmpeg call, so they exist for debugging even if
   FFmpeg itself throws. (A failed attempt's bundle is out of scope for upload here, see Known Issues,
   but having the files on disk already helps local debugging.)
3. Don't change any existing behavior, output path, or the persisted `output` shape. `videoPath`,
   `plan`, etc. stay exactly as they are. Update `index.test.ts` if it asserts on the result shape.

**Verify**: a stub dry run (`npx tsx scripts/dry-run.ts`) returns an `artifacts` object in which every
path exists on disk, and the transcript JSON contains real word segments (stub-timed is fine).

---

### R3 (Role: `BE`) — Upload the bundle next to Task 12's draft video

**Fix**:
1. In `runVideoGenerationStage`, inside Task 12's existing post-transaction `if (isR2Configured())` block,
   after the draft `.mp4` upload, upload every artifact under a **sibling prefix**:
   `videos/${NODE_ENV}/drafts/${tenantId}/${runId}/${attemptNumber}/`
   - `voiceover.mp3` (`audio/mpeg`)
   - `transcript.json`, `plan.json`, `ffmpeg-args.json` (`application/json`)
   - `captions.srt` (`application/x-subrip`), when present
   - `stock-clip.mp4` / `stills-video.mp4` (`video/mp4`), `still-<i>.png` (`image/png`), when present
   - `audio-bed.<ext>`, when present. It's a small repo file, but uploading it keeps the bundle
     self-contained for a reviewer with no repo access.
   - `script.txt` (`text/plain`), the `sanctionedScriptText` actually spoken, already in scope in
     `runVideoGenerationStage`
   - `manifest.json`, uploaded **last**. It lists every key actually uploaded, its content type and byte
     size, `runId`, `attemptNumber`, `channelId`, `stubFlags`, `ttsModel`/`voice`,
     `transcriptionModel`, `visualSource`, `captionStyle`, `audioLayer`, and `createdAt`. Uploading it last
     means a manifest's presence implies the bundle is complete.
2. Keep the existing `<attemptNumber>.mp4` draft key **unchanged**, so Task 12's `r2DraftKey` and
   `getVideoUrl` keep working. The bundle is additive.
3. Upload artifacts independently: one failing artifact logs and continues; it doesn't abort the rest.
   The manifest records only what actually succeeded.
4. On completion, `patchStageOutput(stage.id, { r2BundlePrefix, r2ManifestKey, r2BundleUploadedAt })`.
5. Bound the extra cost: upload with modest concurrency (e.g. 4 at a time). Total bundle size per attempt
   is roughly 5–25 MB (dominated by the stock clip), fine for single `PutObject` calls.

**Verify**: a real run on a checkout with R2 configured produces a complete bundle (check in the R2
dashboard). `manifest.json` lists every object. Download `voiceover.mp3` and confirm it plays (or is the
known 440 Hz tone on a stub checkout, with `stubFlags.media: true` in the manifest). Separately, with
`R2_BUCKET` cleared, `video_generation` completes and advances to `video_review` exactly as before (same
"nothing else breaks" check Task 12 ran).

---

### R4 (Role: `BE`) — `runs.getAttemptBundle`: presigned URLs for a whole attempt

**Fix**:
1. New query `runs.getAttemptBundle({ runId, attemptNumber? })`, which defaults to the latest
   `video_generation` attempt that has an `r2ManifestKey`. Reuse `runs.get`/`getVideoUrl`'s existing
   tenant-scoping pattern exactly.
2. Reads the manifest from R2 (one `GetObject`; add a small `getObjectText(key)` to `r2-client.ts`,
   still the only file touching the SDK), mints a fresh 24h presigned URL for each listed key, and
   returns `{ available: true, attemptNumber, manifest, files: [{ name, contentType, bytes, url }],
   expiresAt }`. If absent or R2 is unconfigured, return `{ available: false }`.
3. Report states the exact `curl` + auth shape, same as Task 12/R5, so the founder can hand a whole
   bundle to another session in one step.

**Verify**: for R3's verified run, every URL returned downloads with a plain `curl` (no session), and
byte sizes match the manifest. A run with no bundle returns `{ available: false }`.

---

### R5 (Role: `BE`, optional) — `hasR2Bundle` on `runs.get`

Same shape as Task 12/R6: a plain boolean existence check, no URL minting. Build only if time remains;
say so in the report either way.

---

## Schema Impact

No schema changes. New fields `r2BundlePrefix`/`r2ManifestKey`/`r2BundleUploadedAt` live inside the
existing `video_generation` stage `output` JSON, same convention as Task 12's `r2DraftKey`.

## Business Logic / State Transition

No new control flow. R3's uploads are a pure side effect after the existing, unchanged
`video_generation → video_review` transition, inside Task 12's existing best-effort block. R4/R5 are
read-only.

### Failure Modes & Handling
- R2 down / any single artifact upload fails → logged, remaining artifacts still attempted, manifest
  reflects reality, pipeline unaffected.
- `generateVideo` throws mid-way → no bundle upload (unchanged from Task 12: drafts only exist for
  completed attempts). See Known Issues.
- Process killed mid-upload → partial bundle without a manifest. "No manifest" means incomplete, and R4
  treats it as `{ available: false }`.

## Implementation

### Files to Modify
- `studio/src/agents/video-generation/index.ts` — R2 (artifacts object + 3 JSON files)
- `studio/src/run-pipeline/state-machine.ts` — R3 (extend Task 12's draft-upload block)
- `studio/src/storage/r2-client.ts` — R4 (`getObjectText`)
- `studio/src/api/routers/runs.ts` — R4/R5
- Boot path (`studio/src/index.ts` or wherever env is first validated) — R1 step 4 log line

## Testing

```bash
npm run build && npm run lint && npm run typecheck
npx vitest run
npx tsx scripts/dry-run.ts   # stub run: artifacts object present, files exist
```

Plus each item's Verify section. As in Task 12, R3/R4 need a real round trip against the real
`7ai-preview` bucket, with test runs clearly identifiable and cleaned up afterward if they're throwaway.

## Report Template

Generate at `docs/execution/sprint3/reports/task13.md`, same shape as `reports/task12.md`. State plainly:
(1) R1's outcome, i.e. whether production objects now appear and, if R1 found a problem, exactly what it
was; (2) a sample `manifest.json` from a real run; (3) the exact `curl` shape for `getAttemptBundle`;
(4) confirmation that an R2-unconfigured checkout still completes `video_generation` normally.

## Additional Notes

- Build order: R1 first (it can surface a deploy/env issue that would otherwise make R3's verification
  confusing), then R2 → R3 → R4 → R5.
- **External reviewer access (founder action, not code):** the external architect session runs in a
  sandbox whose org egress policy currently blocks `*.r2.cloudflarestorage.com` (confirmed 2026-10-06).
  For presigned URLs to be usable there directly, allow that domain in claude.ai Admin settings →
  Capabilities. Until then, the founder downloads a bundle into `D:\Study Material\7AI` for review.

## Known Issues / Future Improvements

- **Failed attempts get no bundle.** An attempt that throws inside `generateVideo` (e.g. an FFmpeg error)
  is often the most useful one to inspect. Uploading a partial bundle from the failure path
  (`failStageAndEscalate`) is a reasonable follow-on, deliberately out of scope here to keep this task's
  change to one integration point.
- **Temp-folder growth on the VPS.** `media-tmp/`, `stock-footage-tmp/` and `ai-visuals-tmp/` are never
  cleaned (hundreds of orphaned files observed locally). Once bundles reliably land in R2, deleting an
  attempt's temp inputs after a successful bundle upload becomes safe. Separate cleanup task, not this one.
- **No R2 lifecycle rule** (inherited from Task 12). Bundles add roughly 5–25 MB per attempt. A Cloudflare
  dashboard rule (e.g. expire `drafts/` after 30 days) is worth setting once volume grows.
- **Downstream review artifacts** (Video Intelligence's sampled frames and verdict, Gate 2 decision) are
  not in the bundle. They're produced after this upload point. Video review's verdict/rationale is already
  in the DB; adding them to the bundle can come later if reviewers need it.

## Links & References

- `docs/execution/sprint3/tasks/task12.md` / `reports/task12.md` (the R2 integration this extends)
- `docs/execution/templates/TASK_TEMPLATE.md`
- `docs/server/deployment/preview/detail.md` (VPS paths, `NODE_ENV`, deploy flow)

## Git Workflow

1. `git checkout main && git pull` from `D:\Study Material\7AI`. Confirm `studio/src/storage/r2-client.ts`
   exists on `main` (i.e. PR #45 merged) before continuing.
2. `git checkout -b MEDIAARTIFACTS_BE`. Record it in `docs/execution/sprint3/STATUS.md`'s new Task 13 row
   immediately.
3. One commit per item: `MEDIAARTIFACTS_TASK13_BE_R<X>: [what it does]`.
4. After the first pushed commit:
   `gh pr create --draft --title "MEDIAARTIFACTS_BE: Stage-Artifact Capture to R2 + PR #45 Deploy Verification" --body "Tracking PR for Task 13. Live status: docs/execution/sprint3/STATUS.md (Task 13). Do not merge until marked ready for review."`
5. After R4 (and R5, if built), write the report and the STATUS row, commit together, `gh pr ready`.
6. Never push or merge to `main` directly; never commit to a branch this task didn't create.
