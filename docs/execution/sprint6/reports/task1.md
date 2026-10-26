# Sprint 6 Task 1: Curiosity Packaging

**Date**: 2026-10-26
**Status**: PR A complete and ready for review (#116). PR B (picture checks) code-complete, PR #124 on `main` and ready for review (PR A merged as #116). PR C (opening, record, final sweep) not started.
**Branch / worktree / PR (PR B)**: `SPRINT6_TASK1B_BE` · `D:\Study Material\7AI-SPRINT6\task1b` · [PR #124](https://github.com/Neeraj1002/7AI/pull/124) (base `main`, ready for review)
**Branch / worktree / PR (PR A)**: `SPRINT6_TASK1A_BE` · `D:\Study Material\7AI-SPRINT6\task1a` · [PR #116](https://github.com/Neeraj1002/7AI/pull/116)
**Task doc**: r7. Already on `main` (via the architect's docs PR #119) and byte-identical to the source in `D:\Study Material\7AI\docs\...` apart from line endings (compared with CRLF removed, same md5), so no `_DOC` commit was needed (Hard rule 5). My first branch was cut when r6 was current and I built part of it (a per-channel thumbnail setting, medium quality, a typeface download) before r7 arrived; I discarded all of that uncommitted work when r7 landed, and said so at the time.
**Files**: 53 created, 17 modified against `main` (the task doc is not among them)
**Tests**: studio 1,602 pass (65 skipped, as before), app 191 pass, type check and lint clean on both.
**Spend**: $0.53 of the $2.00 live-check ceiling (section 5).

---

# PR A (`SPRINT6_TASK1A_BE`): R0, R1, R2, R3, R5, R6

## 1. R0: what the code really is

Read on `origin/main`. C = confirmed, W = wrong (an assumption of an older doc, of this task or of my own first R0), U = unknown.

| # | Question | Result | Where |
|---|---|---|---|
| 1 | Image generator and price | **C.** OpenAI `gpt-image-2.5-flare-2026-09-08`, quality `low`, 1536x1024 (3:2), so a thumbnail is a centre crop to 16:9. **Measured in this task: $0.0063 to $0.0068 per image at `low`** (16 images in live runs); the R0 probe showed medium $0.0108. r7 says stay at `low`; I did. The unit price the run estimate uses is the pricing table's flat $0.005 fallback. | `ai-visuals/registry.ts`, `client.ts`, `scripts/thumbnail-price-check.ts` |
| 2 | Registry model that reads images | **C for Haiku 4.5** (attachments feed `video-intelligence-own-draft`). **U for Sonnet 5.5.** Needed only for PR B. | `llm/types.ts`, `llm/registry.ts` |
| 3 | New LLM purposes | **C.** A purpose needs a `PURPOSES` entry, a `LLM_REGISTRY` entry (model, limit, reasoning), a canary step and the config test. Added `packaging-brief` (Sonnet 5.5, 4,000), `packaging-concepts` (Sonnet 5.5, 8,000), `packaging-cold-reader` (Haiku 4.5, 4,000); canary step `packaging S-1`; test pins the limits. The critic and payoff purposes are PR B's. | `llm/types.ts`, `registry.ts`, `canary.ts`, `registry.config.test.ts` |
| 4 | Where packaging data can live | **W (my first R0 said "no migration needed").** `pipeline_stages.stageName` has a **database CHECK constraint** (migration `20260907122134_foundation_schema`), so a stage of its own named `packaging` would need a migration. Existing storage still holds it safely: the **Gate 2 stage row's JSON `output`** (`output.packaging`). That row survives a restart (the gate is re-opened on the same running row), is the row publishing already reads, and a Revise's new Gate 2 row takes the finished packaging over from the old one (same script), so nothing is paid twice. **No migration, no schema change.** A dedicated stage would need the migration and would touch `nextStageAfter`, the app's labels and resume logic in about 40 files. | `schema.prisma`, `migrations/.../migration.sql:145`, `run-pipeline/packaging-stage.ts` |
| 5 | Run and profile JSON | **C.** `creationOptions` is run bookkeeping that every list returns, so big packaging JSON does not belong there. Profile JSON is `.strict()`; r7 forbids any new setting, so **no profile field was added**. | `types/pipeline.types.ts`, `channel-profile/schema.ts` |
| 6 | Where the title is made | **W for Gate 2.** The title was generated **inside `publishing`, after Gate 2**; no title existed at Gate 2. Packaging now runs when Gate 2 opens and publishing uses the chosen title. | `state-machine.ts` (`runGate2Stage`, `runPublishingStage`) |
| 7 | Current title fact check | **C, narrower than R2 needs.** `checkMetadataClaims` checks figures (SR-1) and hedges (SR-8) in title, description and tags. It does not check scenes, "untold" words, badges or limits. All of those are new and in code (`packaging/check.ts`). `checkMetadataClaims` stays the one owner of the figure rule and packaging calls it. | `agents/publishing/metadata-claims.ts` |
| 8 | Cover today | **C.** Frame grab (`extractCoverFrame`) then `thumbnails.set`; follow-up state in the server-only publishing receipt; hard-coded `image/jpeg`; 2 MB limit on YouTube's side. The app had no reference to `coverFrameSet`. | `publishing/index.ts`, `youtube-client.ts` |
| 9 | Gate 2 contract and restart | **C.** `runs.gate2` approve/reject/revise resolves an in-memory pending approval; a restart re-opens the same running `gate2` row. So the choice is written to the database in its own call (`runs.choosePackage`) before approve. The run stays `paused_gate2` while packaging is made (about a minute); Approve during that minute gets the existing "not currently pending" message, and the app says packaging is being made. | `api/routers/runs.ts`, `state-machine.ts` |
| 10 | Ownership and tenants | **C for tRPC, W for the three older REST file routes.** `get`, `progress`, `getVideoUrl` and the gates check the tenant (`assertGateOwnership`). `GET /runs/:id/video`, `/preview` and `/subtitles` do **not**: the global hook only checks a session exists. The new thumbnail route checks the tenant (section 7, finding F1). | `api/video-route.ts`, `api/server.ts`, `gate-ownership.ts` |
| 11 | Where the run cost estimate is built | **C.** `estimateRunCost` (`run-pipeline/cost-estimate.ts`), used by `runs.create` and preflight. Packaging is now inside it for long videos: **$0.07 to $0.08 per video** ($0.0697 at 2 minutes, $0.0767 at 10 minutes; three images plus the brief, concepts and cold reader), counted once because a Revise reuses it. | `cost-estimate.ts`, `cost-estimate.test.ts` |
| 12 | Designer screens for Gate 2 packages | **Not found.** No design file in the repo mentions these screens. Built on the existing Gate 2 layout and stopped before polish, as r7 says. Spacing and wording in `PackageCards.tsx` are a first pass. | `app/components/PackageCards.tsx` |
| 13 | Face and typeface rules in existing profiles | **C.** The only existing profile text (NIYT's) says faces are small, in shadow or turned away, and its negative prompt forbids sharp faces and all text. The thumbnail uses the profile's style text and **not** the stills negative prompt (spike finding), with the platform safety clause on. Faces come from the script, typeface from the brief's mood (below). No setting. | `docs/channel_bibles/NIYT_CHANNEL_CONFIG.md`, `packaging/prompts.ts` |
| 14 | Lettering in code | **C.** No image library existed; added `@napi-rs/canvas` 1.0.13 (what the spike used) and the three OFL fonts (Anton, Playfair Display Black, Cinzel Black, with licences) under `studio/data/fonts/thumbnails/`. | `packaging/lettering.ts` |
| 15 | Shorts | **Out of PR A, per r7 decision 2.** Packaging runs only for long videos. A Short keeps today's behaviour (frame-grab cover) until PR C builds its title, hook line and frame zero. YouTube's help page: custom Shorts thumbnails are added in Studio on a computer only. | `packaging-stage.ts` |
| 16 | Retention and impressions (PR C) | Fields exist in `performance-snapshot.types.ts` and the analytics client; not checked against a live channel. Unchanged from the first R0. | PR C |

## 2. What was built

**R1 brief** (`packaging/generate.ts`, `prompts.ts`): one registered call reads the approved script (a long script with its chapter numbers) and the channel's title guidance. It returns what people believe, what the record says, the gap as the question, the stake, the one thing to look at, a device, where the script answers it (a quote copied from the script, verified in code; a brief whose quote is not in the script gets one repair try and then becomes a plain "weak gap"), the subject kind, a typeface mood, the first-seconds promise and an optional correction quote.

**Faces and typeface** (derived, never configured): `iconic-thing` gets no face, `named-person` and `anonymous-person` an imagined anonymous face, `no-focal-subject` an anonymous figure from behind, in profile or in shadow. The typeface comes from the brief's mood (`stakes` Anton, `editorial` Playfair Display Black, `historic` Cinzel Black), stored with the package.

**R2 six concepts, three kept**: one call writes six concepts (title, thumbnail concept, question, answer place, supporting quote, the props in the picture, named people). **Code validates first** (`packaging/check.ts`): title length against the channel limit (read from its title guidance; neutral 70; YouTube's 100), lettering at most 4 words and subline at most 5, fake badges, "untold/really/secret/banned" and similar unless the brief's correction quote is in the script, figures and hedges through the existing `checkMetadataClaims`, the answer quote and the picture-support quote in the script, **every prop in the picture named by the script** (the spike's invented toy), named people not living and in the script, lettering not repeating the title. A failed concept is dropped with its reasons and never repaired. A text-only cold reader (Haiku) then ranks the survivors, drops a title that gives its answer away, and the best three are kept, preferring different devices.

**R3 render**: image prompt = concept + face rule + the profile's style text + the platform safety clause (no logos, marks, readable text or real people), no stills negative prompt; quality `low`; 1536x1024 centre-cropped to 1280x720. Lettering is drawn in code (`lettering.ts`): fitted by trying every line break at the largest size that fits, a scrim, outline and shadow, bottom-right left clear for YouTube's own duration chip, never a chip or badge. The zone is the concept's, moved to the calmest part of the picture when that part is clearly busier. Feed (360 px) and sidebar (170 px) previews are written; a package whose main lettering is under 12 px tall at the sidebar size is dropped; a subline that cannot stay 36 px at full size (about 4.8 px at the sidebar size) is dropped. Two or three are rendered: three only when the run's spend limit leaves room for three images (`imagesAllowedBySpend`), else two, else none.

**Storage and restart**: `output.packaging` on the Gate 2 row (section 1, row 4); every paid step is booked as its own usage row as it happens (`packaging-brief`, `packaging-concepts`, `packaging-cold-reader`, `packaging-thumbnail`); the brief and concepts are checkpointed so an interrupted attempt does not pay again; images use a per-run cache. Files are written to `studio/data/thumbnails/<runId>/` (about 1 MB per run). **Not copied to R2** (see open decisions).

**R5 Gate 2**: `runs.packaging` (tenant-checked view: question, answer place with the current chapter time, cold-reader note, device, dropped ideas with reasons, choice; no file paths or prompts) and `runs.choosePackage` (owner-checked; saves the choice on the open Gate 2 row before anything is approved; an edited title goes through the same title checks and is refused with the reasons). Pictures come from `GET /runs/:id/thumbnail/:packageId/:size` with a tenant check, or from a one-hour **signed link** minted by `runs.packaging` (so the app, the system browser and a download work without a header). App: `PackageCards` shows each option as a feed-style card (picture, duration chip drawn by the card, title, channel, "Viewers will ask: ...", "Answered at: ...", cold-reader note, editable title with a character counter, "Use this one", "Keep YouTube's suggested thumbnail", small sizes and download) on the Gate 2 screen of a long run.

**R6 publishing**: the title the founder chose is the one published (the model still writes the description and tags; the figure check still runs on the whole). The chosen file goes to the existing `thumbnails.set` boundary (`thumbnail-followup.ts`): a refusal leaves the video published, `coverFrameSet` false, the real reason in `coverFrameMessage`, the file on disk and downloadable, and the follow-up marked `uncertain` (never retried by itself); a file over 2 MB is refused before any call; "keep YouTube's thumbnail", no choice, and no options all upload nothing and say so. The stage output carries `thumbnail: { source, packageId, file }`; the app's "Thumbnail" card says "Your chosen thumbnail is live" only when `coverFrameSet` is true. A run with no packaging (a Short, Gate 2 switched off, an older run) keeps the frame-grab path unchanged.

## 3. The packages (real, from the live runs; three sizes each)

Full-size, feed (360 px) and sidebar (170 px) files for each are in `task1-assets/`. Main lettering was 24 to 27 px tall at the sidebar size on the Eiffel set and 14 to 20 px on the others (limit 12).

| Package | Title | Lettering | Device | Files |
|---|---|---|---|---|
| Eiffel c2 | "Eiffel's Tower Was Never Meant to Last. Why Is It Still Here?" | BUILT TO VANISH / The 1889 World's Fair | correction | `eiffel-c2-{full,feed,sidebar}.jpg` |
| Eiffel c6 | "Eiffel Turned a Tower Into a Tool. How Did That Save It?" | SAVED BY SCIENCE | how | `eiffel-c6-...` |
| Eiffel c4 | "How Do You Build the Tallest Thing on Earth in Two Years?" | TALLEST ON EARTH / Built in 1887 to 1889 | how | `eiffel-c4-...` |
| Mary Celeste c2 | "The one boat missing from the Mary Celeste" | THE EMPTY DECK / One boat gone | mystery | `mary-c2-...` |
| Mary Celeste c6 | "The afternoon the Dei Gratia met a silent ship" | NO ANSWER / 4 December 1872 | countdown | `mary-c6-...` |

![Eiffel c2 full](task1-assets/eiffel-c2-full.jpg) ![Eiffel c6 full](task1-assets/eiffel-c6-full.jpg)

## 4. Live results (real LLM Registry calls, real image model; YouTube stubbed)

Two checks: `scripts/packaging-real-check.ts` (brief, concepts, code checks, cold reader, render, lettering; five scripts, two profiles and no profile) and `scripts/packaging-gate2-check.ts` (the whole Gate 2 and publishing path on a **scratch database** `sevenai_task1a_20261026_test`, created, migrated, used and dropped; it refuses any database not ending `_test` or `_sandbox`).

| Script (profile) | Result | Face | Typeface | Cost |
|---|---|---|---|---|
| Eiffel, approved script of a test channel (none) | 3 packages; 2 concepts dropped by code, 1 by the cold reader | none | Anton | $0.0705 |
| Mary Celeste, generated from a fixture brief (style + guidance) | 3 packages; the toy-on-the-floor card appeared, and the prop check now drops it (second run: 2 packages, "rigging" and an unnamed family dropped) | none | Cinzel | $0.0831, $0.0749 |
| Lego, generated from a fixture brief (guidance) | 2 packages; a dropped hedge on "1.4 billion" was caught by code | none | Anton | $0.0581 |
| Ada Lovelace, short test script (style + guidance) | 2 packages; 4 dropped (limits, repeat, give-away) | **face** | Playfair | $0.0630 |
| Calendar reform 1582, abstract (style + guidance) | first run: all 6 dropped by code, which exposed two defects in my own checks (a year glued to the subline; a compound prop judged by its last word), both fixed with tests; second run: 1 package | **figure** | Cinzel | $0.0454, $0.0557 |
| Gate 2 end to end on the scratch database | packaging ready (3); API view; other tenant FORBIDDEN; unsupported edited title refused; supported edit saved; **after a restart: same packages, choice kept, 0 new usage rows**; Gate 2 approved; publishing used the chosen title and `coverFrameSet: true` with the chosen file | none | Anton | $0.0673 |

R1 verify: the face decision differs for a person (Ada: face), a landmark or a ship (none), and an abstract subject (figure). A weak-gap script returns "weak gap" and stops before any further spend: tested with a faked brief (no real weak script was found among the five).

**Honest limits of PR A, found by looking at the pictures**
- **Lettering can cover a face.** On the Ada card the top line sat across the woman's eyes: the image model painted her at the top although the concept asked for a calm top. The calmest-zone rule rescued another card (moved the lettering off a busy top) but cannot see a smooth, dark face. A vision check ("does the lettering cover the subject or a face") belongs with PR B's critic; until then the founder sees it on the card.
- **Scene-versus-script is only partly code.** The prop list catches an object the model declares and the script never mentions; it cannot catch an object the model leaves off its list. The picture-versus-script payoff check is PR B (R4), as the task says.
- **An uncanny face is not checked in PR A** (needs a vision call). I looked at the one face card at full size: no visible defect. PR B's critic should include it.
- The cold reader flagged a title as giving its answer away 6 times across the live runs; two titles that still hint at their answer got through ("Eiffel Turned a Tower Into a Tool. How Did That Save It?"). The pairwise compare in PR B is the fix.

## 5. Cost

| Step | Cost |
|---|---|
| Text per video (brief, six concepts, cold reader) | $0.045 to $0.062 |
| Images (two or three at `low`) | $0.0063 to $0.0068 each, $0.013 to $0.020 |
| **Packaging per video** | **$0.058 to $0.083**, estimate in the run cost $0.07 to $0.08 |
| Live-check spend, whole task so far | **$0.53 of $2.00**: R0 price probe $0.016; five scripts, seven real-check runs, $0.4507; scratch-database end-to-end $0.0673 |

## 6. Tests and commands

```
cd studio
npx tsc --noEmit -p tsconfig.json              # clean
npx eslint .                                   # clean
npx vitest run                                 # all pass (count below)
cd ../app && npx tsc --noEmit                  # clean
cd ../app && npx expo lint                     # clean
cd ../studio && npx vitest run --root ../app   # 29 files, 191 tests pass
# live (spend money; each has a visible cap and --live):
npx tsx scripts/packaging-real-check.ts --script <file> --name <name> --look neutral|guided|styled --live   # cap $0.40
npx tsx scripts/packaging-gate2-check.ts --create-db sevenai_..._test ; prisma migrate deploy ; --live ; --drop-db   # cap $0.40, sandbox only
```

New tests: `packaging/check.test.ts` (the spike regression cases: limits, invented figure, dropped hedge, unearned "untold", fake badge, answer and support not in the script, invented prop, living or absent person, title repeat, edited title), `build.test.ts` (six to three, two when the limit allows two, weak gap, code drops with reasons, give-away drop, resume without paying again, **no channel name anywhere in the packaging folder**), `lettering.test.ts` (sizes, three typefaces, subline, zone choice, no chip), `run-pipeline/packaging-stage.test.ts`, `thumbnail-followup.test.ts` (success, refusal, keep YouTube's, no choice, 2 MB, no double upload), `state-machine.packaging-title.test.ts`, `api/routers/runs.packaging.test.ts` (view has no paths or prompts, tenant FORBIDDEN, owner check, refusal and save), `api/thumbnail-route.test.ts` (tenant, signed links, traversal), `app/lib/packaging.test.ts`, and changes to `cost-estimate.test.ts` and `registry.config.test.ts`. Tests use two differently configured channels (a style-and-guidance profile and a guidance-only one) and one with no profile, in the live checks and the unit fixtures.

## 7. Same-cause sweep (Hard rule 9)

**Cause:** a title or thumbnail made in more than one place with different rules; and any channel name or single-channel assumption in packaging code, prompts or fixtures. Searched `studio/` and `app/`.

| Hit | Disposition |
|---|---|
| Title length 100 hard-coded in `PublishingMetadataSchema` and in two metadata prompts ("under 100 characters") | **Fixed here:** one owner, `packaging/constants.ts` `TITLE_MAX_CHARS`; the schema and both prompts read it. |
| Figure and hedge rule for titles | **One owner already** (`checkMetadataClaims` over `numericVerdicts`); packaging calls it, no copy. |
| Frame-grab cover (`extractCoverFrame`, `coverFrameTimestampRatio`, `setThumbnail`) in `publishing/index.ts` and `state-machine.ts` | **Left alone:** still the path for a Short, a run whose Gate 2 is off, and any older run; PR C replaces the Short case with its package. |
| Caption font Montserrat (`captions-ass.ts`) and the stub's Arial (`ai-visuals/stub.ts`) | **Left alone:** different job (burned-in captions, a test stub), not a thumbnail font. The three thumbnail fonts have one owner (`packaging/constants.ts` `TYPEFACES`). |
| Channel names: `llm/canary.ts` reads the NIYT config document as its test channel; "cold open" in script prompts (`script-generation/long-form.ts`, `script-review/index.ts`, `formats/manifest.ts`) | **Left alone:** the canary is a test tool and NIYT is a test channel; "cold open" is a storytelling term, not a channel. No channel name in `studio/src/packaging/`, in its prompts or fixtures (a test fails if one appears). |
| `GET /runs/:id/video`, `/preview`, `/subtitles` do not check the tenant (F1) | **Needs a new task.** Any logged-in user who knows a run UUID can fetch another tenant's video, preview or subtitles. The cause (a REST route that never calls the tenant check the tRPC procedures use) is not the packaging cause, so I did not change those routes in this PR. Sized: three small handlers; the new thumbnail route is the pattern. **I recommend a fix before more tenants are invited.** |
| `data/thumbnails/<run>/` has no clean-up when a run ends | **Needs a new task** (about 1 MB per run; `removeRunWorkFiles` does not touch it, deliberately, because the file must stay downloadable). |

## 8. Exact upload outcome

Real YouTube was **not** called (the thumbnail 403 is Task 8 R11.5's; this task does not reopen it). With `YOUTUBE_STUB=1` on the scratch database: video published (stub id), the chosen title used, `coverFrameSet: true`, `thumbnail: { source: "package", packageId: "c6", file: "c6-full.jpg" }`, file on disk (119,888 bytes). The refusal path (403 → `coverFrameSet: false`, the 403 message, file kept, follow-up `uncertain`, no second insert) is covered by `thumbnail-followup.test.ts` with the real `thumbnailFailureMessage`. A real upload to a verified channel still needs a founder-run check.

## 9. Deviations from the task doc

- **Packages live on the Gate 2 row, not a `packaging` stage** (section 1, row 4: a CHECK constraint makes a new stage a migration).
- **Gate 2 for a Short is unchanged in PR A** (long first, per decision 2); the task's "for every channel" is met for Long.
- **Thumbnails are not copied to R2.** Local disk only (restart-safe, not disk-loss-safe).
- **The picture-versus-title "connects without the script" and the pairwise compare are not in PR A** (R4, PR B); PR A uses the cold reader the doc puts in R2.
- **No designer screens existed**; the cards are a first pass behind the existing layout.
- **An approve with no choice** publishes with YouTube's suggested thumbnail and a model-written title (it does not frame-grab), and the Gate 2 screen says so.

## 10. Hard rules and statuses

- **Rule 5:** task doc r7 on `main` and identical to the source (line endings aside); no doc commit; I did not edit it.
- **Rule 6:** in my own worktree, `git fetch origin` then `git merge origin/main` (twice: after the r7 doc landed, and just before marking ready; the second brought only the architect's `docs/STATUS.md` change). **No conflicts to resolve.** Re-ran type check (studio and app), lint (studio and app), all studio tests (1,602 pass, 65 skipped as before, exit 0) and all app tests (191 pass), then pushed. Docs scope, `git diff --name-only origin/main...HEAD -- docs/`: this report and its 15 images under `reports/task1-assets/`; the task doc is not in the list because it is identical on `main`; nothing else. Then `gh pr ready`. This is a merge of `main` into my branch, not a push to `main`.
- **Rule 7:** this is the only doc I wrote; `STATUS.md`, `PLAN.md` and every other doc untouched.
- **Rule 8:** not yet; runs after the founder says PR C is merged (the worktree stays for PR B and C).
- **Rule 9:** section 7. **The scratch database `sevenai_task1a_20261026_test` was dropped.** `studio/data/` outputs of the live checks are gitignored; the two live scripts are committed with their caps and `--live`.
- **Code-complete:** PR A yes. **Merged:** no. **Deployed:** no.

## 11. Open founder decisions

1. **F1 above** (tenant check on the three older file routes): a new task now, or later?
2. **R2 copy and clean-up of thumbnail files:** copy each run's thumbnails to R2 and clear local copies when a run ends, or leave local for now?
3. **Show a face?** Nothing to decide; derived from the script. But the founder should look at the Ada-style card (face) at Gate 2 on a real run before PR B's face check exists.
4. **Short packages:** PR C builds title, hook and frame zero. Confirm no 9:16 thumbnail (decision 2) once PR C starts.

## 12. One line for PLAN.md

P1 PR A: curiosity packages (brief, six concepts to three, code checks, rendered thumbnails, Gate 2 cards and choice, chosen title and file published) built and tested for long videos, no migration; PR B (vision critic, payoff check) next; one tenant-check finding (F1) needs its own task.

---

# PR B (`SPRINT6_TASK1B_BE`): R4, the honesty gate, plus the face checks

**Branch / worktree / PR (PR B)**: `SPRINT6_TASK1B_BE` · `D:\Study Material\7AI-SPRINT6\task1b` · [PR #124](https://github.com/Neeraj1002/7AI/pull/124) (draft)
**Stacked on PR A.** PR A (#116) is reviewed but not merged, and PR B needs its code, so this branch is cut from `SPRINT6_TASK1A_BE` and the PR's base is that branch (its diff is PR B only). Once #116 merges I merge `main` into this branch, retarget the PR to `main`, re-run everything (Hard rule 6) and only then mark it ready. I did not merge `main` now on purpose: it would put unrelated docs commits into this PR's diff.
**Task doc**: r7, unchanged (identical to `main` and to the architect's source). No `_DOC` commit.
**Spend, PR B**: $0.99 (seeded checks $0.153 over four runs, seven real-check runs $0.717, scratch-database end-to-end $0.121). **Whole task: $1.53 of $2.00.** I have stopped live work; $0.47 is left.

## B1. R0 for PR B

| # | Question | Result |
|---|---|---|
| 1 | Can Sonnet 5.5 read images through the registry? | **C (it was U in PR A).** Measured with the seeded check: it lists what is in a picture and, asked for face and subject boxes, returns usable ones. Haiku 4.5 reads them too. |
| 2 | Where do the checks run? | Inside `buildPackaging`, per rendered picture, after lettering and before the package is kept, so a dropped package never reaches Gate 2. Order: defect check, payoff, critic, then head to head between survivors. Each paid call is booked as its own usage row (`packaging-defect-check`, `packaging-payoff`, `packaging-critic`, `packaging-compare`). |
| 3 | Storage | **No schema change.** The same `output.packaging` on the Gate 2 row, with optional `checks` and `warnings` on each package and two new stages in `dropped`. A package made before PR B has neither and still reads. |
| 4 | New registry purposes | `packaging-critic` (Haiku, 3,000), `packaging-payoff` (Sonnet 5.5, 4,000), `packaging-defect-check` (Sonnet 5.5, 2,000), `packaging-compare` (Haiku, 2,000); canary step `packaging pictures S-1`; the config test pins the limits. |
| 5 | Cost | A real run's packaging is now **$0.09 to $0.14** (text $0.075 to $0.124, images $0.013 to $0.020; it was $0.06 to $0.08). The run estimate adds the checks: **$0.15 (2 min) to $0.17 (10 min)** per long video, deliberately a little above what the live runs cost. |

## B2. What was built

- **Defect check** (`vision.ts`, `prompts-vision.ts`): reads the picture *before* lettering at feed and sidebar size and returns whether a face is visible, whether it looks uncanny at either size, defects, hands, and **boxes for every face and for the main subject**. Whether the lettering covers a face or the subject is then **worked out in code** from those boxes and the lettering's own rectangle (`lettersCover`: 12% of a face, or half of the subject). If it covers, the picture's other zones are tried calmest first with no new model call (the picture has not changed), and the founder is told it was moved; if every zone covers, the package is dropped. `lettering.ts` now reports the lettering's box and the zones by calmness, and writes the plain previews (never served).
- **An uncanny face is reported, not hidden** (R3 verify): the package stays with a warning on its card ("A face may look uncanny at sidebar size: ...").
- **Payoff check** (the script plus the picture, Sonnet 5.5): lists every scene, person, object, vehicle or building in the picture and whether the script contains it; whether the picture contradicts its words or the script; whether the script answers the question (with a quote that **code verifies** is in the script); whether the answer really pays off; whether a fake label or an unearned "untold" word is there. **Any failure drops the package with the reason** (`payoffReasons`, pure and tested). PR A's concept-level "props named by the script" rule is now only a hint passed to this check (B4, finding 3).
- **Critic** (Haiku, only the picture and the title): what it is about, what it expects, what it wants to know, would it click, what would disappoint, and the question r7 asks: **do the picture and the title give one idea without the script?** A real mismatch drops the package. Everything else the critic says is advisory.
- **Head to head**: every pair of survivors is compared in **both orders**; a package wins a pair only if it wins both ways, so position cannot decide (tested). It only **orders** the cards; nothing is picked.
- **If every package drops**, the packaging ends `none_passed` with every reason in the Gate 2 warning, and YouTube's suggested thumbnail stays (behaviour from PR A).
- **App**: each card shows its warnings, the head-to-head line and a collapsible "What a stranger said (advisory)"; the dropped-ideas list shows the new reasons.

## B3. Seeded cases (live, `scripts/packaging-vision-check.ts`, real registry calls)

All seven pass on the final prompts ($0.039 per run; the script refuses to spend over $0.25 and exits 1 if a seeded case misbehaves):

| Seeded case | Expected | Result |
|---|---|---|
| Mary Celeste picture with a toy horse, against the script with the toys sentence removed | payoff drops it | **Dropped**: "shows a toy horse on wheels, which the video does not contain" |
| Eiffel "Saved by science" picture and title | payoff passes | **Passes**, no reasons |
| Same picture, critic | picture and title connect | **Connect** |
| Same picture under a Lego title | critic fails the connection | **Fails**: no visual connection to Lego |
| Plain Ada picture with the real top line's box (lettering over her face) | covering found | **Found: "a face"** (model box x 0.33 to 0.64, y 0 to 0.45) |
| Plain Ada picture with the line at the bottom | left alone | **Covers nothing** |
| Two Eiffel packages head to head | a winner or a tie, with reasons | **A winner or a tie, both orders asked** |

## B4. What the live runs taught me (and changed)

1. **Haiku missed lettering over a face; asking a model "does the lettering cover the face?" is the wrong question.** On the first run it said the lettering sat "over the dark background" while it crossed the woman's eyes. I changed the design: the model only says **where the faces and the subject are**, code compares that with the lettering's own box, and the defect check moved to Sonnet 5.5. The covering rule is now deterministic and tested.
2. **My first seeded toy case was wrong.** The spike said the Mary Celeste script never mentions a toy, but the script generated for the spike does say "a child's clothing and toys", so the payoff check was right to accept that picture. The seeded case now uses the script with that phrase removed. PR A's "invented toy" example was therefore not invented against that script.
3. **PR A's text-level prop rule was too strict and is demoted.** With the real checks in place it dropped six of six Ada concepts for a desk and a pen. It is now a hint to the payoff check ("the concept lists these objects the script does not name; look for them") and the payoff check judges what is really in the picture. The PR A test that expected a drop now expects none, and a new test checks the hint is passed.
4. **The payoff check needed calibrating for ordinary set dressing.** The first version dropped a package for an oil lamp, a desk and a bookshelf. The prompt now says ordinary furniture and set dressing that any scene of that story would have is fine, and that specific story-bearing objects (a toy, a letter, a meal, a weapon, a flag, a named character, a machine the script says was never built) are not. It still drops real inventions: a toy, a bowl on a table in a story with no meal, a complete engine in a story where it was never built.
5. **The critic's "connects" question needed the same.** It first dropped every Ada package as "a generic silhouette". The prompt now says a title about an abstract idea connects to a picture of the person or thing at its heart, and says false only for a real mismatch. The mismatch seeded case still fails correctly.
6. **Results vary between runs.** The same Ada script gave 0, 0, 0 and then 2 packages across four prompt versions and runs; Mary Celeste kept 1 of 3 renders after the checks. A script whose honest answer is "unknown" (Mary Celeste) loses any package that promises an answer: that is the check working, and it means such a script may reach Gate 2 with one option or none.

## B5. Live results with the final checks

| Script (profile) | Packages after the checks | Dropped, with the reason | Face | Cost |
|---|---|---|---|---|
| Eiffel (none) | 3: "How Did This Tower Dodge the Scrapyard?" (won 2 of 2), "The Eiffel Tower Had a 20-Year Permit. Then What?" (1 of 2), "What Was Eiffel's Tower Really For, Before It Was Saved?" (0 of 2) | 3 by code (lettering repeats the title; a year not in the script) | none | $0.1155 |
| Mary Celeste (style + guidance) | 1: "Six miles off, and nobody answering signals" | payoff: a question the script never answers; payoff: a bowl and a chair the script does not contain, and a picture that contradicts "No meal"; cold reader: answer given away | none | $0.1438 |
| Ada Lovelace (style + guidance) | 2: "How do you write a program for a machine that isn't there?" (won 1 of 1), "Her notes were forgotten for over a century" (lost 1 of 1) | 2 by code, 2 as giving the answer away | **face** | $0.0965 |
| Calendar reform (style + guidance) | 1: "The October when the fourth became the fifteenth" | payoff: a stone window the script does not contain; 3 as giving the answer away; 1 by code | **figure** | $0.0886 |
| Gate 2 end to end on a scratch database (Eiffel, style + guidance) | 3; choice saved; a restart found the same packages and 0 new usage rows; publishing used the chosen title; `coverFrameSet: true` with the chosen file | | none | $0.1212 |

On both Ada cards the lettering was moved off her face by code (to the bottom, and to the right) and the card says so. Final pictures: `task1-assets/prB-ada-c5-*` and `prB-ada-c6-*` (full, feed, sidebar).

![Ada c5](task1-assets/prB-ada-c5-full.jpg) ![Ada c6](task1-assets/prB-ada-c6-full.jpg)

## B6. Honest limits

- **The payoff check is a model's judgment.** It is strict by design, calibrated on five scripts, and will sometimes drop an honest package or miss a subtle invention. Gate 2 shows what was dropped and why, so the founder can see the strictness. I did not add a "show dropped anyway" button.
- **No second round.** When every concept fails there are no options and YouTube's thumbnail stays; nothing regenerates concepts with the reasons fed back. That is the obvious next lever if the founder sees too many empty Gate 2s; it needs its own decision because it spends more.
- **Faces**: the uncanny check is advisory and reads one picture per package. I looked at the two Ada faces at full size and saw no defect; at scale a model flag is the only guard.
- **Head to head is an order, not a verdict**: with two packages it is one pair.
- The pictures sent to the models are our own JPEGs (feed and sidebar size), not the full file.

## B7. Tests and commands

```
cd studio
npx tsc --noEmit -p tsconfig.json     # clean
npx eslint .                          # clean
npx vitest run                        # 1,634 pass, 65 skipped (the one failure on the first run was an old test's 5 s timeout, B8)
cd ../app && npx tsc --noEmit && npx expo lint          # clean
cd ../studio && npx vitest run --root ../app            # 29 files, 193 tests pass
npx tsx scripts/packaging-vision-check.ts --live        # seeded cases, cap $0.25
npx tsx scripts/packaging-gate2-check.ts --create-db sevenai_..._test ; prisma migrate deploy ; --live ; --drop-db    # cap $0.40
```

New tests: `vision.test.ts` (covering thresholds, every payoff failure named, the answer quote must be in the script, critic and defect rules, **head to head: both orders, and position bias is a tie**), the PR B block in `build.test.ts` (payoff drop with reason; contradiction, unanswered question, fake label, made-up answer place and no payoff each drop; a mismatch drops; all-fail gives `none_passed` with reasons; lettering over a face is moved with no new call and the founder is told; covering in every zone drops; an uncanny face stays with a warning; the head to head only orders and picks nothing; props are passed as a hint), `app/lib/packaging.test.ts` (stranger lines, head-to-head line), and the registry config and estimate tests.

## B8. Sweep (Hard rule 9)

| Hit | Disposition |
|---|---|
| "Lettering over the subject" decided in two places (PR A's zone choice by texture, PR B's boxes) | **One owner for the decision**: the boxes and `lettersCover` decide; the texture rule only picks the first try. Both kept, documented. |
| PR A's prop rule dropped concepts that the picture check judges better | **Fixed here**: demoted to a hint (B4.3). |
| "Ordinary set dressing" could be said differently in four prompts | **Fixed here**: only the payoff prompt decides what is supported; the critic and defect prompts do not judge scenes. |
| Picture attachments are always sent as `image/jpeg` | **Left alone**: every packaging file is written as JPEG in `lettering.ts`. |
| `src/llm/no-output-cap-outside-llm.test.ts` timed out at its default 5 s under a loaded full run (first in PR A, again here) | **Fixed here**: its timeout is 30 s; the test itself is unchanged. |
| The tenant-check gap on `/runs/:id/video`, `/preview`, `/subtitles` (PR A's finding F1) | **Still needs a new task**, unchanged. |
| No channel name in `studio/src/packaging/` | Held: the test from PR A still passes, and the new vision fixtures are pictures and a script with no channel name. |

## B9. Hard rules, statuses, open decisions

- **Rule 5:** task doc r7 identical on `main` and to the source; no doc commit.
- **Rule 6:** done after #116 merged (2026-10-26). In this worktree: `git fetch origin`, `git merge origin/main` (**no conflicts to resolve**; the merge brought PR A as merged plus the architect's docs cleanup), PR retargeted from `SPRINT6_TASK1A_BE` to `main`. Re-ran type check and lint (studio and app), all studio tests (1,635 pass, 65 skipped as before) and all app tests (193 pass), then pushed. Docs scope, `git diff --name-only origin/main...HEAD -- docs/`: this report and its images only; the task doc is not listed because it is identical to `main` and to the source. This is a merge of `main` into my branch, not a push to `main`. Then `gh pr ready`.
- **Rule 7:** I wrote only this report; no other doc.
- **Rule 8:** not yet (PR C is still to come; the worktrees stay).
- **Rule 9:** B8.
- **The scratch database `sevenai_task1b_20261026_test` was dropped.**
- **Code-complete:** PR B yes. **Merged:** no. **Deployed:** no.
- **Open founder decisions:** (1) merge #116 first, then I retarget this PR; (2) is an empty Gate 2 (all packages dropped) acceptable, or should concepts be regenerated once with the reasons when that happens (about $0.08 more, only in that case)? (3) F1 and the R2 copy of thumbnail files from PR A are still open.

**One line for PLAN.md:** P1 PR B: picture checks built and tested (defect check with code-decided lettering cover, payoff check against the script, critic connection check, both-orders head to head, uncanny-face warnings); seeded cases pass live; waits for PR A to merge, then retarget to main.
