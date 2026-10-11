# Sprint 4 Status: Channel Profiles, Formats & Content-Quality Configurability

**Sprint status**: In progress. Task 8 (Render Quality Floor) is merged (PR #46) and its founder action
(real music beds) is merged (PR #54); its report is written (`reports/task8.md`, code plus local real-render
checks), and its VPS verification run is still open. The other 8
items (6 numbered backend tasks + 1 frontend task + 1 hardening item) are task docs only and not yet
implemented. This sprint is a deliberately
scoped-down implementation of the "Channel-agnostic content & channel setup requirements (v3)" proposal
(produced by a separate content-analyser session against this same Project), sized for the founder's
actual near-term plan: solo use for 2-3 weeks to judge whether individual channels/formats are worth
continuing, before opening the app to other testers.

**Rearranged 2026-10-06**: a new **Task 8 (Render Quality Floor)** was added and is **built first**, ahead
of every other Sprint 4 task. An external architect review of 9 real published Shorts found that every
video fails basic quality standards regardless of channel: about 12 dB too quiet, oversized and clipped
captions, single looped stock clips with zero cuts, and slow AI-stills pacing. Sprint 4's other tasks make
content *configurable per channel*. Task 8 fixes the *renderer* every channel shares, and Task 3 then
builds on it. Task numbers were **not** renumbered, because the existing task docs cross-reference each
other by number (e.g. Task 5 consumes Task 4's data). The order below is the authoritative build order.

**A firm rule this sprint's task docs follow**: nothing here is deferred just because it depends on
something else that doesn't exist yet. Where a feature genuinely needed a prerequisite (real approver
identity for `{editor}` credit), the prerequisite became its own task (Task 4), and the feature that
needed it ships for real in the very next task (Task 5), not as a placeholder. Deferrals that remain in
this sprint (AI-drafted/guided channel setup, a DB-backed no-deploy-editable format table, version
diff/rollback) are genuine scope-size decisions, not dependency gaps. Each is named explicitly below,
not silently dropped, and none of them block anything else in this sprint.
**Paused 2026-10-08.** The founder set Sprint 4 aside to finish the Sprint 3 closure first (Bugs Task 11,
closure parts 1 and 2). Nothing new is started here until closure part 2 is merged and its triage is done.
State at the pause: Task 8 is merged and its image cost is booked correctly on a real preview run
(`c3a0175c`), but `qualityMetrics` have not yet been read at a real Gate 2. Frontend 1's item E1 (the
quality card on the Gate 2 screen) is built as provisional PR #53, awaiting the Gate 2 board screenshot and
a device check; E2-E6 are blocked. Closure part 2 (PR #57) also touches Task 8's render path:
P8 adds a 0.7 s end tail after the last spoken word, and P5 books real spend when a render fails.
**Carried in from Sprint 3 (2026-10-11).** Sprint 3 is being closed by Bugs Task 12 (`bugs/Sprint3/tasks/task12.md`). These items are not in it and are candidates here: YouTube custom-thumbnail 403 (needs the founder to phone-verify each channel with YouTube; `tasks/hardening-thumbnail-phone-verification.md`); Bugs Task 7 R2, the tester-facing bug-report type and priority chips; the YouTube Analytics API for watch time and retention (needs the `yt-analytics.readonly` scope); a search-grounded fact-check pass for Script Review (currently listed under "Not yet built" in Known Issues); feeding the reviewer's replacement text into the next stock search and requiring concrete search terms for stock channels (the rest of the Lego finding). The `gpt-image-1.5` migration (deadline 2026-12-01) is its own task, `bugs/Sprint3/tasks/hardening-gpt-image-migration.md`. Sprint 4 stays paused until Sprint 3 is closed.
**Last updated**: 2026-10-11 (carried-in items from the Sprint 3 closing). Before that: 2026-10-08 (paused note; Task 8 report and verification state corrected). Previous: 2026-10-07 (Task 8 marked merged, PR #46; founder action done, real music beds merged
in PR #54). Previous: 2026-10-06 (Task 8 added and placed first; explicit build order added below).
Earlier: 2026-09-25 (sprint restructured: Task 4 inserted as the ReviewLog-identity prerequisite; former Task 4 →
Task 5 with `{editor}`/`{sources}` now built for real, not deferred, plus a new R18 for explicit
upload-time `madeForKids`/`categoryId`/`defaultLanguage`; former Task 5 → Task 6; former Task 6 → Task 7;
a new hardening item added for the thumbnail-403/phone-verification investigation).

## Build order (authoritative, added 2026-10-06)

| Order | Item | Why here |
|---|---|---|
| 0 (recommended, not blocking) | Sprint 3 Task 13: per-attempt debug bundles to R2 (+ PR #45 deploy verification) | Small. Makes Task 8's before/after verifiable from outside the VPS, and confirms R2 is actually live in production. |
| 1 | **Task 8: Render Quality Floor** | Improves every video on every channel immediately; no dependency on the profile model. |
| 2 | Task 7: Channel × Format Comparison Dashboard | Already pulled forward (its own notes). Built right after Task 8, it gives before/after retention data on the improved renderer. |
| 3 | Task 1: Channel Profile Model + Shared Resolver | Foundation for Tasks 2, 3, 5, 6 and Frontend 1. |
| 4 | Task 2: Script-Side Pipeline Capabilities | Hooks, banned openers/endings, fact policy: the biggest retention lever after rendering. |
| 5 | Task 3: Visual-Side Pipeline Capabilities | Per-profile style and `secondsPerStill`, now **overriding Task 8's platform default** instead of the old fixed 3–6. Its regression run uses Task 8's numbers as the baseline. |
| 6 | Task 6: Format Library + Channel Setup API | Format variety (also guards against YouTube's "inauthentic content" policy). |
| 7 | Frontend 1: Channel Profile Setup Screen + Format Picker | Needs Tasks 1 and 6. |
| 8 | Task 4: ReviewLog Approver Identity | Prerequisite for Task 5 only. |
| 9 | Task 5: Packaging From Profile | Lowest growth impact of the set, so it comes last. |
| Anytime | Hardening: Thumbnail 403 / phone verification | Founder action, independent. |

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 8 | Render Quality Floor: Audio Mastering, Captions, Output Standard, Visual Pacing, Deterministic QC | **Merged (PR #46)**. Verification pending | — | Added 2026-10-06 from measured evidence (9 published Shorts + code read). R1: `loudnorm` to −14 LUFS + sidechain-ducked music bed. R2: `.ass` captions with `PlayResX/Y=1080×1920` (fixes the 288 px-canvas sizing bug), a bundled font, safe-area placement, script-accurate text with Whisper used for timing only. R3: 30 fps constant + explicit encoding settings. R4: planner defaults to `ai-stills` for real people/events. R5: stock path becomes a shot list (multiple distinct clips, no looping). R6: platform default ~2.5 s per still (6–20), with a mandatory Ken Burns regression check. R7: deterministic `qualityMetrics` recorded at video review and shown at Gate 2, blocking only on hard failures. Founder action: ✅ **done 2026-10-07, PR #54 (merged)**. The synthetic sine-wave beds were replaced with five YouTube Audio Library tracks (one per mood), normalised to −18 LUFS, manifest `license`/`label` updated; test render −14.1 LUFS. **Still open:** the real verification run on the preview VPS (confirm the new beds are in the server's `DATA_DIR/audio-beds` and `sevenai` restarted), and the `qualityMetrics` read from a real Gate 2. The report `docs/execution/sprint4/reports/task8.md` is written. Later changes to the same render path: Closure part 2 P8 (end tail) and P5 (failed-render spend), PR #57. |
| 1 | Channel Profile Model + Shared Resolver | Not started | — | `ChannelProfileVersion` model, `Channel.activeProfileVersionId`, `PipelineRun.profileVersionId`, `resolveChannelConfig()` (run override → format → profile → legacy `Channel` fields → platform default). Foundation every other backend task in this sprint reads from. Packaging sub-schema now also carries `selfDeclaredMadeForKids`/`categoryId`/`defaultLanguage` (R18, consumed by Task 5). |
| 2 | Script-Side Pipeline Capabilities | Not started | — | Raw-brief + fact policy, `sources[]` on creation options, dynamic target length (not byte-identical to today's fixed 30-60s framing; flagged), banned openers/endings, `styleGuideViolations` review field + fixing the existing gap where `factualConcerns` was never actually surfaced at Gate 1. |
| 3 | Visual-Side Pipeline Capabilities: Style Prompts, Dynamic Still Count, Safety Negatives | Not started | — | Style/negative-prompt injection ahead of `generateStills`, `desiredStillCount` clamped 3-20, an off-by-default safety-negatives flag. Opens with an explicit Ken-Burns regression-risk warning (Sprint 2 Task 2's own double-frame-multiplication bug) and requires a real regression run against that task's own baseline numbers before merge. **Updated 2026-10-06**: built after Task 8. Its "profile-less channel keeps the original 3–6 default" wording now means "keeps Task 8's platform default", and its regression baseline is Task 8's recorded render numbers. Update the doc's wording when implementing. |
| 4 | ReviewLog Approver Identity: Editor Attribution Plumbing | Not started | — | New: `ReviewLog.approvedByUserId`, threaded from `ctx.userId` through `resolvePendingApproval`/`NotificationChannel.requestApproval`/`Gate1Outcome`/`Gate2Outcome` down to all five `insertReviewLog` call sites in `state-machine.ts`. Exists specifically so Task 5's `{editor}` credit is real data, not a placeholder; built as its own task rather than deferred alongside the feature that needs it. |
| 5 | Packaging From Profile: Title/Description/Hashtags + Editor & Source Credit + Upload Compliance Fields + Repeat-Topic Warning | Not started | — | Title/description/hashtag guidance from the profile; real `{editor}`/`{sources}` credit lines (Task 4's data, no longer deferred); new R18: `status.selfDeclaredMadeForKids` (always explicit, default `false`) and `snippet.categoryId`/`defaultLanguage` sent on every real upload instead of left to YouTube/channel defaults; a non-blocking repeat-topic warning appended to the Gate 1 message. |
| 6 | Format Library + Channel Setup API (Backend) | Not started | — | Static, in-repo 9-format manifest (`studio/src/formats/manifest.ts`), a `formatKey` precedence level in the resolver (run override → format → profile → legacy → default), `channels.listFormats`, `runs.create`'s `formatKey`. Advanced-path API only; AI-drafted/guided setup explicitly deferred (see Scope note). |
| 7 | Channel × Format Comparison Dashboard | Not started | — | New `dashboard.comparison` procedure + `app/app/(app)/compare.tsx`: real side-by-side channel/format totals, zero-data channels shown, not omitted. Deliberately pulled forward ahead of Tasks 2-5 in this sprint's actual build order (see its own Additional Notes) since it's parallelizable and most directly answers "is this worth continuing". No real ad-revenue figure exists yet (YouTube Partner Program thresholds won't be hit in the founder's own 2-3 week window), so this is explicitly a views/likes/comments/retention proxy view, not a P&L. |
| Frontend 1 | Sprint 4 front end, spec `tasks/frontend-task1.md`: E1 Gate 2 quality, E2 Compare, E3 Gate 1 review + Sources, E4 Format picker, E5 Content profile, E6 repeat-topic | E1–E6 built, awaiting founder device verification (E2, E4, E5 without boards) | UI/UX code agent | Branch `SPRINT4_FE_E1`, PR #53 (all items, per the 2026-10-11 pending page). Report: `reports/frontend-task1.md`. |
| Hardening | Thumbnail 403: Link to Phone Verification | Not started | — | Not a numbered task (same posture as Sprint 3's tenant-check hardening doc). Resolves the real, still-open Sprint 2 Task 5/H1 custom-thumbnail `403` by testing the concrete hypothesis that it's a channel phone-verification/Studio feature-eligibility gap, distinct from `longUploadsStatus`, which that report already found doesn't gate it. Founder action (complete phone verification via Studio's own Feature Eligibility page) + a real re-test, not a code rebuild. |

## Full detail
Task docs: `docs/execution/sprint4/tasks/task1.md` through `task8.md`,
`docs/execution/sprint4/tasks/frontend-task1.md`,
`docs/execution/sprint4/tasks/hardening-thumbnail-phone-verification.md`.
Per-task reports (written as each task is actually implemented): `docs/execution/sprint4/reports/task1.md`, etc.

## What this sprint deliberately defers (named, not silently dropped; genuine scope decisions, not dependency gaps)
- **AI-drafted channel-profile setup** (source proposal R22's first path: a short description → a
  drafted profile). Real, separable scope once testers besides the founder are actually onboarding
  themselves; building it for an audience of one is the over-scoping this sprint is explicitly trying
  to avoid. See Task 6's Scope note.
- **Guided, multi-step setup wizard with example galleries** (R22's second path). Same reasoning as
  above. See Task 6's Scope note.
- **Format library as a DB-backed, no-deploy-editable table**. The source proposal's "admins can add
  formats without a deploy" is a real requirement once non-technical people manage the format list, not
  yet; Task 6 ships a static, in-repo, typed manifest instead, matching this codebase's own established
  `audio-bed/manifest.ts` pattern.
- **Version diff/rollback on the channel profile screen**. Frontend Task 1 ships a version-history
  *list* only; diffing and rollback are real, separable UI scope for once there's actually more than a
  handful of versions to compare.
- **Real ad-revenue/profitability figures in the comparison dashboard**. Not available from YouTube's
  API until a channel clears Partner Program monetization thresholds (1,000 subscribers + either 10M
  Shorts views in 90 days or 4,000 watch hours), which won't happen in the founder's own 2-3 week
  testing window. Task 7 is explicitly a views/likes/comments (and, once unblocked, retention/watch-time)
  proxy view, not a P&L; stated plainly in its own report so it isn't mistaken for one.
- **Language-specific rendering (e.g. Kannada)**: added 2026-10-06. Needs a non-OpenAI TTS for Indic
  languages, a per-language bundled font (Task 8/R2's font mechanism is the hook), and script-accurate
  captions (Task 8/R2). Separate future task; not in this sprint.

**No longer deferred, as of the 2026-09-25 restructuring**: `{editor}`/`{sources}` packaging credit
fields were previously listed here as deferred pending a `ReviewLog` schema gap. That gap is now Task 4,
built as its own task specifically so Task 5 can ship the real feature instead of a placeholder. See Task
4/5's rows above.

## Open items this sprint is expected to touch
- The real, still-open Sprint 2 Task 5/H1 custom-thumbnail `403`, picked up by this sprint's hardening
  item above, with a concrete phone-verification hypothesis to actually test rather than re-guess.
- **Render quality (added 2026-10-06)**: Task 8 code merged (PR #46) and real music beds merged (PR #54).
  Closes once the VPS verification run is measured against Task 8's own Quality spec and the result is added to its report.
- No other items carried forward from Sprint 3. Sprint 3 closed clean except for founder-action items
  tracked in `KNOWN_ISSUES_AND_BLOCKERS.md` (YouTube OAuth re-consent, on-device push verification),
  which this sprint's scope doesn't depend on, plus Sprint 3 Task 13 (debug bundles), recommended as
  item 0 in the build order above.
