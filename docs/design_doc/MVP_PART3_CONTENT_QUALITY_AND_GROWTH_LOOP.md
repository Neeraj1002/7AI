# MVP Part 3 — Content Intelligence & Growth Loop (Design Capture)

**Status**: Not in scope yet. Thinking-ahead capture, same posture as Part 2 — written so real task
files can come straight from this doc later, nothing here gets built now.
**Trigger**: a 2026-09-13 brainstorm on content quality/growth, plus the question of whether it
bundles into Part 2 or stays a separate track.
**Companion doc**: `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` — this doc assumes that one and
doesn't repeat it.

---

## 0. Recommendation: three tracks, not two

Part 2 already splits into two independent tracks (§0's own framing: "could become separate tracks").
This work is a genuine third — not the application layer, and not entirely the flexible-creation work
either:

- **Track A — Multi-user / application layer** (Part 2 §1). Infra. Unblocks the ~10 testers.
- **Track B — Flexible & higher-quality creation** (Part 2 §2 + this doc's §1). Voice, visual style,
  sound, licensing, disclosure — all genuinely the same subsystem (Video Generation → Publishing), so
  the new items fold in here rather than becoming their own track.
- **Track C — Content Intelligence & Growth Loop** (this doc's §2). Near-zero coupling to A or B —
  touches Script Review, Performance Analytics, Publishing's metadata step, and the founder-notify
  layer, all of which already exist. Can be built independently, in parallel with A/B, or before either.

**Not now, correctly still parked with the deferred fleet agents** (§3) — don't pull these forward just
because they're on this list.

**One real sequencing dependency worth flagging** (§4) — cross-posting should ride Track A's
credential-storage work once it lands, not be built twice.

---

## 1. Folds into Part 2 §2 — not a new track

### Audio layer — picked up by Sprint 2 Task 3
No music/sound bed anywhere in Video Generation today — TTS + captions + stock footage only. Add an
`audioLayer` concept (royalty-free bed at minimum) right alongside the second visual-source backend
Part 2 §2 is already scoping — same production-planning step, same `ProductionPlan` object.

**Closed**: `ProductionPlan.audioLayer` (a real mood tag or `'none'`) picks a track from a small,
curated, self-synthesized (genuinely `CC0`) local library (`audio-bed/`,
`data/audio-beds/*.mp3`) — `generateVideo`'s FFmpeg filter graph mixes it under the narration via
`amix` at a real low weight, verified live via spectral analysis of an actual rendered output (the
bed's own frequency band measured distinctly quieter than the voiceover's, not silent, not
equal-volume). See `docs/execution/sprint2/reports/task3.md`.

### Synthetic/altered content disclosure — picked up by Sprint 2 Task 2
YouTube requires flagging "realistic altered or synthetic" content at upload. Path A (real TTS + real
stock footage) almost certainly doesn't trigger it; Path B (generative/character video) will. Publishing
needs to actually set that flag before Path B ships — a policy line item, not optional polish.

**Closed**: `UploadParams`/the real YouTube upload request now carry `status.containsSyntheticMedia`,
derived directly from `ProductionPlan.visualSource === 'ai-stills'` — real, verified two ways (a
mocked-client test asserting the actual request body, and a live stub-upload run confirming `false`
for the stock-footage path). See `docs/execution/sprint2/reports/task2.md`.

### Licensing / Content ID risk check — the lightweight half picked up by Sprint 2 Task 3
Once there's a music layer and/or a second footage or generative-video vendor, a lightweight check that
whatever's pulled in is actually licensed for monetized use — a claim or strike on channel #1 while
still proving the loop is an expensive way to learn this.

**Partially closed**: the audio-bed manifest now carries a required `license` field per track,
refused at pick time if missing (`audio-bed/client.ts`'s `pickTrackByMood`) — a manifest-integrity
check, exactly the "lightweight" scope this note asked for. Explicitly **not** a live Content-ID API
call (no such public synchronous API exists) — that remains open, logged in
`KNOWN_ISSUES_AND_BLOCKERS.md` §6, worth building the moment a non-curated source (a real music API,
a second footage vendor, user uploads) is ever added. See `docs/execution/sprint2/reports/task3.md`.

---

## 2. Track C — Content Intelligence & Growth Loop (new, independent, can start anytime)

### Retention-curve capture — code picked up by Sprint 2 Task 4, real data still gated
Performance Analytics logs views/watch-time/engagement today; add retention-graph timestamp capture
now, even though nothing reads it until Continuous Learning exists — same "cheap now, expensive to
reconstruct later" logic already applied to `ReviewLog`. This is the single highest-leverage feed for
Continuous Learning once it's built: *where* retention drops, not just whether a video did well.

**Built, not yet populated with real data**: `PerformanceSnapshot.retentionCurve` (real migration)
+ a real YouTube Analytics API client, verified against a stub matching the documented response
shape. Blocked on a real, live-confirmed founder action — the YouTube Analytics API isn't enabled
for this project's Google Cloud console yet, and the OAuth token also lacks
`yt-analytics.readonly` — see `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §1. Real data starts
flowing the moment both close; nothing else needs to change.

### Hook-first script rubric dimension — picked up by Sprint 2 Task 4
Script Review scores quality/engagement/clarity/brand/video-gen-fit. Add an explicit score for the
first 1-2 seconds against known Shorts retention patterns (cold open, no logo/intro, question or
visual surprise up front) — disproportionately what determines whether a Short survives the first swipe.

**Closed**: `ScriptReviewOutputSchema` gained `hookScore`/`hookNotes`, judged against exactly the
patterns named above. Verified live via a real paired comparison: a genuine cold-open script scored
6 points higher than a slow, logo-first-style intro on identical underlying content, with notes
explicitly naming the difference. See `docs/execution/sprint2/reports/task4.md`.

### Custom cover frame
YouTube lets Shorts carry a custom cover image, which matters wherever a Short surfaces outside the
Shorts feed (search, subscriptions, home). Metadata Generation already writes title/description/tags —
a cover-frame choice is a natural sibling output.

### Title/description A/B testing
YouTube's built-in title/thumbnail test feature is free and automatic once it has real variants to try.
Publishing can drive it directly from Metadata Generation's output — feeds Continuous Learning directly
once that exists.

### Founder daily digest
Already sketched as an easy add-on in the roadmap (§17), never built. One end-of-day summary across all
live channels instead of checking N Telegram threads by hand — worth doing as soon as there's more than
one channel.

### Post-hoc "why didn't it work" tagging
`ReviewLog` captures pre-publish verdicts only. Add a cheap manual tagging step for the founder's own
post-hoc read on an underperforming video ("weak hook," "topic already saturated," "bad thumbnail
frame") — much richer training signal for Continuous Learning than raw metrics alone.

---

## 3. Stays deferred with the fleet agents — don't pull forward

### Posting-time & cadence optimization
Needs real audience-activity history to reason about. Genuinely gated on Continuous Learning existing,
not just on Track C shipping.

### Trend-to-publish latency as a first-class metric
Only meaningful once Trend Identification exists and there's an actual "topic started rising" timestamp
to measure against. With human-supplied briefs, there's nothing to measure latency from yet.

---

## 4. Sequenced later, not blocked, not now

### Cross-posting / `PublishTarget`
The script/TTS/footage pipeline is most of the way to a TikTok/Reels-ready asset already.
`Channel.platform` anticipates this at the schema level. Real dependency: build this *after* Track A's
per-user, per-channel OAuth/credential storage lands — a second platform's credentials should reuse
that pattern, not get built ahead of it and redone later.
