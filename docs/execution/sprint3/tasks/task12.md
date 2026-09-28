# Sprint 3 Task 12: Generated Media Storage — Cloudflare R2 Integration

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git
Workflow, the `STATUS.md` update this task must make, and the section structure this file follows.

**Note on why this is a Sprint 3 task, not Sprint 4**: same reasoning as Tasks 8–11 — Sprint 4
(`docs/execution/sprint4/`) is a separate, larger, unrelated initiative (channel profiles/formats).
This is real infra work the founder needs now that testing has moved to the preview environment, filed
as a sixth Sprint 3 reopen on its own branch, same posture as Tasks 8–11.

**Objective**: every generated video currently lives only on the machine that rendered it (local
filesystem, `data/videos/<runId>/<attemptNumber>.mp4`) — nothing outside that machine's own device/SSH
access can see it. The founder now has real R2 credentials configured (both `studio/.env.local` locally
and `studio/.env` on the preview VPS) and wants generated video output uploaded to the shared `7ai-preview`
R2 bucket, specifically so it can be shared with another Claude session in this Project (one without
device access to the VPS) for reviewing/fine-tuning a run's video before/alongside the normal gate
approval flow. This task wires that up: upload each completed `video_generation` attempt to R2 as a
best-effort side effect, and add a way to mint a fetchable URL for it on demand.

---

## Verified findings (2026-09-28 — confirmed by reading the actual code on `D:\Study Material\7AI\studio`,
not assumed; per the founder's standing rule, re-verify before rework, don't re-litigate what's below)

**No R2/object-storage code exists anywhere in this codebase today.** Confirmed by reading
`studio/package.json` in full: no `@aws-sdk/*` package, no `aws-sdk`, no other S3-compatible client of
any kind among either `dependencies` or `devDependencies`. A repo-wide check for a `storage/` module
(the natural place, mirroring `llm/`, `media/`, `stock-footage/`, `agents/publishing/`'s own
provider-boundary convention) also found nothing — `studio/src/media/`'s own directory listing has no
storage-adjacent file.

**R2 credentials already exist in both env files** — confirmed by reading the key names only (not
values) out of the founder's own `studio/.env.local`: `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, `R2_BUCKET`,
`R2_ENDPOINT`, `R2_REGION`, `R2_SECRET_ACCESS_KEY`, `R2_TOKEN_VALUE`. **None of these are read anywhere
in code** — `studio/src/config/env.ts`'s `EnvSchema` (a plain `zod` object, which silently strips any
key not declared in the schema) has no `R2_*` fields at all, so `env.R2_BUCKET` etc. would currently be
`undefined` even with the real values sitting in the env file. `studio/.env.example` also has no `R2_*`
entries yet — this task should add them, following the exact same documented-optional-credential
pattern `TELEGRAM_BOT_TOKEN` already establishes there.

**One shared bucket (`7ai-preview`) for everything** — confirmed by the founder's own statement, not
assumed. Because the same bucket name is configured in *both* the local `.env.local` and the preview
VPS's `.env`, a local dev run and a real preview run would write to the identical bucket/key space if
object keys are naive (e.g. just `<runId>/<attemptNumber>.mp4`) — a `runId` is a UUID so an actual key
collision is astronomically unlikely, but a local throwaway test run polluting the same bucket the
founder is using for real review is a real, avoidable footgun. **This task's key scheme (R2, below)
namespaces by `NODE_ENV` for exactly this reason** — a deliberate decision, not left implicit.

**The exact integration point, confirmed by direct read of `state-machine.ts`'s `runVideoGenerationStage`**
(lines 744–952): `generateVideo()` (called at line 903, `studio/src/agents/video-generation/index.ts`)
writes the real .mp4 to `DATA_DIR/videos/<pipelineRunId>/<attemptNumber>.mp4` and returns
`{ videoPath, durationSeconds, aspectRatio, plan }`. That output is persisted at **line 946**:
`await completeStage(stage.id, { ...output, plan }, tx);` inside a `prisma.$transaction` that also
advances `currentStage` to `'video_review'` (line 947). **This transaction must stay exactly as fast and
as reliable as it is today** — it's the one thing standing between the pipeline and forward progress; an
R2 upload (a real network call, seconds at minimum for a several-MB video, potentially much longer on a
slow link) must never sit inside it or block it.

**The established isolation precedent for exactly this shape of problem already exists in this codebase**
— `runPublishingStage`'s cover-frame/thumbnail-set step (same file, lines 1434–1463): a real external
call made *after* the thing that actually matters (the upload) has already succeeded, wrapped in its own
`try/catch`, logged on failure via `console.error`/`console.warn`, never thrown further, never allowed to
make the stage (or the run) look failed. This task's R2 upload follows the identical shape, one stage
earlier (after `video_generation` completes, not after `publishing`).

**No existing repository function updates a stage's `output` JSON *after* it's already `completed`** —
`recordStageProgress` (used by `runPublishingStage`, line 1475, and referenced in `resume-on-startup.ts`)
writes a checkpoint while a stage is still `'running'`, before `completeStage` is called; nothing found
in `pipeline-stage.repository.ts` (not yet read in full by this doc — **the implementing agent must read
it directly before assuming one doesn't exist**) writes to `output` on an already-`completed` row. If
none exists, R3 below needs a small new function for it (e.g. `patchStageOutput(stageId, partial)` —
merge, not replace, so nothing already written to `output` is lost).

**Publishing's own upload path reads the local file directly** — `youtube-client.ts`'s
`uploadVideoViaProvider` (line 99): `const videoBuffer = await fs.readFile(params.videoPath);`. **This
task does not touch that path.** Local filesystem storage stays the source of truth for everything the
pipeline itself does (YouTube upload, `video-route.ts`'s own local-file streaming to the app, FFmpeg
intermediate files) — R2 is a new, additive, best-effort *external-visibility* copy, not a replacement.
Don't refactor `youtube-client.ts`/`video-route.ts` to read from R2 instead of disk; that's explicitly
out of scope and would add real risk (network dependency, latency) to a path that works today.

---

**Duration**: R1 ~1.5-2h, R2 ~2-2.5h, R3 ~1-1.5h, R4 (optional) ~0.5h. ~5-6.5h core.

**Depends On**: None functionally — this is additive to the existing pipeline. Assumes the founder's
real R2 credentials are already correctly provisioned in both env files (confirmed present above; values
not verified from this session — the implementing agent should do one real, live upload+download round
trip as part of R1's own verification, not just trust the key names exist).

**Owning Component**: New `studio/src/storage/` module (the R2 client boundary — same pattern as
`agents/publishing/youtube-client.ts`), `studio/src/run-pipeline/state-machine.ts` (the
`runVideoGenerationStage` integration point), `studio/src/api/routers/runs.ts` (the new read path).

**Founder decisions already made — don't reopen**:
- One shared R2 bucket (`7ai-preview`) for both local and preview, per the founder's own statement —
  this task's job is to make that safe (namespacing, below), not to provision a second bucket.
- Purpose is external visibility for review/fine-tuning by another session, not replacing local storage
  or the YouTube publish path.

**Not needed from this task**: don't touch watermark storage (`studio/src/api/watermark-route.ts`) —
Sprint 3 Task 9's own report already flagged watermark storage as local-filesystem-only and explicitly
out of scope for that task; it stays out of scope here too unless the founder asks for it separately (see
Known Issues below). Don't add a `Asset`/object-storage DB table — `week3/SCHEMA.md`'s own note ("a
dedicated Asset/object-storage table isn't earned yet at MVP scale") still holds; this task stores the R2
key as a plain string in the existing `pipeline_stages.output` JSON, the same convention `videoPath`
already uses.

---

### R1 (Role: `BE`) — R2 client module + env wiring

**Fix**:
1. Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` as new dependencies — R2 is
   S3-API-compatible, this is Cloudflare's own documented integration path (a custom `endpoint` pointed
   at the account's R2 endpoint, not AWS). Call out both as genuinely new dependencies in the report,
   same as every other new-dependency addition in this project's task reports (e.g. Task 9/R3's
   `@fastify/multipart`).
2. New `studio/src/config/env.ts` fields, all optional with an empty-string default — same graceful
   -degradation posture `TELEGRAM_BOT_TOKEN` already establishes (a checkout without these configured
   just skips R2 upload entirely, it doesn't fail to start): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_REGION`. (`R2_TOKEN_VALUE` exists in the
   founder's env file too — read Cloudflare's own R2 API-token documentation to confirm whether this is
   actually needed alongside the access-key-id/secret pair for the S3-compatible API path this task uses,
   or whether it's a separate credential for R2's own native API that this task doesn't need; state which
   in the report rather than wiring in an env var nothing ends up reading.)
3. Add the same set to `studio/.env.example`, documented with a comment matching this task's own
   provenance, same convention every other block in that file already follows.
4. New `studio/src/storage/r2-client.ts` — the only file allowed to touch the R2 SDK, same boundary
   pattern `youtube-client.ts`/`stock-footage`'s client files already establish. Two exported functions:
   - `isR2Configured(): boolean` — true only when every required `R2_*` var is non-empty. Every call site
     below checks this first and no-ops (logs once, doesn't throw) when false, so a checkout without R2
     configured behaves exactly as it does today.
   - `uploadToR2(params: { key: string; filePath: string; contentType: string }): Promise<{ key: string }>`
     — reads the local file and puts it to the bucket via `PutObjectCommand`. A single `PutObjectCommand`
     is sufficient here (no multipart) — a Shorts-length video is at most tens of MB, far under any
     practical single-request limit.
   - `getPresignedDownloadUrl(params: { key: string; expiresInSeconds: number }): Promise<string>` — via
     `@aws-sdk/s3-request-presigner`'s `getSignedUrl` against a `GetObjectCommand`.
5. **Verify (real, live)**: with the founder's real credentials in `.env.local`, upload one real local
   file to the real `7ai-preview` bucket, generate a real presigned URL for it, and confirm a plain
   `fetch()`/`curl` against that URL actually downloads the identical bytes back (checksum match) — real
   round-trip proof, not just "the SDK call didn't throw." Delete the test object afterward (or reuse a
   throwaway key clearly named as a test, e.g. `_test/r1-verify.bin`) so it doesn't linger in the
   founder's real bucket.

---

### R2 (Role: `BE`) — Wire best-effort upload into `video_generation` completion

**Fix**:
1. In `state-machine.ts`'s `runVideoGenerationStage`, **after** the existing
   `prisma.$transaction(...)` block (line 941–948) has already returned successfully — i.e. after the
   stage is genuinely `completed` and the run has already advanced to `video_review` — attempt the R2
   upload, wrapped in its own `try/catch`, exactly the isolation shape `runPublishingStage`'s
   cover-frame step already establishes (cited above). **Never let this step change the function's
   return value, throw, or delay reaching `video_review`.**
2. Object key: `` `videos/${env.NODE_ENV}/${run.tenantId}/${runId}/${attemptNumber}.mp4` `` — the
   `NODE_ENV` segment is this task's own deliberate answer to the one-shared-bucket collision concern
   raised in Verified Findings above; state in the report that this was a deliberate choice, not an
   accident, so a future reader doesn't "clean it up" without understanding why it's there.
3. On success, merge `{ r2Key, r2UploadedAt: new Date().toISOString() }` into that stage's existing
   `output` JSON via the patch function from R1's Verified Findings note (add it to
   `pipeline-stage.repository.ts` if nothing suitable already exists there — read the file first, don't
   assume). On failure, log a clear `console.error` naming the run/attempt and move on — the stage's
   `output` simply has no `r2Key` field, which is a valid, already-handled state everywhere this task
   reads it (R3, R4).
4. Skip entirely (no log spam) when `isR2Configured()` is false.

**Verify**: drive one real run through `video_generation` with real R2 credentials configured and
confirm, via a direct Postgres read of that stage's `output` column, that `r2Key`/`r2UploadedAt` are
present and correct, and that the real object exists in the bucket at that exact key (list or head the
object directly against R2, don't just trust the code path ran). Separately, confirm a run driven with
`R2_BUCKET` (or any other required var) deliberately unset completes `video_generation` and advances to
`video_review` exactly as it does on `main` today — the whole point of this item is that R2 being down,
misconfigured, or absent must never be a way to break the actual pipeline.

---

### R3 (Role: `BE`) — On-demand presigned URL for another session to fetch

**Fix**:
1. Add `runs.getVideoUrl({ runId, attemptNumber })` to `studio/src/api/routers/runs.ts` — `attemptNumber`
   optional, defaults to the latest `video_generation` attempt for that run. Read `runs.ts`'s existing
   ownership/tenant-scoping pattern for a plain read like `get` (not `assertGateOwnership`, which is for
   gate *resolution* specifically — read the file to confirm which check `get` itself actually uses, and
   reuse that same one here, don't invent a new one).
2. Looks up that attempt's stage `output.r2Key`. If absent (R2 wasn't configured when that attempt ran,
   or the upload failed) or `!isR2Configured()`, return `{ available: false }`. Otherwise return
   `{ available: true, url, expiresAt }` — a fresh presigned URL minted on every call via R1's
   `getPresignedDownloadUrl`, expiring in 24 hours (matches "generous enough for an async review pass by
   another session," distinct from the 15-minute magic-link token, a different threat model entirely: this
   URL exposes only one already-generated video, not account access). Don't persist the URL anywhere —
   mint fresh each call, so a stale, leaked link simply expires rather than needing active revocation.
3. **Founder-facing workflow, stated plainly for whoever picks this task up**: the other Claude session
   reviewing the video would call (or have the founder relay) this same endpoint's URL — document the
   exact `curl`/API-auth-token invocation shape in the report so the founder can actually use this day one,
   not just so a future app screen can.

**Verify**: for a run with a real, confirmed `r2Key` (from R2's own verification), call `getVideoUrl` and
confirm the returned URL, fetched directly (no app, no session, just `curl`), downloads real, playable
video bytes. Confirm a run with no `r2Key` (R2 wasn't configured, or a pre-this-task run) returns
`{ available: false }` cleanly, not an error.

---

### R4 (Role: `BE`, optional) — Cheap availability flag on `runs.get`

Add `hasR2Video: boolean` (or reuse whatever field name matches this project's existing style once R2/R3
are built) to `runs.get`'s existing response — a plain existence check (`Boolean(output?.r2Key)`), not a
presigned-URL mint (that stays a separate, explicit call per R3, since minting one on every `runs.get`
poll would be wasteful). Build only if time remains after R1–R3; note in the report either way, don't
silently skip it without saying so.

---

## Schema Impact

No new tables/columns. `pipeline_stages.output` is already `Json?` (schema.prisma) — R2's key/timestamp
are two new fields inside that existing JSON blob for the `video_generation` stage's output, the same
"plain, human-readable, no opaque binary, no dedicated Asset table" convention `videoPath` itself already
uses (per `week3/SCHEMA.md`'s own note, still current). If R2's patch function (R2/R3 above) needs a new
repository helper, that's new application code, not a schema change.

## Business Logic / State Transition

No new states and no new transitions to `PipelineRun.status`/`currentStage` — R2's upload is a pure side
effect attached after an existing, unchanged transition (`video_generation` stage completes →
`currentStage: 'video_review'`), never itself a gate on that transition. R3 is a read-only addition, no
transition at all.

## Testing

```bash
npm run build && npm run lint && npm run typecheck
```

Plus each item's own Verify section above — R1 and R2 specifically need a real R2 round trip against the
founder's real bucket (with a clearly-named, cleaned-up test object), not stubbed or inferred from reading
the SDK's types. R2's second Verify case (R2 unset → pipeline unaffected) is the one that matters most for
safety — don't skip it even though it's the "nothing happens" case.

## Report Template

Generate at `docs/execution/sprint3/reports/task12.md`, same shape as `reports/task10.md`/`reports/task11.md`.
State plainly: (1) whether `R2_TOKEN_VALUE` turned out to be needed (R1's own open question), (2) the
exact `curl`/auth shape for `runs.getVideoUrl` so the founder can use it immediately, (3) confirmation that
an R2-unconfigured checkout still completes `video_generation` normally.

## Additional Notes

- Suggested build order: **R1 first** (nothing else works without a real, verified R2 client), then R2,
  then R3. R4 last, optional.
- This task deliberately does not change what the *app* (React Native client) shows — R3's endpoint is
  usable today via a direct authenticated call for the founder's own "share with another session" workflow;
  a real in-app "share/download video" affordance is separable UI scope for later if wanted, not assumed
  here.
- If the founder wants the *published-to-YouTube* master specifically (not the raw `video_generation`
  output) mirrored to R2 too, that's a distinct, separable follow-on (hook into `runPublishingStage`
  instead of/in addition to `runVideoGenerationStage`) — not built here unless asked; this task covers the
  generated-video-for-review use case the founder actually described.

## Known Issues / Future Improvements

- Watermark storage (`watermark-route.ts`, `data/watermarks/`) stays local-filesystem-only, unchanged —
  Sprint 3 Task 9's own report already named this as out of scope; still true after this task.
- No lifecycle/retention policy on the R2 bucket — objects accumulate indefinitely across every run/attempt.
  R2 storage is inexpensive and this is acceptable at the founder's current testing volume; worth a real
  lifecycle rule (e.g. auto-expire after N days) once volume grows, not blocking for this task.
- R3's presigned URLs are unauthenticated once minted (anyone with the link can fetch that one video for
  24h, standard presigned-URL behavior) — acceptable for a private review workflow with a trusted second
  session, same trust model this project already extends to e.g. Telegram-delivered magic links; flagged
  for awareness, not treated as a defect.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- `docs/execution/sprint3/STATUS.md`
- `docs/execution/sprint3/tasks/task9.md` — watermark storage's own "local filesystem, no object-storage
  migration in scope" note, still the standing decision for that specific asset type
- `docs/execution/week3/SCHEMA.md` — "a dedicated Asset/object-storage table isn't earned yet at MVP
  scale," the standing convention this task's schema choice follows
- `studio/src/agents/publishing/index.ts`/`youtube-client.ts` — the isolation precedent (cover-frame/
  thumbnail-set) this task's own R2 upload isolation is modeled on

## Git Workflow

This task runs on its own branch, same posture as Tasks 8–11.

1. `git checkout main && git pull` from `D:\Study Material\7AI`.
2. `git checkout -b MEDIASTORAGE_BE`. Record this exact name in `docs/execution/sprint3/STATUS.md`'s new
   Task 12 row immediately — before the first commit.
3. One commit per item: `MEDIASTORAGE_TASK12_BE_R<X>: [what it does]`.
4. After R1's first commit is pushed, open the PR as a draft:
   `gh pr create --draft --title "MEDIASTORAGE_BE: Generated Media Storage — Cloudflare R2 Integration" --body "Tracking PR for Task 12. Live status: docs/execution/sprint3/STATUS.md (Task 12). Do not merge until marked ready for review."`
5. After R3 (and R4, if built) lands and is pushed, write the report and this task's `STATUS.md` row
   update, commit them together, then `gh pr ready`.
6. **Never push or merge to `main` directly** and **never commit to a branch this task didn't create** —
   same as every other track.
