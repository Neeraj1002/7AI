# Week 2 Task 1: LLM / Text-Completion Layer

**Date**: 2026-09-07
**Status**: Complete
**Files Created**: 4
**Files Modified**: 1 (`studio/package.json`)
**Tests**: `npm run typecheck`/`build`/`lint` all clean; import-boundary grep clean; error-mapping boundary verified against a real (failing) Anthropic call

## What Was Done

Built `studio/src/llm/` exactly per `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`:

- `types.ts`: this project's own `Purpose`, `LLMMessage`, `LLMRequest`, `LLMResponse`, `LLMUsage` types. `PURPOSES` seeded with `intake-parsing` and `script-generation` only — the two purposes that exist or are about to, per the task's own scope (not the full four the decision doc names as eventually coming; adding `script-review`/`video-intelligence-own-draft` now would be exactly the premature expansion Principle 10 warns against).
- `registry.ts`: `LLM_REGISTRY: Record<Purpose, RegistryEntry>`, a typed config map (not env vars, not a config file, per the decision doc's own rationale). Both purposes resolve to `{ provider: 'anthropic', model: 'claude-sonnet-5' }` for now — matching what Week 1's `parse-brief.ts` already used, not yet a deliberate model-tiering decision (flagged for Task 3, which is where that reconsideration belongs per its own Additional Notes).
- `client.ts`: the only file permitted to import Vercel AI SDK (`ai`, `@ai-sdk/anthropic`). Wraps `generateText`, translates its response into `LLMResponse`, and maps `APICallError` to the existing `TransientStageError`/`NonTransientStageError` taxonomy using the SDK's own `isRetryable` flag — reusing the library's built-in transient/permanent classification rather than re-deriving status-code logic per provider (simpler and more robust than Week 1's manual `instanceof Anthropic.RateLimitError` checks).
- `index.ts`: public surface — `callLLM({ purpose, system, messages, maxTokens })` resolves the purpose via the registry and delegates to `client.ts`. Re-exports the types. Nothing outside `llm/` should import `client.ts` or `registry.ts` directly (not yet enforced by lint — see Known Issues).

## Package changes

Added `ai@7.0.93` and `@ai-sdk/anthropic@4.0.49` (pinned exact versions — both are current "latest" dist-tags and a matching major-generation pair) to `studio/package.json` dependencies. `@anthropic-ai/sdk` is untouched for now — `parse-brief.ts` still uses it directly until Task 3 migrates it.

## Test Results

```
npm run typecheck   -> clean
npm run build       -> clean
npm run lint        -> clean

Import-boundary grep (ai|@ai-sdk/anthropic across studio/src):
  studio/src/llm/client.ts:1: import { generateText, APICallError } from 'ai';
  studio/src/llm/client.ts:2: import { createAnthropic } from '@ai-sdk/anthropic';
  -> only client.ts, as required.
```

### Error-mapping boundary verification (no real API key available)

Per the task's own fallback instruction, verified `client.ts`'s translation logic with a throwaway script (`scripts/verify-llm-client.ts`, deleted after use) rather than skipping verification. Since `.env.local`'s `ANTHROPIC_API_KEY` is still empty, the script called `callProviderModel` with that empty key against the **real** Anthropic API — this reliably produces a genuine `APICallError` (401, "x-api-key header is required") rather than a guessed mock shape. Result:

```
PASS: mapped to NonTransientStageError as expected for an auth failure
message: LLM provider call failed: x-api-key header is required
```

This confirms the non-transient path (auth/validation errors, `isRetryable: false`) end-to-end against a real call. The transient path (`isRetryable: true`, e.g. rate limits/5xx) was **not** independently exercised — there's no way to reliably trigger one without a valid key and without deliberately abusing Anthropic's API, and it inherits directly from the AI SDK's own `isRetryable` flag rather than custom logic on our side, so the risk is low. Flagging this rather than claiming full coverage.

## Deviations from Spec

- `Purpose` seeded with 2 values (`intake-parsing`, `script-generation`), not the 4 the decision doc names as the eventual full set — matches the task's own "Detailed Steps" instruction exactly ("seed with `intake-parsing` and `script-generation` purposes"), just flagging since the decision doc's prose could be read either way.
- No lint rule enforces "nothing outside `llm/` imports `client.ts`/`registry.ts` directly" — verified by convention (only `index.ts`'s exports are used elsewhere) and by there being exactly one consumer so far. Worth a lint rule (e.g. `no-restricted-imports`) if more consumers make manual discipline unreliable — not built now, per Principle 10.

## Sign-Off

- Task Objective: Met
- Schema Impact: No schema changes (matches task spec)
- Business Logic: No new control flow (matches task spec) — this is a pure internal mechanism change
- Tests: Passing; real-call verification covers the non-transient path only (see above)
- Ready for Integration: Yes — Task 3 is the first real consumer
