# Sprint 4 Status: Channel Profiles, Formats & Content-Quality Configurability

**Sprint status**: Not started. All 8 items below (6 numbered backend tasks + 1 frontend task + 1
hardening item) are task docs only — none have been implemented yet. This sprint is a deliberately
scoped-down implementation of the "Channel-agnostic content & channel setup requirements (v3)" proposal
(produced by a separate content-analyser session against this same Project), sized for the founder's
actual near-term plan: solo use for 2-3 weeks to judge whether individual channels/formats are worth
continuing, before opening the app to other testers.

**A firm rule this sprint's task docs follow**: nothing here is deferred just because it depends on
something else that doesn't exist yet — where a feature genuinely needed a prerequisite (real approver
identity for `{editor}` credit), the prerequisite became its own task (Task 4), and the feature that
needed it ships for real in the very next task (Task 5), not as a placeholder. Deferrals that remain in
this sprint (AI-drafted/guided channel setup, a DB-backed no-deploy-editable format table, version
diff/rollback) are genuine scope-size decisions, not dependency gaps — each is named explicitly below,
not silently dropped, and none of them block anything else in this sprint.
**Last updated**: 2026-09-25 (sprint restructured: Task 4 inserted as the ReviewLog-identity
prerequisite; former Task 4 → Task 5 with `{editor}`/`{sources}` now built for real, not deferred, plus
a new R18 for explicit upload-time `madeForKids`/`categoryId`/`defaultLanguage`; former Task 5 → Task 6;
former Task 6 → Task 7; a new hardening item added for the thumbnail-403/phone-verification
investigation).

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Channel Profile Model + Shared Resolver | Not started | — | `ChannelProfileVersion` model, `Channel.activeProfileVersionId`, `PipelineRun.profileVersionId`, `resolveChannelConfig()` (run override → format → profile → legacy `Channel` fields → platform default). Foundation every other backend task in this sprint reads from. Packaging sub-schema now also carries `selfDeclaredMadeForKids`/`categoryId`/`defaultLanguage` (R18, consumed by Task 5). |
| 2 | Script-Side Pipeline Capabilities | Not started | — | Raw-brief + fact policy, `sources[]` on creation options, dynamic target length (not byte-identical to today's fixed 30-60s framing — flagged), banned openers/endings, `styleGuideViolations` review field + fixing the existing gap where `factualConcerns` was never actually surfaced at Gate 1. |
| 3 | Visual-Side Pipeline Capabilities — Style Prompts, Dynamic Still Count, Safety Negatives | Not started | — | Style/negative-prompt injection ahead of `generateStills`, `desiredStillCount` clamped 3-20, an off-by-default safety-negatives flag. Opens with an explicit Ken-Burns regression-risk warning (Sprint 2 Task 2's own double-frame-multiplication bug) and requires a real regression run against that task's own baseline numbers before merge. |
| 4 | ReviewLog Approver Identity — Editor Attribution Plumbing | Not started | — | New: `ReviewLog.approvedByUserId`, threaded from `ctx.userId` through `resolvePendingApproval`/`NotificationChannel.requestApproval`/`Gate1Outcome`/`Gate2Outcome` down to all five `insertReviewLog` call sites in `state-machine.ts`. Exists specifically so Task 5's `{editor}` credit is real data, not a placeholder — built as its own task rather than deferred alongside the feature that needs it. |
| 5 | Packaging From Profile — Title/Description/Hashtags + Editor & Source Credit + Upload Compliance Fields + Repeat-Topic Warning | Not started | — | Title/description/hashtag guidance from the profile; real `{editor}`/`{sources}` credit lines (Task 4's data — no longer deferred); new R18: `status.selfDeclaredMadeForKids` (always explicit, default `false`) and `snippet.categoryId`/`defaultLanguage` sent on every real upload instead of left to YouTube/channel defaults; a non-blocking repeat-topic warning appended to the Gate 1 message. |
| 6 | Format Library + Channel Setup API (Backend) | Not started | — | Static, in-repo 9-format manifest (`studio/src/formats/manifest.ts`), a `formatKey` precedence level in the resolver (run override → format → profile → legacy → default), `channels.listFormats`, `runs.create`'s `formatKey`. Advanced-path API only — AI-drafted/guided setup explicitly deferred (see Scope note). |
| 7 | Channel × Format Comparison Dashboard | Not started | — | New `dashboard.comparison` procedure + `app/app/(app)/compare.tsx` — real side-by-side channel/format totals, zero-data channels shown not omitted. Deliberately pulled forward ahead of Tasks 2-5 in this sprint's actual build order (see its own Additional Notes) since it's parallelizable and most directly answers "is this worth continuing" — no real ad-revenue figure exists yet (YouTube Partner Program thresholds won't be hit in the founder's own 2-3 week window), so this is explicitly a views/likes/comments/retention proxy view, not a P&L. |
| Frontend 1 | Channel Profile Setup Screen (Advanced) + Format Picker | Not started | — | New `app/app/(app)/channel/[id]/profile.tsx` (raw-fields form, no wizard, now including R18's made-for-kids/category/language fields), a format picker folded into `new-brief.tsx` with Freeform preserved as the zero-extra-taps default, a read-only platform-guardrails block, and a version-history list (no diff/rollback yet). Depends on backend Tasks 1 and 6. |
| Hardening | Thumbnail 403 — Link to Phone Verification | Not started | — | Not a numbered task (same posture as Sprint 3's tenant-check hardening doc). Resolves the real, still-open Sprint 2 Task 5/H1 custom-thumbnail `403` by testing the concrete hypothesis that it's a channel phone-verification/Studio feature-eligibility gap — distinct from `longUploadsStatus`, which that report already found doesn't gate it. Founder action (complete phone verification via Studio's own Feature Eligibility page) + a real re-test, not a code rebuild. |

## Full detail
Task docs: `docs/execution/sprint4/tasks/task1.md` through `task7.md`,
`docs/execution/sprint4/tasks/frontend-task1.md`,
`docs/execution/sprint4/tasks/hardening-thumbnail-phone-verification.md`.
Per-task reports (written as each task is actually implemented): `docs/execution/sprint4/reports/task1.md`, etc.

## What this sprint deliberately defers (named, not silently dropped — genuine scope decisions, not dependency gaps)
- **AI-drafted channel-profile setup** (source proposal R22's first path — a short description → a
  drafted profile) — real, separable scope once testers besides the founder are actually onboarding
  themselves; building it for an audience of one is the over-scoping this sprint is explicitly trying
  to avoid. See Task 6's Scope note.
- **Guided, multi-step setup wizard with example galleries** (R22's second path) — same reasoning as
  above. See Task 6's Scope note.
- **Format library as a DB-backed, no-deploy-editable table** — the source proposal's "admins can add
  formats without a deploy" is a real requirement once non-technical people manage the format list, not
  yet; Task 6 ships a static, in-repo, typed manifest instead, matching this codebase's own established
  `audio-bed/manifest.ts` pattern.
- **Version diff/rollback on the channel profile screen** — Frontend Task 1 ships a version-history
  *list* only; diffing and rollback are real, separable UI scope for once there's actually more than a
  handful of versions to compare.
- **Real ad-revenue/profitability figures in the comparison dashboard** — not available from YouTube's
  API until a channel clears Partner Program monetization thresholds (1,000 subscribers + either 10M
  Shorts views in 90 days or 4,000 watch hours), which won't happen in the founder's own 2-3 week
  testing window. Task 7 is explicitly a views/likes/comments (and, once unblocked, retention/watch-time)
  proxy view, not a P&L — stated plainly in its own report so it isn't mistaken for one.

**No longer deferred, as of this restructuring**: `{editor}`/`{sources}` packaging credit fields were
previously listed here as deferred pending a `ReviewLog` schema gap. That gap is now Task 4, built as
its own task specifically so Task 5 can ship the real feature instead of a placeholder — see Task 4/5's
rows above.

## Open items this sprint is expected to touch
- The real, still-open Sprint 2 Task 5/H1 custom-thumbnail `403` — picked up by this sprint's hardening
  item, above, with a concrete phone-verification hypothesis to actually test rather than re-guess.
- No other items carried forward from Sprint 3 — Sprint 3 closed clean except for founder-action items
  tracked in `KNOWN_ISSUES_AND_BLOCKERS.md` (YouTube OAuth re-consent, on-device push verification),
  which this sprint's scope doesn't depend on.
