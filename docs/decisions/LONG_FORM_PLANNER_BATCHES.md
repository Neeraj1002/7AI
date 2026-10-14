# Long-form planner output exhaustion

## Findings

`video-production-planning` resolves through `studio/src/llm/registry.ts` to Anthropic `claude-sonnet-5`. Anthropic documents a 1M context window and 128K maximum output tokens: https://platform.claude.com/docs/en/models/sonnet-5/overview. The installed `@ai-sdk/anthropic` 4.0.49 capability table recognizes Sonnet 5 with `maxOutputTokens: 128000`. `callProviderModel` passes the caller's budget as `generateText.maxOutputTokens`, and the adapter sends it as `max_tokens`. A higher budget is supported; 8,192 is this planner's per-request limit, not the model limit.

Previously one request planned a whole chapter. The overall count is `ceil(targetSeconds / secondsPerStill)` (default five seconds), clamped to 12-200, then allocated proportionally to chapter narration word counts. There was no per-chapter scene cap. Input includes the director system prompt, visual/channel guides, topic, all chapter titles, full chapter narration, and review notes. Its size depends on those inputs, but input tokens are separate from the output budget.

The reply contains only `scenes: [{words, prompt}]` and an optional `audioLayer`. Shared plan metadata and the duplicate `stillScenePrompts` are constructed locally, not generated. The dominant output is the unbounded, highly detailed motion/camera/style prompt repeated for each scene. Even 40 scenes averaging 200 output tokens require roughly 8,000 tokens before JSON overhead. This is an estimate, not a measurement of the reported run.

The supplied diagnostic confirms output exhaustion at exactly 8,192 tokens, but does not provide the run ID, narration, requested scene count, raw reply, or input-token usage. No matching chapter/run payload was found in the repository, so the exact chapter 3 count and prompt size cannot be reconstructed. No production queries or paid generation calls were used.

## Change

Keep the 8,192 per-call budget and plan at most 12 scenes at a time. Stable six-word anchors at proportional narration positions define scene slots across the whole chapter. Every request retains full chapter narration, chapter order, style guides and review notes; all chapter anchors define the beat boundaries. Required scene counts are unchanged. Prompts request 80-140 words of concrete detail without repeated generic instructions. Only request the mood until one has been selected.

Validate the exact scene count and anchor order alongside the existing reply and final production-plan schemas. Missing/extra/reordered scenes fail validation instead of being accepted or sliced away. Malformed JSON/schema failures retain the existing one correction retry. Ordinary provider failures still propagate into the existing stage retry wrapper. Detect output exhaustion before parsing, via length termination or usage reaching the requested cap; split that request in half instead of retrying it unchanged. A single exhausted scene fails without repeating it. Persist the distinct failure kind and scene range in diagnostics. Guard and meter every paid call, including split and correction calls.

Checkpoint completed scenes and the mood through `patchStageOutput`. Bind the checkpoint to a versioned SHA-256 of chapter text/titles, topic, scene allocations, visual/channel guides, review notes, audio override, and provider/model. Parse checkpoint data before reuse. Preserve it when failure diagnostics replace stage output. Stage retries and later same-input attempts plan only missing scenes; changes to planning inputs invalidate reuse. Final ordering and schema fields remain compatible with the renderer and Shorts.

Tradeoff: batching repeats chapter context in input tokens and fixes scene starts at proportional word positions rather than asking the model to select arbitrary starts. It bounds reply size and recovery cost while preserving every requested scene and the full narration as context.

## Validation

Mocked regression coverage includes large multi-batch chapters, chapter 3 output exhaustion, adaptive splitting, single-scene exhaustion, unknown finish reasons at the cap, exact ordering/required fields, provider failure and partial-batch recovery, checkpoint invalidation, malformed JSON correction, and stage-level persistence across failure and recovery. Existing Shorts planning/render snapshots, script-generation/structured usage, LLM client, stage failure and long-render tests pass. Studio typecheck and build pass.

Local test configuration uses a dummy database URL and mocked providers. FFmpeg tests initially hit sandbox `spawn EPERM`; they pass with local subprocess access. No unrelated test failures remain in the focused checks. No production data was modified and no paid production generation calls were made.
