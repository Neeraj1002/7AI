# Week 3 Task 1: Media Generation Capability Layer

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Build `studio/src/media/` — TTS and transcription behind an internal contract, confined to one file, the same boundary pattern `studio/src/llm/` established in Week 2.
**Duration**: 2–3 hours
**Depends On**: None within Week 3 (parallel-safe with nothing else this week, since it's the foundation Task 2 needs). Requires an OpenAI API key in `.env.local` — purchase flagged back in the Week 2 purchase-plan discussion as needed "by Week 3."
**Owning Component**: New platform layer, alongside `studio/src/llm/`, per the same reasoning Section 5.1 of `AGENT_FLEET_DESIGN.md` applies to `studio/src/llm/`.
**Success Criteria**: `synthesizeSpeech` and `transcribe` are callable by Task 2 without either call site ever importing `openai` or any provider SDK directly.

## Task Requirement

The original decision doc (`docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`) named a media-generation contract as "designed during Task 8's spike, once there's a real toolchain choice to design around" — Task 8 happened in Week 1 and chose OpenAI TTS + OpenAI transcription + FFmpeg. This task is that deferred design, now that there's something real to design against.

**Correction to the original guess**: that doc speculated the shape would be "submit a job, poll or get a webhook, then fetch an asset." Task 8's actual choice is simpler — both OpenAI TTS and OpenAI transcription are synchronous request/response REST calls (confirmed in `docs/execution/week1/reports/task8.md`: "a single external API call, retryable via the same `retry-with-backoff.ts` wrapper"). Build the simpler synchronous contract, not the speculative async one.

### Context
`docs/execution/week1/reports/task8.md` (toolchain choice and reasoning). `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md` (the boundary pattern to replicate — "only one file may import the library/SDK," "call sites never see the library's types"). `docs/execution/week3/SCHEMA.md` (the `UsageEvent` extension this task's cost output feeds).

### Acceptance Criteria
- [ ] `studio/src/media/client.ts` (or equivalent single file) is the only file importing `openai` or any TTS/transcription provider SDK — grep-verify.
- [ ] `studio/src/media/index.ts` exports `synthesizeSpeech(text, voiceConfig): Promise<{ audioPath, characterCount, costUsd }>` and `transcribe(audioPath): Promise<{ segments: { text, startMs, endMs }[], audioDurationSeconds, costUsd }>` — this project's own types, not OpenAI's response shapes.
- [ ] Errors normalize to the existing `TransientStageError`/`NonTransientStageError` taxonomy at the client boundary, same as `studio/src/llm/client.ts` does.
- [ ] A small registry (mirroring `studio/src/llm/registry.ts`'s shape) maps a purpose (`'tts'`, `'transcription'`) to a provider+model — even with only one provider today, this keeps the later ElevenLabs/self-hosted-WhisperX swap (both named as future upgrades in Task 8's report) a config change, not a rewrite.
- [ ] `transcribe` returns word-level timestamp granularity, per Task 8's explicit requirement ("request word-level granularity specifically so burned-in captions land on the right word").
- [ ] Cost is computed inside this layer (character count × TTS pricing, audio-minutes × transcription pricing), not re-derived by Task 2.

## Schema Impact

None directly — this task's output feeds Task 2's `UsageEvent` writes (`docs/execution/week3/SCHEMA.md`), but this task itself doesn't touch the database.

## Business Logic / State Transition

None — this is a capability layer, not a pipeline stage.

## Implementation

### Files to Create
- `studio/src/media/client.ts` — the only file touching the OpenAI SDK.
- `studio/src/media/index.ts` — public surface.
- `studio/src/media/registry.ts` — purpose → provider+model map.
- `studio/src/media/types.ts` — this project's own request/response types.

### Detailed Steps
1. Confirm an OpenAI key is in `.env.local`.
2. Build `types.ts` (mirroring `studio/src/llm/types.ts`'s style).
3. Build `registry.ts` (mirroring `studio/src/llm/registry.ts`'s style) — seed with `tts` → OpenAI `tts-1-hd` and `transcription` → OpenAI's transcription model, per Task 8's recommendation.
4. Build `client.ts`: the OpenAI calls, cost computation, error normalization.
5. Build `index.ts`: the two public functions.
6. Grep-verify the import boundary.

### Integration Points
Feeds Task 2 directly. No dependency on `studio/src/llm/` or `studio/src/notify-founder/`.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
grep -rln "from 'openai'" studio/src/   # must return only studio/src/media/client.ts
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- Import-boundary grep: exactly one file
- A manual smoke call (short text → `synthesizeSpeech` → real audio file; that audio → `transcribe` → word-level segments) succeeds against the real OpenAI key

### How to Verify
1. Run all test commands above.
2. Run one real smoke call end-to-end (TTS then transcription on its own output) and inspect the returned segments for sane word-level timestamps.
3. Confirm `costUsd` on both calls is a plausible, non-zero number.

## Additional Notes

This is real (small) money against the account, same caution as Week 2 Task 4 — a couple of real smoke calls to confirm the contract works is enough; no need to loop it.

## Links & References
- [docs/execution/week1/reports/task8.md](../../week1/reports/task8.md)
- [LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md](../../decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md)
- [docs/execution/week3/SCHEMA.md](../SCHEMA.md)
- [studio/src/llm/](../../../../studio/src/llm/) — the pattern this replicates
