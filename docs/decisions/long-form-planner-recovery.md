# Long-form planner contract recovery

## Evidence and cause

The affected 480-second run requests 96 scenes: 27, 23, 23, and 23 across four approved chapters. A previous whole-chapter request reached the application's 8,192-token output setting. The selected `claude-sonnet-5` model supports up to 128,000 output tokens through Anthropic's API, so 8,192 is an application setting, not a model ceiling. Raising it would increase the size and cost of a failed chapter request. Existing 12-scene batches bound ordinary requests; the new recovery can split a failing batch further.

The later, active failure had a different cause. Chapter 2's first 12-scene batch returned 13 scenes on both the initial and correction requests, each with a normal `stop` reason and roughly 3,000 output tokens. The reply schema accepted any nonempty array; a subsequent exact-count check correctly rejected both. The correction was given only an error string and produced a different extra beat. It was unsafe to truncate the reply because that could discard narration or move a scene to the wrong anchor. The 8,000-character failure excerpt also omitted the end of the final 8,777-character reply, so the full historical contents cannot be reconstructed. A 27-scene checkpoint was already saved and reused; no complete plan was saved.

## Contract and recovery

The application allocates every scene and supplies its chapter-local ID, exact narration span, and anchor. The model returns only a prompt for each required ID in a strict object. Application validation checks every required ID, unknown and duplicate IDs, nonempty prompts, and JSON parseability; it assembles the existing ordered `longScenes` shape with the original anchors. Full chapter text, chapter order, style, review notes, and scene allocation remain in the prompt. The script guide is explicitly scoped to tone and context. Schema validation cannot establish factual accuracy or artistic continuity; existing review gates still apply.

Output exhaustion has its own diagnosis and splits the request immediately; it never repeats the identical oversized request. Malformed JSON or a schema violation gets one correction that includes the rejected reply and original chapter context. A second invalid reply splits the batch into smaller complete units; a single-scene failure is terminal. Every accepted batch is checkpointed. Existing provider backoff, quota/spend recovery, budget checks, and cancellation guards remain in place.

The checkpoint hash now includes contract version 3. A legacy version 2 checkpoint is carried forward only when the complete planning input hash, scene keys, and narration anchors match. The carried checkpoint is written into the new stage row before any model call, and each later accepted batch is persisted. A one-use, user-triggered recovery for a capped legacy count/anchor failure is claimed atomically through the existing run JSON field. It requires a completed approved-script gate, identical stage input and review notes, long-video configuration, and valid checkpoint. It leaves the manual retry counter and budgets intact. Cancelled runs and failures under the new contract do not qualify. Run detail and Retry use the same eligibility rule, including the pre-existing provider/spend exception.

Each returned model reply is metered with chapter, range, request hash, stop reason, validation result, and intended recovery. Failed stage diagnostics retain original reply lengths and truncation flags; planner excerpts have a larger bounded prefix and a tail when truncated. No failed reply is accepted as a completed batch. No database migration or production-data change is required.

## Verification and limits

The incident fixture uses the approved chapter 2 narration and the two visible extra anchors. Regression tests cover strict slots, scene order and fields, normal-stop cardinality errors, duplicate IDs, output exhaustion, decreasing-scope recovery, process restart and legacy checkpoint reuse, invalidation on changed inputs, one-use recovery races, budgets and cancellation, and existing Shorts, rendering, and unrelated planning paths. The focused suite passed (110 tests in 16 files); Studio typecheck, build, and lint passed. Tests use mocked model calls and a dummy database URL. No paid generation or production database write occurred.

The original deployment SHA, missing response tails, and historical request bodies were unavailable. The fix does not prove semantic quality or exactly-once external provider execution across every crash window. The active run can be retried only after this code is deployed and its matching checkpoint and approved inputs still pass the recovery checks; this PR does not start that production retry.

Model documentation: [Claude Sonnet 5 overview](https://platform.claude.com/docs/en/models/sonnet-5/overview) and [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
