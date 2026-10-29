# Contract: Gate 2 packages (Sprint 6 Task 1, R5 and R6)

**Status**: r2, 2026-10-29 (answers to the designer's three questions; "making" corrected). r1: proposed 2026-10-29 by the architect, from the UI/UX designer's request (boards "NEXT 4", locked canvas) and the code on `main` after Task 1 PR A (#116) and PR B (#124). Agreed here before any build, so the backend and the app can work in parallel (contract first). Not a task doc: the backend and frontend tasks are written from it.
**What was read**: `studio/src/api/routers/runs.ts` (`packaging`, `choosePackage`), `studio/src/packaging/view.ts`, `choice.ts`, `build.ts`, `check.ts`, `constants.ts`, and the Task 1 reports. **Not read**: the app components and the exact shape of the publish receipt. Every "exists" line below is from the code; every "new" line is a decision; the agent confirms both in its R0.

## 1. What already exists (do not rebuild)

| Procedure | State |
|---|---|
| `runs.packaging({ runId })` query | Exists. Returns `{ pending: boolean, view: PackagingView \| null }`. Tenant-checked. |
| `runs.choosePackage({ runId, packageId, editedTitle? })` mutation | Exists. Only at Gate 2. `packageId` is a package id or the constant `'youtube-suggested'`. An edited title goes through the same title checks and is refused with the reasons. Saved on the Gate 2 row before Approve; safe to repeat. |
| `GET /runs/:id/thumbnail/:packageId/:size` | Exists. Sizes `full`, `feed`, `sidebar`. Tenant-checked; the view gives signed one-hour links. |
| Approve with no choice | Exists: publishes with YouTube's suggested thumbnail and a model-written title. The app asks first (F2). No backend change. |

`PackagingView` today: `status` (`ready`, `weak_gap`, `none_passed`, `failed`, `skipped`), `reason`, `brief`, `packages[]`, `dropped[]`, `choice`, `titleLimit`, `videoSeconds`. A package has `id`, `device`, `title`, `question`, `answeredAt` (one formatted string), `lettering`, `stranger`, `headToHead`, `answerQuote`, `warnings`, `imageUrls { full, feed, sidebar }`.

## 2. Changes (this is the contract)

### B1. `runs.packaging`: extend, do not move

The designer's states map onto the existing ones. Keep the separate query (not `runs.get`).

| Designer state | Server today | App rule |
|---|---|---|
| making | **Correction 29 Oct (r2):** the packages are made *before* Gate 2 opens (`state-machine.ts` ~1845: made, then the approval is registered). While they are made the run is not yet `paused_gate2`, so today `runs.packaging` returns `pending: false, view: null`, and the app cannot tell "making" from "none". New field `making: boolean` (true while Gate 2 is being prepared and the packages are being made; the agent confirms the exact run state in R0). `pending: true` stays for the edge case (paused at Gate 2 with no packaging, for example after a restart). | Skeleton cards and the cost card while `making`. **No per-package `drawing / checking` progress in v1**: the packages are written when they are finished. |
| ready | `status: 'ready'` | Swipe cards. |
| none, weak gap | `status: 'weak_gap'` | "No honest package" board with `reason`. |
| none, all dropped | `status: 'none_passed'` | Same board with `dropped[]` reasons. |
| none, no room in the budget | `status: 'skipped'` | **New board needed** (designer): the spend limit left no room; Approve still works with YouTube's suggestion. |
| none, failed | `status: 'failed'` | Same board with `reason`. |

New fields (all additive; old runs without them behave as today):

```ts
PackagingView += {
  packagingCostUsd: number;            // text + pictures so far, including round two
  round: 1 | 2;                        // 2 after the one automatic extra round (Task 1 R10)
}
PackageView += {
  round: 1 | 2;                        // card tag "second round" when 2
  answeredAtParts: { chapter: number | null; chapterTitle: string | null; startSec: number | null };
                                       // answeredAt (the string) stays; the chip may use either
  hookLine: string | null;             // Shorts only (Task 1 R7, PR C)
  firstFrameUrl: string | null;        // Shorts only: signed link, same rule as imageUrls
  imageUrls: Record<'full' | 'feed' | 'sidebar', string> | null;   // null for a Short (no 16:9 image)
}
```

**Approve, choose and edit are not available while `making`** (the approval is not open yet; the gate buttons appear when Gate 2 opens, as built). In the edge case (`pending`: paused at Gate 2, no packaging) Approve works and publishes with YouTube's suggested thumbnail; `choosePackage` refuses with "not ready yet". The app does not enable Approve on the making screen.

The duration chip is drawn by the card from `videoSeconds` (already returned), never part of the file.

### B2. `runs.choosePackage`: unchanged

Input and output as in section 1. Choosing is explicit: the app always sends `packageId` (a package id, or `'youtube-suggested'`). Returns `{ choice: { packageId, title, titleEdited } }`. Errors: CONFLICT when the run is not at Gate 2 or packages are not ready; BAD_REQUEST with the sentence to show when an edited title is refused.

### B3. Live title check (new query; the check logic exists)

```ts
runs.checkPackageTitle({ runId, packageId, title })
  -> { ok: boolean, length: number, titleLimit: number,
       problems: Array<{ kind: 'unsupported_figure' | 'too_long' | 'empty' | 'other',
                         text: string | null,        // the figure or phrase to highlight, when there is one
                         message: string,            // the server's own sentence, shown as is
                         supportedFigures: string[] }> }
```

It wraps `checkTitle` (`studio/src/packaging/check.ts`) with the run's script and brief and **adds no rule**. The app does no rules of its own. **The limit is `titleLimit` from the server, not a literal 100:** it comes from the channel's title guidance (neutral 70, YouTube's own ceiling 100). There is no separate `editPackageTitle`: saving an edit is `choosePackage` with `editedTitle`, which refuses the same cases. **Saving an edit also chooses that package, by intent** (one choice per video; editing a title means you want that package): the card turns to "Chosen" with a small "title edited" note. Choosing another package, or YouTube's suggestion, drops the edit. Save is blocked in the app until `ok`.

### B4. Publish result for the thumbnail (new field on `runs.get`)

```ts
runs.get += thumbnail: {
  status: 'live' | 'not_applied' | 'pending' | 'not_set';
  reasonText: string | null;           // YouTube's reason in plain words when not_applied
  source: 'package' | 'youtube-suggested' | 'frame-grab';
  packageId: string | null;
  fileUrl: string | null;              // the chosen file, for "Download image"
} | null                               // null until published
```

Composed from the existing receipt (`coverFrameSet`, `coverFrameMessage`, the thumbnail follow-up state). `status` also takes `'not_set'`: **the app sent no thumbnail and YouTube chose its own** (`source: 'youtube-suggested'`). `reasonText` and `fileUrl` are null. The app shows one plain grey line, "YouTube chose the thumbnail": no tag, no amber, no download. For `source: 'frame-grab'` (a Short, a run whose Gate 2 packaging was off, an older run) `live` and `not_applied` keep today's meaning of the existing cover-frame result; `fileUrl` is null; the app shows no download. The custom-package states (tag "Live on YouTube", amber card with the reason, download) apply only when `source` is `'package'`. Rule: `live` only when the follow-up reports success; a refusal is `not_applied` with the message; an `uncertain` or in-flight follow-up is `pending`. **A failed thumbnail never changes a successful video upload**, and the app never shows a custom thumbnail as live otherwise. The agent confirms the mapping in R0 and says what the receipt does not distinguish.

## 3. Not in this contract (decided)

- **`runs.remakePackages` ("Try new packages")**: rejected. The decision of 29 Oct is **one automatic extra round** (Task 1 R10) when every package fails, then stop. A manual button would be a second paid trigger. The app hides it.
- **Per-package `drawing / checking` progress while making**: not in v1; generic skeletons and `packagingCostUsd`. Add only if the founder asks.
- **Short thumbnail image (9:16)**: none. A Short's package is a title, a hook line and a first frame (`hookLine`, `firstFrameUrl`), built in Task 1 PR C (R7).
- **Any channel or profile field**, feed and sidebar urls beyond what exists, `strangerExpects`, `wantsToKnow`, `retryThumbnail`: not needed. Nothing here is channel-specific (STATUS rule 4).

## 4. Who builds what, and the order

1. This contract merges (small PR).
2. Backend: B1 additions, B3 and B4. The additions touch the same files as Task 1 PR C (R7 Shorts, R8 record, R10 second round), so they go to the **PR C agent** as `task1.md` r9, item R11, not to a new agent.
3. Frontend: F1 to F4 from the designer's list, against fixtures built from this contract, behind a flag named by the app's convention, until the backend lands. A frontend task doc is written once the designer confirms section 2.
4. Then one real run on dev (Video; a Short after PR C).

## 5. Open for the designer

1. A board for `skipped` (no room in the budget).
2. The "second round" tag on cards and the making screen when `round: 2`; after a second failure the no-package board says nothing passed.
3. Title limit shown from `titleLimit`, not 100.
4. No "Try new packages" button.
