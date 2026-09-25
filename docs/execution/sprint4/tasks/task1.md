# Sprint 4 Task 1: Channel Profile Model + Shared Resolver

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT4_BE`
(first task of a new sprint — create it from a current `main`, per the template's Git Workflow).

**Objective**: Add a versioned `ChannelProfile` concept and the one shared resolver every later
Sprint 4 task will call, so a channel in any niche can be configured through data instead of code —
with a hard guarantee that a channel with no profile behaves exactly as it does today.
**Duration**: 6-8 hours
**Depends On**: Sprint 3 (all 7 tasks, merged) — this task threads through `ctx.userId`/`ctx.tenantId`
(Task 1/J), `canResolveGate` (Task 2/K1), and reads `Channel.defaultVoice` (Sprint 2 Task 1) as one of
the resolver's fallback levels.
**Owning Component**: `studio/src/models/schema.prisma`, new `studio/src/channel-profile/`,
`studio/src/api/routers/channels.ts`.
**Success Criteria**: (1) A real migration adds `channel_profile_versions`, `Channel.activeProfileVersionId`,
`PipelineRun.profileVersionId` — all nullable/additive, no backfill. (2) A new, pure, unit-tested
`resolveChannelConfig()` function implements the resolution order (run override → profile → legacy
`Channel` field → platform default) and returns bit-for-bit the same values a channel with no profile
already gets today from `resolveVoice`/`plan.ts`'s override logic. (3) A real owner-scoped API to
create/read profile versions and set a channel's active one, with zod validation and readable errors.

## Task Requirement

### Why this shape, not a JSON column on `Channel`

A profile is versioned data that gets read by every pipeline stage and needs its own history (a
channel's setup changes over time, and an in-flight run must keep the version it started with —
§Business Logic below) — the same reason `PipelineStage`/`ReviewLog` are their own tables rather than
JSON blobs on `PipelineRun`. A separate `channel_profile_versions` table, not a mutated JSON column on
`Channel`, keeps that history queryable and matches this project's existing convention for anything
versioned or joined.

### R1 — `ChannelProfileVersion` data shape

Not every field the eventual design calls for — only what Sprint 4 Tasks 2-4 actually read. Scoped
deliberately narrow; a later sprint extends this same object the same way Sprint 2 Task 1's
`creationOptions` was designed to be extended by Task 2/3, rather than adding parallel columns:

```typescript
// studio/src/channel-profile/schema.ts
import { z } from 'zod';
import { TTS_VOICE_KEYS } from '../media';
import { VISUAL_SOURCES, AUDIO_LAYERS } from '../agents/video-generation/plan';

export const ChannelProfileScriptSchema = z.object({
  guide: z.string().optional(),
  targetSeconds: z.number().int().min(15).max(60).optional(),
  bannedOpeners: z.array(z.string()).optional(),
  bannedEndings: z.array(z.string()).optional(),
  factPolicy: z.enum(['brief-only', 'brief-plus-common']).optional(),
}).strict();

export const ChannelProfileVisualSchema = z.object({
  defaultSource: z.enum(VISUAL_SOURCES).optional(),
  stylePrompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  secondsPerStill: z.number().min(1).max(10).optional(),
}).strict();

export const ChannelProfileAudioSchema = z.object({
  defaultVoice: z.enum(TTS_VOICE_KEYS).optional(),
  defaultMoodTag: z.enum(AUDIO_LAYERS).optional(),
}).strict();

export const ChannelProfilePackagingSchema = z.object({
  titleGuidance: z.string().optional(),
  descriptionTemplate: z.string().optional(), // supports {summary} {sources} {editor} {hashtags}
  hashtagsBase: z.array(z.string()).optional(),
  editorCredit: z.boolean().optional(),
  // R18 (Task 5) — sent explicitly to YouTube's videos.insert on upload,
  // never left unset to fall through to a channel-level Studio default.
  // `selfDeclaredMadeForKids` is the real YouTube Data API v3 field name
  // (`status.selfDeclaredMadeForKids`) — every upload must state one way or
  // the other per YouTube's own COPPA-compliance policy; `youtube-client.ts`
  // currently sends neither this nor categoryId/defaultLanguage at all
  // (confirmed by reading the file), silently relying on whatever the
  // channel's own Studio-level defaults happen to be — a real, unaudited gap
  // for a founder running several differently-audienced channels.
  selfDeclaredMadeForKids: z.boolean().optional(),
  categoryId: z.string().optional(), // YouTube's numeric category id, as a string (e.g. "27" = Education)
  defaultLanguage: z.string().optional(), // BCP-47 (e.g. "en")
}).strict();

export const ChannelProfileDataSchema = z.object({
  script: ChannelProfileScriptSchema.optional(),
  visual: ChannelProfileVisualSchema.optional(),
  audio: ChannelProfileAudioSchema.optional(),
  packaging: ChannelProfilePackagingSchema.optional(),
}).strict();
export type ChannelProfileData = z.infer<typeof ChannelProfileDataSchema>;
```

Every field optional, every object optional — an empty `{}` is a fully valid profile (falls through
to legacy/platform defaults on every field). `.strict()` so a typo'd field name fails validation
loudly at write time instead of silently being ignored.

### R2 — Profile management API

**Where**: `api/routers/channels.ts` — the existing `channelsRouter`, same ownership-check pattern
`getYoutubeConnectUrl`/`disconnectYoutube` already use (`canResolveGate`).

**Fix**: three new procedures:
- `channels.createProfileVersion({ channelId, data })` — mutation, ownership-checked via
  `canResolveGate` (same posture as connecting YouTube — configuring a channel's whole production
  behavior is at least as sensitive). Validates `data` against `ChannelProfileDataSchema` (a failed
  validation returns a structured `TRPCError({code: 'BAD_REQUEST'})` with Zod's own readable message,
  not a generic 500). Inserts a new `ChannelProfileVersion` row with `version = (current max version
  for this channel) + 1` (starts at 1), sets it as the channel's `activeProfileVersionId` in the same
  transaction, and records `createdByUserId: ctx.userId ?? null`.
- `channels.getActiveProfile({ channelId })` — query, tenant-scoped like `channels.get`. Returns the
  full `ChannelProfileVersion` row, or `null` if the channel has never had one (a fully valid,
  expected state — not an error).
- `channels.listProfileVersions({ channelId })` — query, tenant-scoped, newest first. The version
  history R28 (a later task) surfaces in the app.

### R3 — The shared resolver

**Where**: new `studio/src/channel-profile/resolve.ts`. Pure, DB-free (same posture as
`media/registry.ts`'s `resolveVoice`) — callers fetch the channel/profile/run once and pass the
already-loaded objects in, so this stays directly unit-testable without a database.

**Fix**:

```typescript
// studio/src/channel-profile/resolve.ts
import type { ChannelProfileData } from './schema';
import { DEFAULT_TTS_VOICE } from '../media';

export type ResolvedChannelConfig = {
  scriptGuide: string | null;
  targetSeconds: number; // platform default: 45
  bannedOpeners: string[];
  bannedEndings: string[];
  factPolicy: 'brief-only' | 'brief-plus-common'; // platform default: 'brief-plus-common' — today's behavior
  visualDefaultSource: 'stock-footage' | 'ai-stills' | null;
  visualStylePrompt: string | null;
  visualNegativePrompt: string | null;
  audioDefaultVoice: string; // always concrete — mirrors resolveVoice's own guarantee
  audioDefaultMoodTag: string | null;
  titleGuidance: string | null;
  descriptionTemplate: string | null;
  hashtagsBase: string[];
  editorCredit: boolean;
  // R18 (Task 5) — no legacy field or run override for any of these three;
  // platform defaults matter here (see below) since an unset value is a real
  // upload-time gap, not a harmless omission.
  selfDeclaredMadeForKids: boolean; // platform default: false — never left unset
  categoryId: string | null; // platform default: null — YouTube falls back to its own default category
  defaultLanguage: string | null; // platform default: null — YouTube falls back to the channel's own setting
};

export function resolveChannelConfig(params: {
  profile: ChannelProfileData | null; // the channel's active ChannelProfileVersion.data, or null
  legacyStyleGuide: string | null; // Channel.styleGuide
  legacyDefaultVoice: string | null; // Channel.defaultVoice
  runOverrideVoice?: string | null; // PipelineRun.creationOptions.voice
  runOverrideVisualSource?: string | null; // PipelineRun.creationOptions.visualSource
  runOverrideAudioLayer?: string | null; // PipelineRun.creationOptions.audioLayer
}): ResolvedChannelConfig {
  const p = params.profile ?? {};
  return {
    scriptGuide: p.script?.guide ?? params.legacyStyleGuide ?? null,
    targetSeconds: p.script?.targetSeconds ?? 45,
    bannedOpeners: p.script?.bannedOpeners ?? [],
    bannedEndings: p.script?.bannedEndings ?? [],
    factPolicy: p.script?.factPolicy ?? 'brief-plus-common',
    visualDefaultSource: params.runOverrideVisualSource ?? p.visual?.defaultSource ?? null,
    visualStylePrompt: p.visual?.stylePrompt ?? null,
    visualNegativePrompt: p.visual?.negativePrompt ?? null,
    audioDefaultVoice: params.runOverrideVoice ?? p.audio?.defaultVoice ?? params.legacyDefaultVoice ?? DEFAULT_TTS_VOICE,
    audioDefaultMoodTag: params.runOverrideAudioLayer ?? p.audio?.defaultMoodTag ?? null,
    titleGuidance: p.packaging?.titleGuidance ?? null,
    descriptionTemplate: p.packaging?.descriptionTemplate ?? null,
    hashtagsBase: p.packaging?.hashtagsBase ?? [],
    editorCredit: p.packaging?.editorCredit ?? false,
    selfDeclaredMadeForKids: p.packaging?.selfDeclaredMadeForKids ?? false,
    categoryId: p.packaging?.categoryId ?? null,
    defaultLanguage: p.packaging?.defaultLanguage ?? null,
  };
}
```

**Why `factPolicy` defaults to `'brief-plus-common'`, not `'brief-only'`**: today's `script-generation`
prompt already lets the model draw on general knowledge alongside the brief — a platform default of
`'brief-only'` would be a real behavior change for every existing channel. `'brief-plus-common'` is
the one that reproduces current behavior; Sprint 4 Task 2 is what actually reads this field.

**Why `selfDeclaredMadeForKids` defaults to `false`, not left unresolved**: unlike every other
packaging field (which fall through to `null`/empty when unset, letting the caller decide whether to
omit them from the upload), this one platform-defaults all the way to a concrete `false` — Task 5
sends it on every real upload, never omitted, since YouTube's own compliance policy expects every
upload to state this one way or the other. `false` is the correct default for this project's actual
content (adult-audience history/trivia-style Shorts, not child-directed) — a channel that genuinely
needs `true` sets it explicitly via its profile.

**Verify**: unit tests (mirroring `media/registry.test.ts`'s shape) proving: (a) `profile: null` plus
no run overrides plus no legacy fields reproduces every platform default listed above, exactly; (b) a
legacy-only channel (`legacyStyleGuide`/`legacyDefaultVoice` set, `profile: null`) resolves those two
fields to the legacy values and everything else to platform defaults — proving Sprint 1-3 channels
keep working unchanged; (c) a run override always wins over the profile, which always wins over the
legacy field, which always wins over the platform default, tested as one explicit precedence case per
field family (voice, visualSource).

## Schema Impact

### Tables Created
- `channel_profile_versions` — see R1's shape above. `data` is the validated
  `ChannelProfileDataSchema` JSON. `(channelId, version)` unique.

### Tables Modified
- `channels` — add `activeProfileVersionId String? @db.Uuid` (nullable FK). `null` (every existing
  channel) means "no profile — resolve everything from legacy fields/platform defaults," a fully
  valid, expected state, not a migration gap to backfill.
- `pipeline_runs` — add `profileVersionId String? @db.Uuid` (nullable FK). Set once, at run creation,
  to whatever the channel's `activeProfileVersionId` was at that moment (R28 — an in-flight run keeps
  the version it started with even if the channel's active profile changes later). `null` for every
  existing run and for any new run on a still-profile-less channel.

### Prisma relations — verify before migrating

Two relations between `Channel` and `ChannelProfileVersion` (the reverse-list `profileVersions`, and
the single `activeProfileVersion`) need distinct `@relation(name: ...)` attributes so Prisma doesn't
conflate them — this is the one part of this task's schema most likely to need a second pass. Run
`npx prisma validate` before `prisma migrate dev`, don't assume the first draft compiles:

```prisma
model Channel {
  // ...existing fields...
  activeProfileVersionId String?                 @db.Uuid
  activeProfileVersion   ChannelProfileVersion?   @relation("ActiveChannelProfile", fields: [activeProfileVersionId], references: [id])
  profileVersions        ChannelProfileVersion[]  @relation("ChannelProfileVersions")
}

model ChannelProfileVersion {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  channelId       String   @db.Uuid
  version         Int
  data            Json
  createdByUserId String?  @db.Uuid
  createdAt       DateTime @default(now())

  channel           Channel      @relation("ChannelProfileVersions", fields: [channelId], references: [id])
  activeForChannels Channel[]    @relation("ActiveChannelProfile")
  createdByUser     User?        @relation(fields: [createdByUserId], references: [id])
  pipelineRuns      PipelineRun[]

  @@unique([channelId, version])
  @@index([channelId], map: "idx_channel_profile_versions_channel")
  @@map("channel_profile_versions")
}
```

`User` gains a reverse `createdProfileVersions ChannelProfileVersion[]`. `PipelineRun` gains
`profileVersionId String? @db.Uuid` + `profileVersion ChannelProfileVersion? @relation(fields: [profileVersionId], references: [id])`.

### Migration File
`prisma migrate dev --name sprint4_channel_profiles` — confirm `prisma migrate status` reports
"Database schema is up to date!" afterward, the same bar every prior migration in this project used.

## Business Logic / State Transition

### What this task implements
No new `PipelineRun`/`PipelineStage` transitions. `createRun` (`run-pipeline/state-machine.ts`) gains
one new step: read the target channel's `activeProfileVersionId` and copy it onto the new
`PipelineRun.profileVersionId` at creation time — a snapshot, never re-read or re-resolved later in
that run's life. This is what makes R28 possible: a channel's profile can change mid-run without
retroactively changing what an already-running video is being produced against.

### Preconditions
A `Channel` row exists. Its `activeProfileVersionId` is either null (no profile — the common case for
every pre-Sprint-4 channel) or a real `ChannelProfileVersion` row.

### Postconditions
Every `PipelineRun` created from this task onward has a `profileVersionId` that is either null (channel
has no profile) or points at a real, immutable snapshot of that channel's profile data at creation
time — never a live reference that could resolve differently on a later read.

### Failure Modes & Handling
`createProfileVersion`'s zod validation failure is a structured `BAD_REQUEST` at the API edge, before
any row is written — same "reject bad structured input at the edge" posture `runs.create`'s
`voice`/`visualSource` validation already uses. No new stage-level failure mode — `resolveChannelConfig`
itself cannot throw (every field has a defined fallback all the way to a platform default).

## Implementation

### Files to Create
- `studio/src/channel-profile/schema.ts` — R1
- `studio/src/channel-profile/resolve.ts` — R3
- `studio/src/channel-profile/resolve.test.ts` — R3's verification
- `studio/src/models/repositories/channel-profile-version.repository.ts` — `insertProfileVersion`
  (transactional: insert + set `channels.activeProfileVersionId`), `findActiveProfileForChannel`,
  `listProfileVersionsForChannel`, `findProfileVersionById` (used by Task 2+'s stage code to fetch a
  run's own snapshotted version, not necessarily the channel's current active one)

### Files to Modify
- `studio/src/models/schema.prisma` — Schema Impact above
- `studio/src/api/routers/channels.ts` — R2's three new procedures
- `studio/src/run-pipeline/state-machine.ts` — `createRun` snapshots `profileVersionId` (Business
  Logic above)
- `studio/src/types/channel.types.ts` / `types/pipeline.types.ts` — domain types gain
  `activeProfileVersionId`/`profileVersionId`

### Integration Points
`resolveChannelConfig` is a leaf module with no imports from `run-pipeline/` or `agents/` — Sprint 4
Tasks 2-4 import it, not the other way around, so this task can be verified in complete isolation
before anything downstream depends on it.

## Testing

```bash
npm run build && npm run lint && npx tsc --noEmit
npx vitest run channel-profile
```

### How to Verify
1. `npx prisma validate` clean, then `prisma migrate dev --name sprint4_channel_profiles` applies
   cleanly to the real dev DB; `prisma migrate status` confirms up to date.
2. `resolve.test.ts`'s three cases (above) all pass.
3. Real, live: call `channels.createProfileVersion` for a real existing channel with a real
   `{ script: { guide: "test" } }` payload via the real API (authenticated session) — confirm via a
   direct Postgres read that a `channel_profile_versions` row exists, `channels.activeProfileVersionId`
   now points at it, and `channels.getActiveProfile` returns it. Submit a second version — confirm
   `version = 2`, the channel's active pointer moves to it, and `listProfileVersions` returns both,
   newest first.
4. Real, live regression: submit a brief through the existing, unchanged `runs.create` against a
   channel that has **never** had a profile created — confirm the resulting `PipelineRun.profileVersionId`
   is `null` and the run completes through the pipeline exactly as it did before this task (no other
   stage reads `resolveChannelConfig` yet, so this is really confirming this task introduced zero
   behavior change on its own — Task 2 is what starts consuming the resolved config).

## Report Template
`docs/execution/sprint4/reports/task1.md`, standard shape (see `TASK_TEMPLATE.md`). Since this is
Sprint 4's first task, also create `docs/execution/sprint4/STATUS.md` (upsert this task's row),
`docs/execution/sprint4/SCHEMA.md`, and `docs/execution/sprint4/BUSINESS_LOGIC.md` per the template's
"created by whichever task is first" convention — a skeleton for all six tasks already exists in
`STATUS.md`; update this task's row in place rather than rewriting the file.

## Links & References
- The channel-agnostic content & setup proposal this sprint implements (kept in the `7AI` Claude
  Project — ask the founder if you need the source doc reproduced locally).
- [SPRINT_ROADMAP.md](../../roadmap/SPRINT_ROADMAP.md) — Sprint 4's place in the plan.
- `sprint2/BUSINESS_LOGIC.md` Task 1 — the three-step resolution-order precedent this task's resolver
  extends to a fourth (profile) level.
- `sprint4/tasks/task5.md` (R18) — the real consumer of `selfDeclaredMadeForKids`/`categoryId`/
  `defaultLanguage`, sent explicitly on upload instead of left to YouTube/channel defaults.
