# Task 5: Puzzle & Reveal and unified Explainer

**Draft; not eligible for rollout.** Branch `feature/puzzle-industrial`, worktree `.worktrees/puzzle-industrial`, based on `577c3a8`, the Task 4 B+C integration, descended from `cad5b6c`. Both integrated prompt infrastructure and `channel-direction/layers.test.ts` are present. This work changes Layer 3 catalog text and the existing profile disclosure; it does not merge the prerequisite or deploy, publish or change a production profile. Offline provider spend: $0. No audience-retention result is claimed.

## Catalog and compatibility

Picker order and versions: History documentary (`history` v1), Story first (`story-first` v1), explainer (`explainer` v1), Neutral (`neutral` v1), Puzzle & Reveal (`puzzle-reveal` v1). The Explainer and Puzzle values match Task 5's proposed tables and the machine-read decision document; no copy deviation is intended. The draft-only `industrial-explainer` entry is removed, with no alias or backfill. The founder approved both preset texts on 27 Nov 2026 and requested the exact picker label `explainer` without a version suffix.

**Production status:** The founder confirmed on 27 Nov 2026 that no app in production has a preset selected. Historical profiles and runs have not been independently checked. The worktree contains no database configuration beyond `.env.example`, and no production database was queried. The earlier Task 4 report proposes an Explainer assignment, but does not establish whether any profile versions, runs or resumable runs actually use it. We likewise cannot establish whether the draft-only `industrial-explainer` key was saved outside disposable fixtures. Check all historical profile versions and runs, including resumable runs, for both keys before rollout. If either is used, or production usage cannot be verified, revisit the compatibility decision before release. A saved old Explainer profile does not archive its old copy, so changing v1 in place would change its resolved prompt. This draft intentionally rejects the removed draft key; it must not be deployed where such profiles or runs exist without a compatible decision.

## Implementation and offline evidence

- `studio/src/channel-direction/presets.ts` and `docs/decisions/PROMPT_LAYERS.md` carry identical five-entry catalog data. `CreationOptionsSchema` shares the preset tuple with profile validation. Optional note, strict schema, note limit, server-owned tags and existing settings remain in use.
- `app/app/(app)/channel/[id]/profile.tsx` and `app/components/DirectionCard.tsx` retain the existing draft's folded Creative direction section, server-supplied label, dirty indicator and discoverable save feedback. Inner disclosures remain independent. A real screen interaction has not been performed; static card tests do not establish tap, accessibility activation, folding through save, feature-flag or warning behavior in the running app.
- Mocked API round trips save and reopen Puzzle and Explainer with and without a note. They test invalid profiles, overlong notes and cross-tenant access. New run and resolved-config tests exercise both keys and a resumed Puzzle profile after a changed Explainer profile. They do not prove a complete rerun sequence against the actual persistence layer.
- Prompt goldens against `577c3a8`: 15 existing Explainer prompt entries changed, 19 Puzzle entries added, and no baseline entries removed. History, Story first and Neutral prompt entries are byte-identical. The integrated consumers exercise Short and long writer/reviewer prompts, planners and still/frame reviews. Both formats and note present/absent are checked. Three controlled process, causal-service and hybrid examples verify brief and channel-note delivery, not generated-script quality.
- Normal and recovery checkpoint regression suites run offline; the complete requested paired direction-change scenario through both paths remains unverified. No new paid calls, prompt consumer, format or channel settings were added.

## Offline check results

- Focused studio suites including creation, retry and checkpoint regressions: 135 passed, 6 database integration tests skipped. A placeholder database URL was used for configuration only; no production database was queried.
- App DirectionCard and direction helper suites: 22 passed. Studio typecheck and build, and app typecheck passed.
- Catalog and decision document equality, all-part lint, and the five-key order are covered by tests. Independent comparison against Task 5 confirms both tables exactly; the three unchanged preset records match `577c3a8`.
- `git diff --check` passed. The golden file reports Git's normal LF-to-CRLF warning.

## Creative and product gates

| Fixture | Outcome; script line and intended visual | Timestamps, observations, retries, spend |
|---|---|---|
| Badge deduction | Not generated or inspected | None; 0 retries; $0 |
| Token transaction | Not generated or inspected | None; 0 retries; $0 |
| Room layout | Not generated or inspected | None; 0 retries; $0 |
| Shared sorter, Puzzle vs Explainer, both lengths | Not generated or inspected | None; 0 retries; $0 |
| Library, process and causal treatments; hybrid | Prompt delivery only; no generated lines or visual | None; 0 retries; $0 |

The negative editorial and picture cases, channel-specific actual request captures, blind reader, Gate 1 script review and complete target-size Gate 2 cuts remain unverified. No clue visibility, captions, crop, frame-zero replacement, causal handoff or audio timing can be certified from these tests. Record each expected clue or state and its setup/payoff timestamps against actual frames; sampling alone cannot certify an unseen beat. A live evaluation needs a priced matrix including retries and explicit owner authorization under a numeric ceiling. The proposed $12 is not an authorization; Task 4's separate $6 is reserved for its own campaign.

## Rollout and rollback

The independent Task 4 R5 production assignment verification and R8 baseline/branch evaluation remain outstanding as recorded in the Task 4 report. Before exposure, resolve those obligations, both-key persistence compatibility, screen interaction and the creative/rendered-cut gates. Deploy reader support to every API and worker before allowing selection. If Puzzle has been saved, `577c3a8` cannot read it and is not a safe rollback; use a tested compatible build that retains read support while suppressing selection if needed. If Explainer v1 has prior usage, a compatible handling of old copy also needs a separate decision. No compatible rollback build has yet been prepared or verified.
