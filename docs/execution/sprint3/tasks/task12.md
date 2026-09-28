# Sprint 3 Task 12: Generated Media Storage — Cloudflare R2 Integration

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git
Workflow, the `STATUS.md` update this task must make, and the section structure this file follows.

**Note on why this is a Sprint 3 task, not Sprint 4**: same reasoning as Tasks 8–11 — Sprint 4
(`docs/execution/sprint4/`) is a separate, larger, unrelated initiative (channel profiles/formats).
This is real infra work the founder needs now that testing has moved to the preview environment, filed
as a sixth Sprint 3 reopen on its own branch, same posture as Tasks 8–11.

**Objective**: every generated video currently lives only on the machine that rendered it (local
filesystem, `data/videos/<runId>/<attemptNumber>.mp4`) — nothing outside that machine's own device/SSH
access can see it. The founder has real R2 credentials configured (both `studio/.env.local` locally
and `studio/.env` on the preview VPS, one shared bucket, `7ai-preview`) and two distinct real needs:
(1) every generation attempt uploaded somewhere reviewable, so a video (and the agents that produced
it — Script Generation, Video Generation, the review agents) can be fine-tuned by another Claude
session that has no device/SSH access to the VPS, before/alongside the normal gate flow; (2) the one
video that actually ships kept as a durable, unambiguous final copy once publishing genuinely succeeds.
This task builds both, plus folds the channel watermark asset into the same R2 integration (previously
local-filesystem-only, per Task 9's own residual note).

---

## Founder decision this revision encodes (2026-09-28)

**Two-tier storage, not one flat upload-every-attempt scheme** — the founder's own proposal, confirmed
correct and refined by one point: "final" is anchored to the `publishing` stage's own real upload
succeeding, not to the Gate 2 approval decision itself. In practice these are the same moment today
(Task 11/R1 made a Gate 2 approval flow straight into `publishing` with no restart), but they aren't the
same thing — an approval can still be followed by a real publish failure (YouTube auth, a transient
network error escalated to `needs_attention`), and "final" should mean "this is what actually shipped,"
not "this is what a human said yes to." Anchoring to the publish stage's own success also reuses the
exact isolation point already verified in this codebase (the cover-frame/thumbnail-set step in
`runPublishingStage`, cited below) rather than adding a new hook into gate-decision logic.

- **`drafts/`** — every completed `video_generation` attempt, uploaded best-effort right after that
  stage completes (as originally scoped). This is the fine-tuning surface: every take, including ones a
  human later rejects or that get superseded by a regen, stays reviewable.
- **`final/`** — the one video that was actually uploaded to YouTube for a given run, uploaded
  best-effort right after `runPublishingStage`'s own upload call succeeds. One object per run (not per
  attempt) — a run only ever has one real "the one that shipped."

---

## Verified findings (2026-09-28 — confirmed by reading the actual code on `D:\Study Material\7AI\studio`,
not assumed; per the founder's standing rule, re-verify before rework, don't re-litigate what's below)

**No R2/object-storage code exists anywhere in this codebase today.** Confirmed by reading
`studio/package.json` in full: no `@aws-sdk/*` package, no `aws-sdk`, no other S3-compatible client of
any kind among either `dependencies` or `devDependencies`. A repo-wide check for a `storage/` module
(the natural place, mirroring `llm/`, `media/`, `stock-footage/`, `agents/publishing/`'s own
provider-boundary convention) also found nothing. **Re-confirmed again at the start of this revision's
implementation (2026-09-28)**: a prior commit's message on `main` (`1e9c47c`) claimed to have
"Implemented R2 client module... Integrated R2 upload... Added endpoint for generating presigned
URLs..." — its actual diff was checked directly and contains **none of that**: only this task doc, a
`STATUS.md` update, deployment docs, and the unrelated `youtube-oauth.ts` env-loading fix. No
`src/storage/`, no `@aws-sdk/*` dependency, no `R2_*` in `env.ts`, no `r2Draft`/`r2Final` fields, no
`getVideoUrl` exist on `main` as of this revision starting. Stated here so a future reader doesn't trust
that commit message over the actual code.

**R2 credentials already exist in both env files** — confirmed by reading the key names only (not
values) out of the founder's own `studio/.env.local`: `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, `R2_BUCKET`,
`R2_ENDPOINT`, `R2_REGION`, `R2_SECRET_ACCESS_KEY`, `R2_TOKEN_VALUE`. None of these are read anywhere
in code — `studio/src/config/env.ts`'s `EnvSchema` (a plain `zod` object, which silently strips any
key not declared in the schema) has no `R2_*` fields at all. `studio/.env.example` also has no `R2_*`
entries yet — this task adds them.

**`R2_TOKEN_VALUE` is confirmed NOT needed for this task** — per the founder directly: it's a credential
for R2's separate native API, not the S3-compatible API this task's SDK choice (`@aws-sdk/client-s3`)
uses. R1 below wires only the five S3-compatible fields (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/
`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`/`R2_ENDPOINT`/`R2_REGION`) — no open question left for the
implementing agent on this point.

**One shared bucket (`7ai-preview`) for everything** — confirmed by the founder's own statement.
Because the same bucket name is configured in both the local `.env.local` and the preview VPS's `.env`,
object keys are namespaced by `NODE_ENV` throughout this task specifically so a local throwaway test run
can never land in the same key space as a real preview upload — a deliberate decision, not an oversight,
in addition to (not instead of) the `drafts/`/`final/` split above.

**The `drafts/` integration point, confirmed by direct read of `state-machine.ts`'s
`runVideoGenerationStage`** (lines 744–952): `generateVideo()` (called at line 903,
`studio/src/agents/video-generation/index.ts`) writes the real .mp4 to
`DATA_DIR/videos/<pipelineRunId>/<attemptNumber>.mp4` and returns
`{ videoPath, durationSeconds, aspectRatio, plan }`. That output is persisted at line 946:
`await completeStage(stage.id, { ...output, plan }, tx);` inside a `prisma.$transaction` that also
advances `currentStage` to `'video_review'` (line 947). This transaction must stay exactly as fast and
reliable as it is today — an R2 upload (a real network call, seconds at minimum) must never sit inside
it or block it.

**The `final/` integration point, confirmed by direct read of `runPublishingStage`** (same file, lines
~1341–1490): `uploadVideo({ channelId, videoPath, metadata, privacyStatus, containsSyntheticMedia })`
(line 1430–1432, via `withRetryAndCircuitBreaker`) is the real YouTube upload; `videoPath` is already a
resolved local variable in scope at that point (confirmed via the `stageInput = { videoPath, ... }`
assignment at line 1385 — the same file the video was written to in `video_generation`, never
re-derived). Immediately after `uploadResult` is obtained (upload genuinely succeeded), the existing
cover-frame/thumbnail-set step (lines 1434–1463) is a real, live precedent for "a further best-effort
external call, wrapped in its own `try/catch`, that must never fail the stage or imply the upload itself
failed." This task's `final/` upload goes in that same spot, same shape, as a second best-effort step
alongside (not replacing) the cover-frame one.

**No existing repository function updates a stage's `output` JSON after it's already `completed`/mid
-checkpoint** — `recordStageProgress` (used by `runPublishingStage`, line 1475) writes a checkpoint
while a stage is still `'running'`, before `completeStage`. Nothing found in
`pipeline-stage.repository.ts` merges new fields into `output` on an already-`completed` row. R2/R3
below both need this — build one shared, small function (e.g. `patchStageOutput(stageId, partial)`,
merge not replace) if nothing suitable already exists, used by both the drafts and final upload paths
rather than two near-duplicate ones.

**Watermark storage, confirmed by direct read of `watermark-route.ts`** (full file, 111 lines):
`POST /channels/:id/watermark` writes the uploaded image to `DATA_DIR/watermarks/<channelId>.<ext>` and
stores that local path in `Channel.brandAssets.watermarkUrl` (via `updateChannelBrandAssets`); `GET`/
`DELETE` read/remove the same local file. `video-generation/index.ts` (line 444) reads
`params.brandAssets.watermarkUrl` as a local filesystem path directly for FFmpeg's overlay filter — this
task does not change that; the pipeline's own read of the watermark stays local-only, same posture as
the video path itself.

**Publishing's own upload path reads the local file directly, and stays that way** —
`uploadVideoViaProvider` (`youtube-client.ts` line 99): `const videoBuffer = await fs.readFile(params.videoPath);`.
Local filesystem storage stays the source of truth for everything the pipeline itself does (YouTube
upload, `video-route.ts`'s own local-file streaming to the app, FFmpeg intermediate files, the watermark
overlay). R2 is a new, additive, best-effort external-visibility copy in every case this task covers —
never a replacement, never a new read dependency on the hot path.

---

**Duration**: R1 ~1.5-2h, R2 ~2-2.5h, R3 ~1.5-2h, R4 ~1-1.5h, R5 ~1.5-2h, R6 (optional) ~0.5h. ~8-10h core.

**Depends On**: None functionally — this is additive to the existing pipeline. Assumes the founder's
real R2 credentials are already correctly provisioned in both env files. The implementing agent must do
one real, live upload+download round trip as part of R1's own verification, not just trust the key
names exist.

**Owning Component**: New `studio/src/storage/` module (the R2 client boundary — same pattern as
`agents/publishing/youtube-client.ts`), `studio/src/run-pipeline/state-machine.ts` (both integration
points), `studio/src/api/watermark-route.ts`, `studio/src/api/routers/runs.ts` (the new read path).

**Founder decisions already made — don't reopen**:
- One shared R2 bucket (`7ai-preview`) for both local and preview — this task's job is to make that
  safe (namespacing), not to provision a second bucket.
- Two-tier storage (`drafts/` = every attempt, for review/fine-tuning; `final/` = the one that actually
  published) — see "Founder decision this revision encodes" above. Don't collapse back to one tier.
- `R2_TOKEN_VALUE` is out of scope — confirmed a different credential, not needed here.
- Watermark storage is now in scope (this task supersedes Task 9's "no object-storage migration in
  scope" note for watermarks specifically — video was already the plan, watermark was added to this
  same task on the founder's own request).

**Not needed from this task**: don't add an `Asset`/object-storage DB table — `week3/SCHEMA.md`'s own
note ("a dedicated Asset/object-storage table isn't earned yet at MVP scale") still holds; this task
stores R2 keys as plain strings in existing JSON columns (`pipeline_stages.output`, `Channel.brandAssets`),
the same convention `videoPath`/`watermarkUrl` already use.

---

### R1 (Role: `BE`) — R2 client module + env wiring

**Fix**:
1. Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` as new dependencies — R2 is
   S3-API-compatible (a custom `endpoint` pointed at the account's R2 endpoint, not AWS). Call out both
   as genuinely new dependencies in the report, same as every other new-dependency addition in this
   project's task reports (e.g. Task 9/R3's `@fastify/multipart`).
2. New `studio/src/config/env.ts` fields, all optional with an empty-string default — same
   graceful-degradation posture `TELEGRAM_BOT_TOKEN` already establishes (a checkout without these
   configured just skips R2 entirely, it doesn't fail to start): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_REGION`. Not `R2_TOKEN_VALUE` — confirmed out
   of scope above.
3. Add the same set to `studio/.env.example`, documented with a comment matching this task's own
   provenance, same convention every other block in that file already follows.
4. New `studio/src/storage/r2-client.ts` — the only file allowed to touch the R2 SDK, same boundary
   pattern `youtube-client.ts`/`stock-footage`'s client files already establish. Four exported
   functions:
   - `isR2Configured(): boolean` — true only when every required `R2_*` var is non-empty. Every call
     site below checks this first and no-ops (logs once, doesn't throw) when false.
   - `uploadToR2(params: { key: string; filePath: string; contentType: string }): Promise<{ key: string }>`
     — reads the local file and puts it via a single `PutObjectCommand` (no multipart needed — a
     Shorts-length video or a watermark image are both far under any practical single-request limit).
   - `deleteFromR2(params: { key: string }): Promise<void>` — needed by R4's watermark-delete path;
     best-effort at the call site, not inside this function.
   - `getPresignedDownloadUrl(params: { key: string; expiresInSeconds: number }): Promise<string>` — via
     `@aws-sdk/s3-request-presigner`'s `getSignedUrl` against a `GetObjectCommand`.
5. **Verify (real, live)**: with the founder's real credentials in `.env.local`, upload one real local
   file to the real `7ai-preview` bucket, generate a real presigned URL for it, and confirm a plain
   `fetch()`/`curl` against that URL actually downloads the identical bytes back (checksum match).
   Delete the test object afterward (or use a throwaway key clearly named as a test, e.g.
   `_test/r1-verify.bin`) so it doesn't linger in the founder's real bucket.

---

### R2 (Role: `BE`) — `drafts/`: best-effort upload of every `video_generation` attempt

**Fix**:
1. In `runVideoGenerationStage`, after the existing `prisma.$transaction(...)` block (line 941–948) has
   already returned successfully, attempt the R2 upload, wrapped in its own `try/catch`. Never let this
   step change the function's return value, throw, or delay reaching `video_review`.
2. Object key: `` `videos/${env.NODE_ENV}/drafts/${run.tenantId}/${runId}/${attemptNumber}.mp4` ``.
3. On success, merge `{ r2DraftKey, r2DraftUploadedAt: new Date().toISOString() }` into that
   `video_generation` stage's `output` JSON via R1's Verified Findings patch function. On failure, log a
   clear `console.error` and move on — no `r2DraftKey` field is a valid, already-handled state
   everywhere this is read (R5, R6).
4. Skip entirely (no log spam) when `isR2Configured()` is false.

**Verify**: drive one real run through `video_generation` with real R2 credentials configured and
confirm, via a direct Postgres read of that stage's `output` column, that `r2DraftKey`/
`r2DraftUploadedAt` are present and correct, and that the real object exists in the bucket at that exact
key. Separately, confirm a run driven with `R2_BUCKET` (or any other required var) deliberately unset
completes `video_generation` and advances to `video_review` exactly as it does on `main` today.

---

### R3 (Role: `BE`) — `final/`: best-effort upload of the video that actually published

**Fix**:
1. In `runPublishingStage`, immediately after `uploadResult` is obtained (the real upload succeeded —
   same point the existing cover-frame step already sits at), attempt a second best-effort R2 upload of
   the same `videoPath`, in its own `try/catch`, same isolation posture as the cover-frame step directly
   beside it (never fail the publishing stage or imply the upload itself failed).
2. Object key: `` `videos/${env.NODE_ENV}/final/${run.tenantId}/${runId}.mp4` `` — one per run, no
   attempt number (a run has exactly one "the one that shipped"; if `publishing` itself retries across
   multiple stage attempts, later attempts re-upload identical bytes to the same key — harmless,
   idempotent, not worth special-casing).
3. On success, merge `{ r2FinalKey, r2FinalUploadedAt: new Date().toISOString() }` into the `publishing`
   stage's `output` JSON via the same patch function R2 uses (`recordStageProgress`'s own `fullOutput`
   write at line 1468–1475 is the natural place to include these two fields directly, rather than a
   separate post-hoc patch, since that write hasn't happened yet at the point this step runs — confirm
   this ordering when implementing rather than assuming R2's post-hoc-patch shape is required here too).
4. Skip entirely when `isR2Configured()` is false.

**Verify**: drive one real run all the way through a real Gate 2 approval to a real, successful YouTube
upload (stub or real, per whatever `YOUTUBE_STUB` state the environment already has) and confirm, via a
direct Postgres read of the `publishing` stage's `output`, that `r2FinalKey`/`r2FinalUploadedAt` are
present, and that the real object exists in the bucket. Confirm a run whose publish attempt fails (e.g.
a deliberately broken credential) never gets a `final/` object — `final/` must only ever contain videos
that a real `uploadResult` was actually obtained for.

---

### R4 (Role: `BE`) — Watermark storage: mirror to R2 alongside the existing local read/write

**Fix**:
1. In `watermark-route.ts`'s `POST /channels/:id/watermark` handler, after the existing local
   `fs.writeFile`/`updateChannelBrandAssets` succeeds (unchanged), best-effort upload the same buffer to
   R2, wrapped in `try/catch`, never failing the request or changing its response shape.
2. Object key: `` `watermarks/${env.NODE_ENV}/${channel.tenantId}/${channel.id}.${ext}` ``.
3. In the `DELETE` handler, after the existing local delete succeeds, best-effort `deleteFromR2` at the
   same key (extension may have changed between uploads — delete both possible extensions' keys, same
   defensive pattern `deleteExistingWatermarkFile` already uses locally).
4. Local storage and the existing `GET`/`POST`/`DELETE` routes stay exactly as they are — this is a
   mirror for durability/external visibility, not a replacement; `video-generation/index.ts`'s FFmpeg
   overlay keeps reading the local path unchanged.
5. Skip entirely when `isR2Configured()` is false — a watermark upload/delete must succeed or fail
   exactly as it does on `main` today regardless of R2's state.

**Verify**: upload a real watermark through the route with real R2 credentials configured, confirm the
object exists in the bucket at the expected key with the correct bytes. Delete it through the route,
confirm the R2 object is gone too. Confirm the whole watermark upload/serve/remove flow (Task 9's own
original live-verification: a real PNG rendered into a real `video_generation` run, confirmed visible
via raw-pixel inspection) still passes unchanged with R2 either configured or not.

---

### R5 (Role: `BE`) — On-demand presigned URL for another session to fetch

**Fix**:
1. Add `runs.getVideoUrl({ runId, attemptNumber?, variant? })` to `runs.ts` — `variant` is
   `'draft' | 'final'`, optional; when omitted, prefer `final` if the run has one (i.e. it published),
   else fall back to the latest `draft`. `attemptNumber` only applies to `variant: 'draft'` (optional,
   defaults to the latest attempt) — reject/ignore it for `variant: 'final'` since there's only ever
   one. Read `runs.ts`'s existing ownership/tenant-scoping pattern for a plain read like `get` and reuse
   it here, don't invent a new one.
2. Looks up the relevant stage's `output.r2DraftKey`/`output.r2FinalKey`. If absent or
   `!isR2Configured()`, return `{ available: false }`. Otherwise return
   `{ available: true, variant, url, expiresAt }` — a fresh presigned URL minted on every call via R1's
   `getPresignedDownloadUrl`, expiring in 24 hours. Don't persist the URL anywhere — mint fresh each
   call.
3. Founder-facing workflow, stated plainly in the report: document the exact `curl`/API-auth-token
   invocation shape for both variants so the founder can actually use this day one to hand a video to
   another session.

**Verify**: for a run with a confirmed `r2DraftKey` (from R2's verification) and, separately, one with a
confirmed `r2FinalKey` (from R3's), call `getVideoUrl` with each `variant` and confirm the returned URL,
fetched directly (no app, no session, just `curl`), downloads real, playable video bytes. Confirm the
omitted-`variant` default actually prefers `final` once one exists. Confirm a run with neither key
returns `{ available: false }` cleanly.

---

### R6 (Role: `BE`, optional) — Cheap availability flags on `runs.get`

Add `hasR2Draft`/`hasR2Final: boolean` to `runs.get`'s existing response — plain existence checks, not
a presigned-URL mint (that stays R5's own explicit call). Build only if time remains after R1–R5; note
in the report either way, don't silently skip it without saying so.

---

## Schema Impact

No new tables/columns. `pipeline_stages.output` and `Channel.brandAssets` are already `Json` —
`r2DraftKey`/`r2DraftUploadedAt`/`r2FinalKey`/`r2FinalUploadedAt` are new fields inside the existing
`video_generation`/`publishing` stage output blobs; the watermark's R2 key can live alongside
`watermarkUrl` inside `brandAssets` (e.g. `watermarkR2Key`) — same "plain, human-readable, no opaque
binary, no dedicated Asset table" convention `videoPath`/`watermarkUrl` already use. If R2/R3's shared
patch function needs a new repository helper, that's new application code, not a schema change.

## Business Logic / State Transition

No new states and no new transitions to `PipelineRun.status`/`currentStage`. R2's and R3's uploads are
pure side effects attached after existing, unchanged transitions/success points — never a gate on
either. R4 is a pure side effect on an existing REST route's existing success path. R5/R6 are read-only,
no transition at all.

## Testing

```bash
npm run build && npm run lint && npm run typecheck
```

Plus each item's own Verify section above — R1, R2, R3, and R4 all need a real R2 round trip against the
founder's real bucket (with clearly-named, cleaned-up test objects), not stubbed or inferred from
reading the SDK's types. The "R2 unset/down → nothing else breaks" case matters most for safety in
every one of R2/R3/R4 — don't skip it even though it's the "nothing happens" case.

## Report Template

Generate at `docs/execution/sprint3/reports/task12.md`, same shape as `reports/task10.md`/
`reports/task11.md`. State plainly: (1) the exact `curl`/auth shape for `runs.getVideoUrl` (both
variants) so the founder can use it immediately, (2) confirmation that an R2-unconfigured checkout
still completes `video_generation`/`publishing`/watermark upload normally, (3) confirmation `final/`
only ever contains videos that actually published.

## Additional Notes

- Suggested build order: R1 first, then R2 and R4 (independent of each other, either order), then R3,
  then R5, then R6 (optional).
- This task deliberately does not change what the app (React Native client) shows — R5's endpoint is
  usable today via a direct authenticated call for the founder's own "share with another session"
  workflow; a real in-app "share/download video" affordance is separable UI scope for later if wanted.

## Known Issues / Future Improvements

- No lifecycle/retention policy on the R2 bucket — `drafts/` objects in particular accumulate across
  every attempt/regen with no expiry. R2 storage is inexpensive and this is acceptable at the founder's
  current testing volume; a real lifecycle rule (e.g. auto-expire `drafts/` after N days, keep `final/`
  indefinitely) is a Cloudflare-dashboard-level setting, not something this task's code sets — worth a
  founder action once volume grows, not blocking for this task.
- R5's presigned URLs are unauthenticated once minted (anyone with the link can fetch that one video for
  24h, standard presigned-URL behavior) — acceptable for a private review workflow with a trusted second
  session, same trust model this project already extends to e.g. Telegram-delivered magic links.
- Watermark's R2 mirror has no way to backfill a channel's existing, already-uploaded watermark (only
  new uploads/deletes touch R2 from this task forward) — acceptable at current scale (a handful of
  channels); a one-off backfill script is easy to add later if it turns out to matter.

## Links & References

- `docs/execution/templates/TASK_TEMPLATE.md`
- `docs/execution/sprint3/STATUS.md`
- `docs/execution/sprint3/tasks/task9.md` — watermark storage's original "local filesystem, no
  object-storage migration in scope" note; this task is what closes that specific residual gap
- `docs/execution/week3/SCHEMA.md` — "a dedicated Asset/object-storage table isn't earned yet at MVP
  scale," the standing convention this task's schema choice follows
- `studio/src/agents/publishing/index.ts`/`youtube-client.ts` — the isolation precedent (cover-frame/
  thumbnail-set) both this task's R2 uploads are modeled on

## Git Workflow

This task runs on its own branch, same posture as Tasks 8–11.

1. `git checkout main && git pull` from `D:\Study Material\7AI`.
2. `git checkout -b MEDIASTORAGE_BE`. Record this exact name in `docs/execution/sprint3/STATUS.md`'s new
   Task 12 row immediately — before the first commit.
3. One commit per item: `MEDIASTORAGE_TASK12_BE_R<X>: [what it does]`.
4. After R1's first commit is pushed, open the PR as a draft:
   `gh pr create --draft --title "MEDIASTORAGE_BE: Generated Media Storage — Cloudflare R2 Integration" --body "Tracking PR for Task 12. Live status: docs/execution/sprint3/STATUS.md (Task 12). Do not merge until marked ready for review."`
5. After R5 (and R6, if built) lands and is pushed, write the report and this task's `STATUS.md` row
   update, commit them together, then `gh pr ready`.
6. Never push or merge to `main` directly and never commit to a branch this task didn't create — same
   as every other track.
