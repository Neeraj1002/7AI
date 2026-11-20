# Ideas from the youtube-agent-skill repo (MIT, Jake Schincariol, 2026)

Written 2026-11-03. Docs only: no code from the repo is in 7AI today, and nothing here is scheduled until the founder confirms the "Next sprint (proposed, quality-first)" section of `execution/sprint6/PLAN.md`.

## Reading the evidence

- **Reported** means the backend agent's audit of 3 Nov 2026 said so. This doc did not re-read the repo, rerun its scripts or reproduce any result.
- **Inferred** means our own reasoning from those reports plus what the 7AI docs say. Every verdict below is Inferred.
- The "7AI equivalent" column comes from the 7AI docs (plan, STATUS, audit of 14 Oct), not from a fresh code read, so a name there is a pointer, not proof the code matches.

## Pieces tracked

Every piece the audit listed is here, whether or not 7AI already has an equivalent.

| Piece | 7AI equivalent | Verdict | Note |
|---|---|---|---|
| `hooks.json` (hook formulas) | Curiosity devices in P1 packaging (stake, scale, mystery, correction, how, person, countdown); the hook rule in the channel direction (P16) | Later: borrow 4 to 5 structures | Reported: the formulas risk invented figures and assume a human presenter. Inferred: take only the structures, written as new curiosity devices with neutral examples (no figures, no on-camera host), and put them through the existing honesty guard |
| `hookscore.py` (hook scoring) | None; Script Review checks the hook against rules, not a score | Skip as a gate | Reported: it ranked a finance hook above the Mary Celeste opening. Inferred: a score that prefers the wrong opening must not block or approve anything. Plan rule stands: plain code decides verdicts, models give advice |
| `title.py` (title checks) | Three title angles per video and the honesty guard (P1) | Adopt a subset, advisory | Inferred: display-only checks that cannot fail a run: about 40 characters visible on a phone, all-caps words, vague words. No "no number" fail, because a title with no number is often right |
| `retention.py` (retention analysis) | Retention curve stored per snapshot (`PerformanceSnapshot.retentionCurve`); performance report (P21), not built | Reimplement in TypeScript, advisory | Reported: the script misreads 0 to 1 ratio data, so it cannot be ported as is. Reported: 34 videos have curves; the top video has 1,637 views. Inferred: show the view count beside every curve, and act only on patterns that repeat across videos, never on one video. Task starts when more videos pass about 1,000 views |
| `swipe.py` and `yt-viral` | None; competitor analysis is by hand (`docs/competitor_analysis`) | Later | Inferred: needs competitor ingestion, which 7AI does not have. Revisit after the performance report |
| `deadair.py` and `yt-edit` | None needed | Skip | Inferred: it removes ums and pauses from a recorded human voice; 7AI's narration is text to speech and has no ums |
| `chapters.py` and `yt-chapters` | Chapter rules enforced in code (`chapterBounds`, chapter limits sent by the server) | Skip | Inferred: 7AI already enforces the rules |
| `yt-seo` | Search words in titles noted as Gap D in the plan (P1, P17) | Later | Inferred: only matters for search-led channels such as a utility channel; wait for the first one to publish |
| `yt-shorts` (clipping long video into Shorts) | Shorts are written as Shorts, not cut from long videos | Later | Inferred: a possible format later; no owner today |
| `yt-comment` | Pinned comment and first reply as publish extras (P11, not built) | Later | Inferred: look at it with P11, after comments exist in the flow |
| `yt-script` | Script writer and Script Review (SR rules) | Skip | Inferred: 7AI covers it |
| `yt-package` | Curiosity packaging (P1) | Skip | Inferred: 7AI covers it |
| `yt-plan` | The brief and Gate 1 | Skip | Inferred: 7AI covers it |
| `yt-audit` | Run diagnostics (Sprint 5), Video Review, the 14 Oct audit | Skip | Inferred: 7AI covers it |
| `templates/voice.md` | Channel direction and content profile (`decisions/PROMPT_LAYERS.md`) | Skip | Inferred: 7AI covers it, and layer rules say one owner per question |

## What the repo does not help with

Inferred from the audit's list of pieces: nothing in the repo helps with the things 7AI's quality most depends on.

- **Visual and character continuity** (the 14 Oct audit's R4: a recurring subject changes look between shots).
- **Stills presented as video** (the audit's finding that the prompt and renderer treat stills as video).
- **Narration** (voice choice, delivery, and the `tts-1-hd` and `whisper-1` shutdowns).

These are planned in the proposed next sprint; none comes from this repo.

## Licence

The repo is MIT, "Copyright (c) 2026 Jake Schincariol" (Reported; the licence file was not re-read for this doc). If any code is ported:

1. Add a root `THIRD_PARTY_NOTICES.md` with the full MIT text and the line "Copyright (c) 2026 Jake Schincariol".
2. Put a source header in each derived file naming the repo, the original file and the licence.
3. Ideas, structures and checks reimplemented from scratch need no notice, but note the source in the task doc.

`THIRD_PARTY_NOTICES.md` does not exist today, and this PR does not create it.

## Not verified

- Everything in the Reported rows: the repo itself, its scripts, the hookscore ranking, the 34 videos and the 1,637 view figure.
- The "7AI equivalent" column against current code.
- The MIT licence text and copyright line in the repo.
