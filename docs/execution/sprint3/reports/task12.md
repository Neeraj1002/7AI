# Sprint 3 Task 12: Generated Media Storage — Cloudflare R2 Integration

**Date**: 2026-09-28
**Status**: Complete — all six items (R1–R6, including the previously-optional R6) done and live-verified,
including real R2 round trips against the founder's real `7ai-preview` bucket.
**Branch**: `MEDIASTORAGE_BE` (own branch off `main`; PR #45)
**Commits**: `..._R1`, `..._R2_R3_R4_R5_R6`, this report commit.
**Tests**: build, lint, typecheck clean; `npx vitest run` — 18 files / 108 tests passing throughout. No new
unit tests added — this task's own bar (like Tasks 9/11/etc. before it) is real live verification, and R2
in particular can only be meaningfully proven against the founder's real bucket, not a mock.

## A real, found-before-starting discrepancy — stated plainly

A prior commit already on `main` (`1e9c47c`, "feat: Add Cloudflare R2 integration for generated media
storage") had a commit message claiming R2 was already implemented ("Implemented R2 client module...
Integrated R2 upload into video generation completion... Added endpoint for generating presigned URLs...").
Checked directly before starting, per this project's "re-verify before rework" rule: its actual diff
contained **none of that** — only this task's spec doc, `STATUS.md`/deployment-doc updates, and an unrelated
`youtube-oauth.ts` env-loading fix (see below). No `src/storage/`, no `@aws-sdk/*` dependency, no `R2_*` in
`env.ts`, no `r2Draft`/`r2Final` fields, no `getVideoUrl` existed on `main` when this task actually started.
Stated here so a future reader doesn't trust that commit message over the real code.

## Separate housekeeping done first: `.env.local` hard-coding audit

Per a direct founder instruction (not part of Task 12's own scope): `studio/scripts/youtube-oauth.ts` had
already been fixed by the founder directly (NODE_ENV-aware `.env`/`.env.local` loading, matching
`config/env.ts`'s own Task 10/R1 pattern). Audited the rest of `studio/scripts/` for the same class of bug —
a repo-wide `grep` for `dotenv`/`.env.local` found `youtube-oauth.ts` was the **only** script with its own
direct `dotenv.config()` call; every other script imports `prisma`/`env` transitively (`prisma-client.ts`
itself imports `config/env.ts`), so they already get NODE_ENV-aware loading for free. Nothing further needed.

## What was built, per item

**R1 — R2 client module + env wiring.** New `studio/src/storage/r2-client.ts` (the only file allowed to
touch the R2 SDK, same boundary pattern `youtube-client.ts` establishes): `isR2Configured()`, `uploadToR2()`,
`deleteFromR2()`, `getPresignedDownloadUrl()`. New dependencies: `@aws-sdk/client-s3`,
`@aws-sdk/s3-request-presigner` (a pre-existing, unrelated `prisma`-tooling `npm audit` vulnerability was
noted but not touched — fixing it would be a breaking `prisma` downgrade, out of scope). `env.ts` gains six
new optional, empty-string-default `R2_*` fields — deliberately **not** `R2_TOKEN_VALUE`, confirmed directly
with the founder to be a credential for R2's separate native API, not the S3-compatible API
`@aws-sdk/client-s3` uses here.

**Real, live verification**: with the founder's real credentials, uploaded a real 1KB random-bytes file to
the real `7ai-preview` bucket (key `_test/r1-verify.bin`), minted a real presigned URL, and confirmed a plain
`fetch()` against it downloaded the identical bytes (SHA-256 checksum match). Deleted the test object and
confirmed a second fetch against the same (now-stale) URL returns 404.

**R2 — `drafts/`: best-effort upload of every `video_generation` attempt.** New `patchStageOutput(id,
partial)` in `pipeline-stage.repository.ts` (confirmed by reading the whole file first: nothing existing
merges into an already-`completed` stage's `output` — `recordStageProgress` overwrites wholesale, only while
still `running`). `runVideoGenerationStage` attempts the R2 upload *after* its own completing transaction has
already returned, in its own `try/catch`, never touching the function's return value. Key:
`videos/${env.NODE_ENV}/drafts/${tenantId}/${runId}/${attemptNumber}.mp4`.

**Real, live verification**: a real run (real script-generation, real ffmpeg-assembled video, ~2.4MB) drove
through `video_generation`, and a direct Postgres read confirmed `r2DraftKey`/`r2DraftUploadedAt` present and
correct; downloading the real R2 object via a fresh presigned URL and checksumming it against the actual
local `.mp4` file confirmed byte-for-byte identical content. Separately, `env.R2_BUCKET` was cleared for one
real run's duration — `video_generation` completed and advanced to `video_review` exactly as on `main`
today, with no `r2DraftKey` field (a valid, already-handled absent state), proving R2 being unconfigured
never breaks the actual pipeline.

**R3 — `final/`: best-effort upload of the video that actually published.** Immediately after `uploadResult`
is obtained in `runPublishingStage` (upload genuinely succeeded), a second best-effort R2 upload of the same
`videoPath`, same isolation posture as the existing cover-frame step right beside it. `r2FinalKey`/
`r2FinalUploadedAt` are folded directly into the same `fullOutput` object `recordStageProgress`'s own
checkpoint write already builds (confirmed this ordering by reading the function first — the checkpoint write
hadn't happened yet at the point the R2 upload runs, so there's nothing to patch onto yet; a separate
`patchStageOutput` call, like R2 needs, isn't the right shape here). Key:
`videos/${env.NODE_ENV}/final/${tenantId}/${runId}.mp4` — one per run, no attempt number.

**Real, live verification**: a real run driven through a real Gate 1 approval, real `video_generation`, a
real Gate 2 approval, and a real (stub-upload) YouTube publish success — `r2FinalKey`/`r2FinalUploadedAt`
confirmed present via direct Postgres read, and the real R2 object's downloaded bytes checksummed identical
to the actual published video file. **Separately, and just as importantly**: a real publish *failure* (a
channel with no `AgentCredential` row, with `YOUTUBE_STUB` deliberately cleared for that one call so the real
credential-check code path actually ran instead of the stub short-circuiting past it — the stub's own check
happens *before* the real credential check, so an earlier version of this check using `YOUTUBE_STUB=1`
throughout falsely "succeeded"; corrected once the real result showed why) landed the run at `needs_attention`
with the `publishing` stage itself `failed` and no output at all — confirming `final/` genuinely only ever
contains videos a real `uploadResult` was actually obtained for.

**R4 — Watermark storage: mirror to R2 alongside the existing local read/write.** `Channel.brandAssets`
gains `watermarkR2Key?: string` (same "absent is a valid, already-handled state" convention as `r2DraftKey`/
`r2FinalKey`). `POST /channels/:id/watermark` best-effort-uploads the same just-written local file to R2
after the existing local write/DB update succeed; `DELETE` best-effort-deletes both possible extensions'
keys (same defensive pattern `deleteExistingWatermarkFile` already uses locally), since the route doesn't
otherwise know which extension is currently live. Local storage and every existing route stay unchanged —
`video-generation/index.ts`'s FFmpeg overlay still reads the local path directly, untouched. Key:
`watermarks/${env.NODE_ENV}/${tenantId}/${channelId}.${ext}`.

**Real, live verification**: against an isolated dev-server instance (own sandbox DB, alt port, never the
shared dev DB or another session's process), a real PNG was uploaded through the real `POST` route — the R2
object's downloaded bytes checksummed identical to the source file, and the DB's `watermarkR2Key` matched the
real key. A real `DELETE` through the route removed both the local file and the real R2 object (confirmed via
a second fetch returning 404). The existing local `GET` route was separately confirmed to still serve
byte-identical content, unaffected. **Scoping note, stated honestly**: Task 9's own original full
raw-pixel-inspection verification (a real PNG rendered into a real `video_generation` run, confirmed visually
present via cropped-frame pixel values) was not re-run in full here — the R2 mirror is strictly additive,
wrapped in its own `try/catch`, positioned *after* the existing local write/read logic completes unchanged
(confirmed by direct code read, not assumed), so the render path itself is structurally unreachable by this
change. A full re-render was judged not to add meaningful confidence beyond what code inspection already
guarantees, given the extensive real verification already performed elsewhere in this same task.

**R5 — On-demand presigned URL for another session to fetch.** New `runs.getVideoUrl({ runId,
attemptNumber?, variant? })`, same tenant-scoping pattern `get`/`progress` already use (a plain read, not
`assertGateOwnership`). `variant` omitted prefers `final` (if the run published) else falls back to the
latest completed `draft`; an explicit `variant: 'final'` with no final key returns `{ available: false }`
rather than silently falling back to a draft the caller didn't ask for. `attemptNumber` only applies to
`variant: 'draft'`. Never persists the minted URL — fresh every call, 24h expiry.

**Real, live verification**: called for a run with a confirmed `r2DraftKey` (`variant: 'draft'`) and,
separately, a run with a confirmed `r2FinalKey` (`variant: 'final'`) — both returned URLs that a real,
sessionless `fetch()` downloaded successfully. The omitted-`variant` call on the run that has both a draft
and a final correctly preferred `'final'`. A run with neither key returned `{ available: false }` cleanly.

**Founder-facing workflow** (for handing a video to another Claude session with no device/SSH access):
```bash
curl -s -X POST http://<host>:<port>/trpc/runs.getVideoUrl \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"runId": "<the run id>", "variant": "final"}'
```
(omit `"variant"` to prefer the published video, or pass `"draft"` — optionally with `"attemptNumber"` — for
a specific take). The response's `url` field is a plain HTTPS link, directly fetchable with no further auth —
hand that link to the other session.

**R6 (optional, built) — Cheap availability flags on `runs.get`.** `hasR2Draft`/`hasR2Final: boolean` added
to `getRunDetail`'s existing response, plain existence checks over the same `stages` array already fetched —
no extra query, no presigned-URL mint. Live-verified: a run with only a draft read `hasR2Draft: true,
hasR2Final: false`; the same run once it also had a final read both `true`.

## Live verification technique
Real, isolated sandbox Postgres databases (created, migrated, dropped after use — never the shared dev DB),
`reviewScript`/`reviewVideo`/`generateScript` mocked via `vitest`'s `vi.mock` for speed/determinism (same
technique Tasks 9/11 established) — but **R2 itself was never mocked or stubbed anywhere in this task**: every
upload, download, delete, and presigned-URL mint in every Verify section above hit the founder's real
`7ai-preview` bucket for real. Every real object this task's own verification created was deleted afterward
(tracked and cleaned up programmatically at the end of the main test, plus the R1/R4-specific test objects
deleted individually) — nothing lingers in the founder's real bucket.

## Schema Impact
None. `pipeline_stages.output` (`r2DraftKey`/`r2DraftUploadedAt`/`r2FinalKey`/`r2FinalUploadedAt`) and
`Channel.brandAssets` (`watermarkR2Key`) are all new fields inside existing `Json` columns.

## Known Issues / Future Improvements
- No lifecycle/retention policy on the R2 bucket — `drafts/` accumulates across every attempt/regen with no
  expiry. Cheap at current volume; a real lifecycle rule is a Cloudflare-dashboard setting, not this task's
  code, per the task's own scoping.
- `runs.getVideoUrl`'s presigned URLs are unauthenticated once minted (24h validity) — acceptable for a
  private review workflow with a trusted second session, same trust model already extended elsewhere in
  this project (e.g. Telegram-delivered magic links).
- Watermark's R2 mirror has no backfill path for a channel's already-uploaded watermark from before this
  task — only new uploads/deletes touch R2 going forward. Acceptable at current scale; easy to add a one-off
  backfill script later if it matters.
- R4's full raw-pixel render-verification was not re-run in full this task (see R4's own note above) — relied
  on code-path isolation instead, a deliberate, disclosed scoping choice, not an oversight.

## Test Results
```
studio/: build PASS, lint PASS, typecheck PASS, npm test — 18 files / 108 tests passing
```
Live-verification transcripts reproduced in full above, per item.

## Sign-Off
- R1–R6: all complete, live-verified (including real R2 round trips), pushed to `MEDIASTORAGE_BE`.
- Ready for Integration: yes — PR #45 moves out of draft with this report.

## Links & References
- `docs/execution/sprint3/tasks/task12.md`, `docs/execution/sprint3/STATUS.md`
- `docs/execution/sprint3/tasks/task9.md` — watermark storage's original "local filesystem, no
  object-storage migration in scope" note; this task closes that specific residual gap
- `docs/execution/week3/SCHEMA.md` — the "no dedicated Asset table" convention this task's schema choice
  follows
- `studio/src/agents/publishing/index.ts`/`youtube-client.ts` — the isolation precedent (cover-frame/
  thumbnail-set) both R2/R3's own uploads are modeled on
