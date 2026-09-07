# Week 2 Task 1: LLM / Text-Completion Layer

**Objective**: Build the provider-agnostic, purpose-keyed LLM/text-completion layer decided in `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`, so every future LLM call goes through one internal contract instead of a provider's SDK directly.
**Duration**: 4–6 hours
**Depends On**: None (Week 1 complete — reuses `TransientStageError`/`NonTransientStageError` from `studio/src/run-pipeline/retry-with-backoff.ts`)
**Owning Component**: Infra (shared platform layer, consumed by the Orchestrator and every future agent)
**Success Criteria**: `studio/src/llm/` exists, exports one call function returning this project's own request/response/error types, resolves purpose → provider+model via a typed registry, and no code outside `studio/src/llm/client.ts` imports a provider SDK or the underlying library.

## Task Requirement

Implement the LLM layer exactly as decided in `docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md` — read that doc in full before starting, it's the spec for this task, not just background. In short: call sites declare a *purpose* (not a model), a typed registry resolves purpose → provider + model, the layer is built internally on Vercel AI SDK but that library never leaks past `studio/src/llm/client.ts`, and there is no cross-provider fallback for MVP — one provider+model per purpose, full stop.

### Context
`AGENT_FLEET_DESIGN.md` Section 5.1 and Section 8.1 (model tiering by task shape). This layer is what makes Section 8.1's tiering table an enforced config rather than a convention.

### Acceptance Criteria
- [ ] `studio/src/llm/index.ts` exports a single call function (e.g. `callLLM({ purpose, system, messages, maxTokens })`) returning `{ text, usage, stopReason }` — this project's own types, not the library's.
- [ ] `studio/src/llm/registry.ts` is a typed `Record<Purpose, { provider, model }>`, seeded with at least `intake-parsing` and `script-generation` (the two purposes that exist or are about to).
- [ ] Errors from the underlying call are normalized to `TransientStageError`/`NonTransientStageError` at the `studio/src/llm/client.ts` boundary — reusing the existing taxonomy, not inventing a new one.
- [ ] Only `studio/src/llm/client.ts` imports Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) or any provider SDK. Verify with a grep across `studio/src/` excluding `llm/client.ts` — it should return nothing.
- [ ] `npm run typecheck`, `npm run build`, `npm run lint` all pass clean.

## Schema Impact

No schema changes.

## Business Logic / State Transition

No new `PipelineRun`/`PipelineStage` transitions — this is a pure internal refactor of *how* an LLM call is made, not *when* one happens in the state machine. The existing retry/circuit-breaker wrapper (`retry-with-backoff.ts`) still owns retry timing and attempt counting; this layer only owns translating a provider's response/error into this project's own shapes.

### Reference
`docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md` (full spec for this task) and `docs/execution/week1/BUSINESS_LOGIC.md` Section 4 (retry/circuit-breaker rules this layer sits underneath).

## Implementation

### Files to Create
- `studio/src/llm/types.ts` — this project's own `LLMRequest`/`LLMResponse`/`Purpose` types.
- `studio/src/llm/registry.ts` — the typed `Purpose → { provider, model }` config map.
- `studio/src/llm/client.ts` — the only file allowed to import Vercel AI SDK or a provider SDK; translates its request/response/error shapes into this project's own.
- `studio/src/llm/index.ts` — public exports: the `callLLM(...)` function and the types from `types.ts`. Nothing else in the codebase should import `client.ts` or `registry.ts` directly.

### Files to Modify
- `studio/package.json` — add `ai` and `@ai-sdk/anthropic` as dependencies (Groq/Gemini adapters aren't needed yet — add only when a purpose actually resolves to one).

### Key Code Patterns
```typescript
// studio/src/llm/index.ts (shape, not literal — adapt to actual Vercel AI SDK API)
export async function callLLM(req: {
  purpose: Purpose;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
}): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number }; stopReason: string }> {
  // resolves req.purpose via registry.ts, delegates to client.ts, returns this project's shape
}
```

### Detailed Steps
1. Write `types.ts` first — the `Purpose` union and request/response shapes are the contract everything else builds against.
2. Write `registry.ts` — seed with `intake-parsing` and `script-generation` purposes, both resolving to Anthropic for now (matches what's already in use).
3. Write `client.ts` — wrap Vercel AI SDK's call, catch its errors, map to `TransientStageError`/`NonTransientStageError` (rate limits and connection/server errors are transient; validation/auth errors are not — mirror the mapping `parse-brief.ts` currently does against raw Anthropic error classes).
4. Write `index.ts` — thin public surface, no library types crossing it.
5. Grep-verify the import boundary (see Acceptance Criteria).

### Integration Points
- `studio/src/run-pipeline/parse-brief.ts` is the first consumer, migrated in Task 3 of this week — not in this task. This task only builds the layer; don't touch `parse-brief.ts` here.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
```

### Expected Results
- TypeScript compilation: No errors
- ESLint: No warnings
- Import-boundary grep: no matches outside `studio/src/llm/client.ts`

### How to Verify
1. Run the three commands above.
2. If a real Anthropic key is available in `.env.local`: write a throwaway smoke script that calls `callLLM({ purpose: 'intake-parsing', ... })` with a trivial prompt and confirm real text comes back, then delete the script (this task doesn't need a permanent test harness — Task 3 covers real end-to-end verification against `parse-brief.ts`).
3. If no key is available yet: mock/stub the Vercel AI SDK response at the `client.ts` boundary to confirm the translation logic (response shape, error mapping) works without a live call, and say so plainly in the report rather than skipping verification silently.

## Additional Notes

- Don't add Groq/Gemini adapters speculatively — the decision doc is explicit that this doesn't need multi-provider support built in day one, only the *boundary* that would make adding one later a `registry.ts` + `client.ts` change, not a call-site rewrite.
- This task's report should note whichever of step 2/3 above (real key vs. mock) was used for verification, so the founder knows whether live confirmation is still outstanding.

## Links & References
- [LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md](../../decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md) — full spec for this task
- [AGENT_FLEET_DESIGN.md](../../design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md) — Section 5.1, Section 8.1
