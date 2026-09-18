# Sprint 2 Task 5: Custom Cover Frame + Title/Description A/B Testing (Investigation)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Give Publishing a real custom-cover-frame step, and resolve the title/description
A/B testing item from `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2 with a real, evidence-based
decision rather than silently carrying it forward unexamined.
**Duration**: 4-6 hours.
**Depends On**: None functionally (Track C, same "near-zero coupling to Track B" posture Task 4
established) — sequenced after Task 4 only because both touch Publishing/Script-Review-adjacent
code and this keeps one PR's diff coherent.
**Owning Component**: Publishing (`agents/publishing/`), design docs
(`MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md`).
**Success Criteria**: (1) A real published video gets a real custom thumbnail set via the YouTube
Data API's `thumbnails.set`, confirmed via a direct API read-back, not just a 200 response. (2) A
thumbnail-set failure never fails the publishing stage or undoes the already-successful video
upload. (3) The A/B-testing item is closed with a real, cited reason — not dropped silently, not
built on a guess.

## Task Requirement

### H1 — Custom cover frame
**Where**: `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2: "YouTube lets Shorts carry a custom
cover image, which matters wherever a Short surfaces outside the Shorts feed (search, subscriptions,
home, channel page, embeds). Metadata Generation already writes title/description/tags — a
cover-frame choice is a natural sibling output." Confirmed live before starting: the real API is
`thumbnails.set` (`POST .../upload/youtube/v3/thumbnails/set?videoId=...`, raw image bytes as the
body), and it requires a **phone-verified channel** — checked live against this project's real
channel (`channels.list?part=status`): `longUploadsStatus: "eligible"`, confirming the channel *is*
verified, so this is genuinely buildable, not blocked on a second founder action.

**Fix**: `PublishingMetadataSchema` gains `coverFrameTimestampRatio: z.number().min(0).max(1)` —
same "extend the existing cheap-tier call, don't add a new one" principle Week 5 Task 4's C3 and
Sprint 2 Task 4's G3 already established, since Metadata Generation's own LLM call already reasons
about the script/content and is well-placed to also judge which moment makes the strongest cover
(matching a hook beat, a clear visual, not a mid-blink/transition frame). After a successful upload,
extract the real frame from the rendered video at `coverFrameTimestampRatio × durationSeconds`
(same ffmpeg `-ss X -frames:v 1` technique Video Intelligence's own sample-frame extraction already
uses) and call the real `thumbnails.set` endpoint with it — only `youtube-client.ts` touches the
API, same boundary every other provider call in this project already holds.

**Failure isolation**: a thumbnail-set failure (transient network blip, a real API error) must
**not** fail the publishing stage or imply the video upload itself failed — the video is already
live at that point; a missing custom thumbnail is a real but non-blocking gap, not a launch
blocker. Same "isolated, non-blocking, logged" design Sprint 2 Task 4's G2 established for
retention-curve capture, for the same underlying reason (a secondary capability's failure must
never regress a primary one that already works).

**Verify**: a real end-to-end run (a fresh, private test upload — never the founder's existing real
public video) confirms `thumbnails.set` succeeded via a direct `videos.list?part=snippet` read-back
showing the real, uploaded custom thumbnail URL, not just trusting a 200 response. Separately,
confirm a forced thumbnail-set failure doesn't affect the publishing stage's own success or the
video's already-completed upload.

### H2 — Title/description A/B testing: investigate first, don't build blind
**Where**: `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2 proposed this as buildable: "YouTube's
built-in title/thumbnail test feature is free and automatic once it has real variants to try.
Publishing can drive it directly from Metadata Generation's output." This task's own job is to
verify that's actually true before writing any code against it — this project's own culture
(`KNOWN_ISSUES_AND_BLOCKERS.md`'s entire existence) is built on not assuming a design doc's original
capture is still accurate once someone actually checks.

**Investigate**: confirm, against real, current documentation, (a) whether YouTube's title/thumbnail
A/B test feature has any programmatic API surface at all (`videos.update` or otherwise), and (b)
whether it's available for the content type this project actually produces (Shorts).

**If not viable as scoped**: close the item with a real, cited reason in
`KNOWN_ISSUES_AND_BLOCKERS.md` and `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` — don't build a
stub or a partial version of something that turns out structurally inapplicable to this project's
actual content type. State plainly in the report if this item turns out to require a real design
change (e.g., a different, non-native A/B mechanism) rather than the original recommendation.

## Schema Impact
No new tables or columns. `coverFrameTimestampRatio` is stored inside the existing
`PipelineStage.output` Json (`publishing` stage's existing `metadata` field) — no migration needed.

## Business Logic / State Transition

### What this task implements
A new, isolated follow-up step inside the existing `publishing` stage, after the existing
`videos.insert` upload succeeds — no new state, no new transition. A thumbnail-set failure is caught
and logged, never allowed to change the stage's own success/failure outcome.

### Failure Modes & Handling
`thumbnails.set` failures are classified the same way `mapGoogleError` already classifies upload
failures (transient network-establishment errors vs. everything else), but unlike the video upload
itself, a non-transient thumbnail failure is **not** escalated to `needs_attention` — it's logged
and the run proceeds, since the video itself already published successfully and a human doesn't
need to intervene in the pipeline over a missing custom thumbnail.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus H1's real live upload + read-back verification, and a forced-failure isolation check.

### Documentation reconciliation
- `docs/execution/sprint2/SCHEMA.md` ("no schema changes this task"), `BUSINESS_LOGIC.md`, `STATUS.md`.
- `docs/design_doc/MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md`: mark the custom-cover-frame item
  picked up; resolve the A/B-testing item with whatever H2's investigation actually finds.
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: reflect H2's real finding.

## Report Template
`execution/sprint2/reports/task5.md`, standard shape. State H2's investigation finding plainly,
even if (especially if) it means the original design-doc recommendation doesn't hold up.
