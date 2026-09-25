# Sprint 4 Task 6: Format Library + Channel Setup API (Backend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT4_BE`.

**Objective**: Give the app a small, real set of reusable content formats to pick from when submitting
a brief, and expose enough of a channel's profile through the API for a plain "Advanced" setup screen —
deliberately not the AI-drafted wizard the source proposal also describes (see Scope note).
**Duration**: 4-6 hours
**Depends On**: Sprint 4 Task 1 (`resolveChannelConfig`, `ChannelProfileVersion`).
**Owning Component**: new `studio/src/formats/`, `studio/src/api/routers/runs.ts`,
`studio/src/api/routers/channels.ts`, `studio/src/channel-profile/resolve.ts`.
**Success Criteria**: (1) A real `runs.create` call with a `formatKey` produces a run whose resolved
`targetSeconds` matches that format's own definition, taking precedence over the channel's profile
default but not over an explicit run-level override. (2) `channels.listFormats` returns the 9 seed
formats. (3) A channel with no profile and no `formatKey` behaves exactly as before this sprint.

### Scope note — what this task deliberately does NOT build
The source proposal's R22 describes three setup paths: an AI-drafted profile from a short description,
a multi-step guided wizard with example galleries, and a raw "Advanced" fields path. Given the founder
is the only user for the next 2-3 weeks, this task (and its frontend companion,
`sprint4/tasks/frontend-task1.md`) builds **only the Advanced path** — a plain form over the real API
Task 1 already created. The AI-drafted/guided paths are real, separable scope for a later task once
testers are actually about to onboard themselves — building them now, for an audience of one, is the
exact kind of over-scoping worth avoiding. Formats themselves are a static in-repo manifest (below),
not a DB-backed, no-deploy-editable table — the proposal's "admins can add formats without a deploy" is
a real requirement once non-technical people manage formats, not yet.

## Task Requirement

### R25 (scoped) — Format manifest

**Where**: no format concept exists anywhere today.

**Fix**: new `studio/src/formats/manifest.ts`, following `audio-bed/manifest.ts`'s exact established
pattern (a static, typed, in-repo data list — not a DB table):

```typescript
export type ContentFormat = {
  key: string;
  label: string;
  targetSeconds: number;
  briefTemplate: string; // shown as placeholder/starting text in the brief form
  scriptStructure: string; // a short structural hint, passed to Script Generation as extra guidance
};

export const CONTENT_FORMATS: ContentFormat[] = [
  { key: 'countdown', label: 'Countdown', targetSeconds: 45, briefTemplate: 'Countdown of [N] [things] related to [topic]...', scriptStructure: 'Numbered items, ordered ascending or descending, each with one punchy fact.' },
  { key: 'worse-than-you-thought', label: '"X Was Worse Than You Thought"', targetSeconds: 40, briefTemplate: '[Historical event/thing] and why it was worse than most people realize...', scriptStructure: 'Open with the common perception, then escalate with 2-3 specific worse facts.' },
  { key: 'question-surprising-answer', label: 'Question → Surprising Answer', targetSeconds: 35, briefTemplate: 'A question about [topic] with a genuinely surprising answer...', scriptStructure: 'Pose the question cold-open, hold the answer until at least 1/3 through.' },
  { key: 'origin-story', label: 'Origin Story', targetSeconds: 45, briefTemplate: 'How [thing] actually came to be...', scriptStructure: 'Chronological, starting from the least expected origin point, not the well-known version.' },
  { key: 'underdog-vs-giant', label: 'Underdog vs. Giant', targetSeconds: 45, briefTemplate: '[Small/underrated thing] against [large/famous thing]...', scriptStructure: 'Frame the mismatch early, then reveal why the underdog actually won/mattered.' },
  { key: 'cost-vs-price', label: 'Cost vs. Price', targetSeconds: 40, briefTemplate: 'What [thing] really costs, beyond the sticker price...', scriptStructure: 'State the obvious price, then reveal the hidden/real cost.' },
  { key: 'what-it-feels-like', label: '"What It Feels Like To…"', targetSeconds: 40, briefTemplate: 'What it actually feels like to [experience]...', scriptStructure: 'Second-person, sensory, present-tense narration.' },
  { key: 'myth-vs-fact', label: 'Myth vs. Fact', targetSeconds: 40, briefTemplate: 'A common myth about [topic] and the real fact...', scriptStructure: 'State the myth as most people believe it, then correct it directly.' },
  { key: 'top-3', label: 'Top 3', targetSeconds: 40, briefTemplate: 'The top 3 [things] related to [topic]...', scriptStructure: 'Exactly 3 items, most-to-least or least-to-most surprising.' },
];

export const FORMAT_KEYS = CONTENT_FORMATS.map((f) => f.key) as [string, ...string[]];
export function findFormat(key: string): ContentFormat | undefined {
  return CONTENT_FORMATS.find((f) => f.key === key);
}
```

Nine formats, matching the source proposal's own list exactly — a channel doesn't need more than this
to start comparing formats against each other, which is the actual goal (testing what performs, not
building a content-format catalog business).

**Fix — resolver gains a format precedence level**: `channel-profile/resolve.ts`'s `resolveChannelConfig`
(Task 1) gains an optional `formatKey?: string` param. When present and valid, `findFormat(formatKey)`'s
`targetSeconds` takes precedence over the profile's `script.targetSeconds` (but not over an explicit
run-level override, if Task 2 ever adds one for length) — the resolution order becomes: run override →
**format** → profile → legacy → platform default, matching the source proposal's own stated order now
that a format concept actually exists. `scriptStructure` is passed through as one more optional string
appended to Script Generation's prompt (Task 2's `buildUserMessage`, extended once more) when a format
is set.

**Fix — API surface**: `channels.listFormats` (new query, no auth beyond a valid session — this is
static, non-sensitive reference data) returns `CONTENT_FORMATS`. `runs.create`'s input gains
`formatKey: z.enum(FORMAT_KEYS).optional()`, validated at the edge same as `voice`/`visualSource`,
folded into `creationOptions` (extending the object once more, same pattern every prior field used).

**Verify**: a real `runs.create` call with `formatKey: 'countdown'` on a channel whose profile sets
`script.targetSeconds: 20` → confirm the *format's* 45s wins, not the profile's 20s (via the resolved
config a later stage reads — check this with a unit test on `resolveChannelConfig` directly, not just
an end-to-end run, since the precedence is the thing actually being verified). A run with no
`formatKey` → unaffected, profile/legacy/default resolution exactly as Task 1 already verified.

## Schema Impact
No schema changes — `formatKey` lives in the existing `creationOptions` Json column, same as every
other structured creation choice.

## Business Logic / State Transition
No new transitions. Purely another input into the existing resolution/prompt-building path Tasks 2-4
already established.

## Implementation

### Files to Create
- `studio/src/formats/manifest.ts`
- `studio/src/formats/manifest.test.ts` (basic shape/uniqueness checks — every key unique, every
  `targetSeconds` within the platform 15-60s bound)

### Files to Modify
- `studio/src/channel-profile/resolve.ts` — the format precedence level
- `studio/src/channel-profile/resolve.test.ts` — a new precedence test case (format beats profile)
- `studio/src/api/routers/runs.ts` — `formatKey` input
- `studio/src/api/routers/channels.ts` — `listFormats`
- `studio/src/agents/script-generation/index.ts` — accept and use `scriptStructure` (Task 2's
  `buildUserMessage`, one more optional line)

## Testing

```bash
npm run build && npm run lint && npx tsc --noEmit
npx vitest run formats channel-profile runs
```

## Report Template
`docs/execution/sprint4/reports/task6.md`. Note plainly that this is the Advanced-only slice, with the
AI-drafted/guided setup paths named as explicit, deferred follow-on scope, not silently dropped.

## Links & References
- `sprint4/tasks/task1.md`, `task2.md` — the resolver and prompt-building this task extends.
- `sprint4/tasks/frontend-task1.md` — the setup screen and format picker consuming this API.
