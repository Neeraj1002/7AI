# Sprint 3 Schema Delta

**Status**: One real migration (Task 1 — `users`, `login_tokens`), first schema change of Sprint 3.
Incremental against `AGENT_FLEET_DESIGN.md` Section 6's cumulative reference and `sprint2/SCHEMA.md`'s
state at Sprint 2's close, same convention every prior week/sprint's `SCHEMA.md` uses.

## Task 1 — `users`, `login_tokens` (J1/J2), a real migration

Two new tables, one real Prisma migration (`prisma migrate dev --name sprint3_users_and_login_tokens`):

```prisma
model User {
  id       String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String  @db.Uuid
  email    String  @unique @db.VarChar(255)
  name     String? @db.VarChar(255)
  role     String  @default("owner") @db.VarChar(20) // 'owner' | 'approver', VARCHAR + CHECK
  telegramChatId String? @db.VarChar(50) // reserved for Sprint 3 Task 2/K, unused this task
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now())

  tenant      Tenant       @relation(fields: [tenantId], references: [id])
  loginTokens LoginToken[]
}

model LoginToken {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String    @db.Uuid
  jti       String    @unique @db.VarChar(64)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

```sql
CREATE TABLE "users" ( ... );
CREATE TABLE "login_tokens" ( ... );
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('owner', 'approver'));
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id");
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id");
```

`role` uses this schema's established "VARCHAR + CHECK, not a native Postgres enum" convention (see
`schema.prisma`'s own header comment) — same pattern `pipeline_runs.status`, `pipeline_stages.status`,
and `channels.priorsScope` already use. `Tenant` gains a `users User[]` relation — no new column on
`Tenant` itself.

### Tenant↔User relationship decision (J1)
A `Tenant` is one account (an individual tester or a small team sharing one YouTube-adjacent
operation, per `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` §0's own "the thing that's shared
infrastructure stays centralized" framing). A `User` belongs to exactly one `Tenant` — a foreign key,
not a many-to-many join table — since §0 frames each of the ~10 testers as bringing their own
account, not joining someone else's; a many-tenant-per-user model would be real added complexity with
no current requirement asking for it.

### Seed data (J1) — the founder's own User row
The migration's own `-- SeedData` section inserts the founder's real `User` row
(`id: '00000000-0000-0000-0000-0000000000f1'`, `role: 'owner'`, **email:
`neeraj100296@gmail.com`**) tied to the existing seeded `MVP_TENANT_ID` tenant, `ON CONFLICT
("email") DO NOTHING` (safe to re-run). Without this, Task 2 (J2, login) has no one to log in as, and
every existing dry-run/dashboard flow would silently lose its implicit "owner." Stated plainly here
per this task's own "don't pick a real value silently" instruction — same discipline Week 2 Task 4
used for `budgetCeilingUsd`.

### `login_tokens` — the real replay guard (J2)
One row per issued magic-link. The JWT signature alone only proves the token was issued by this
server; `usedAt` (checked and set at `/auth/verify`) is what actually prevents the same real link
being used twice. `expiresAt` is a second, DB-level check independent of trusting the JWT's own `exp`
claim.

### Domain types
`types/user.types.ts` — `User`, `UserRole = 'owner' | 'approver'`, `CreateUserInput`.
`types/login-token.types.ts` — `LoginToken`, `CreateLoginTokenInput`.
Both re-exported from `types/index.ts`, same convention every other domain type module uses.

## Task 2 — `Channel.ownerUserId` (K1), a real migration with a real backfill

One additive, nullable column, real migration (`prisma migrate dev --name sprint3_channel_owner`):

```prisma
model Channel {
  // ...existing fields...
  ownerUserId String? @db.Uuid // nullable FK to User
  ownerUser   User?   @relation(fields: [ownerUserId], references: [id])
}
```

```sql
ALTER TABLE "channels" ADD COLUMN "ownerUserId" UUID;
CREATE INDEX "idx_channels_owner" ON "channels"("ownerUserId");
ALTER TABLE "channels" ADD CONSTRAINT "channels_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

`ON DELETE SET NULL` (Prisma's own inference from the field being optional) — deleting the owning
`User` row degrades the channel to "any owner-role user on the tenant may resolve it" rather than
leaving a dangling FK or blocking the delete. Nullable by design, not an oversight: a channel created
before this migration, or one whose owning user was since removed, must never become permanently
unapprovable.

**Backfill (not purely additive-and-untouched, unlike most Sprint 3 migrations so far)**: every
existing `Channel` row gets its tenant's seeded `'owner'`-role user (earliest-created if a tenant
somehow has more than one, deterministic via `createdAt ASC`):

```sql
UPDATE "channels" c
SET "ownerUserId" = (
  SELECT u.id FROM "users" u
  WHERE u."tenantId" = c."tenantId" AND u.role = 'owner'
  ORDER BY u."createdAt" ASC LIMIT 1
)
WHERE c."ownerUserId" IS NULL;
```

Confirmed live: both real pre-existing channels (the founder's own, and the second tenant created
during Task 1's own verification) were correctly backfilled to their respective tenant's real seeded
owner — see `sprint3/reports/task2.md`.

`Channel` (domain type) gained `ownerUserId: string | null`. `CreateChannelInputSchema` gained an
optional `ownerUserId` — set by the creating user at channel-creation time (Task 6/O's future
`channels.create` mutation; `manage-channels/channel-cap.ts`'s `createChannelWithCapCheck` already
forwards it unchanged, since it had no real caller before this task).

## Task 3 — `notifications`, `telegram_link_codes` (K2), a real migration

Two new tables, one real Prisma migration
(`prisma migrate dev --name sprint3_notifications_and_telegram_linking`):

```prisma
model Notification {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String    @db.Uuid
  channelId  String?   @db.Uuid   // nullable — see deviation note below
  userId     String    @db.Uuid
  kind       String    @db.VarChar(20) // 'notify' | 'approval_request', VARCHAR + CHECK
  message    String    @db.Text
  threadKey  String?   @db.VarChar(255)
  resolvedAt DateTime?
  createdAt  DateTime  @default(now())
}

model TelegramLinkCode {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code      String    @unique @db.VarChar(20)
  userId    String    @db.Uuid
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}
```

```sql
CREATE TABLE "notifications" ( ... );
CREATE TABLE "telegram_link_codes" ( ... );
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("kind" IN ('notify', 'approval_request'));
```

**Real deviation from the task's own initial sketch**: `Notification.channelId` is nullable, not
required as the task text implied. A tenant-wide notification — the daily digest, which spans every
channel on a tenant, not one — has no single channel to attribute the row to. Every gate-related row
(`kind: 'approval_request'`, and the reminder variant of `'notify'`) sets a real `channelId`; only the
digest leaves it null. See `sprint3/reports/task3.md`.

**Data migration (not purely additive)**: the founder's own seeded `User` row gets its real,
already-working Telegram chat id carried over directly from this environment's real
`TELEGRAM_FOUNDER_CHAT_ID` (`8641987627`) — the one real regression risk this task carries, stated
plainly per the task's own instruction. Confirmed live afterward via a direct DB read.

`types/notification.types.ts` — `Notification`, `NotificationKind = 'notify' | 'approval_request'`,
`CreateNotificationInput`. `types/telegram-link-code.types.ts` — `TelegramLinkCode`,
`CreateTelegramLinkCodeInput`. Both re-exported from `types/index.ts`.

## Task 4 — No schema changes (L1/L2)

`AgentQuota`'s shape is unchanged (`week2/SCHEMA.md`) — this task adds a write path
(`insertAgentQuota`) to its repository, since only `findAgentQuota` existed before. Also adds
`insertTenant` (`tenant.repository.ts`) and a transaction-capable `insertUser` (`user.repository.ts`,
gained an optional `client: DbClient` parameter) — none of these are schema changes, all three
repositories already had a table to write to; they simply had no insert path at all, or (for `User`)
no transaction-aware one. `scripts/invite-tenant.ts` calls all three inside one
`prisma.$transaction`, so a `Tenant` is never created without its owning `User` and `AgentQuota` rows.

L2 is a real, live investigation — no code, no schema impact at all.

## Task 5 — `AgentCredential` (M1), a real migration; the Week 1/4 deferral finally picked up

One new table, one real Prisma migration
(`prisma migrate dev --name sprint3_agent_credentials`):

```prisma
model AgentCredential {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  channelId             String   @unique @db.Uuid
  platform              String   @db.VarChar(20)
  refreshTokenEncrypted String   @db.Text
  encryptionKeyVersion  Int      @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now())

  channel Channel @relation(fields: [channelId], references: [id])

  @@unique([channelId, platform])
  @@map("agent_credentials")
}
```

```sql
CREATE TABLE "agent_credentials" ( ... );
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_platform_check" CHECK ("platform" IN ('youtube'));
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id");
```

`channelId` carries **both** a field-level `@unique` (required for Prisma's one-to-one
`Channel.agentCredential AgentCredential?` back-relation) **and** a compound `@@unique([channelId,
platform])` matching the task's own literal spec — the two coexist fine in Postgres; the field-level
one is what makes the one-to-one relation valid, the compound one is what the task asked for.
`platform` reuses the `VarChar(20)` + `CHECK` convention every other constrained-string column in this
schema uses (`role`, `Notification.kind`, etc.) rather than a native Postgres enum — currently only
`'youtube'` is valid, same set `Channel.platform` already allows.

`refreshTokenEncrypted` stores `base64(iv(12 bytes) || authTag(16 bytes) || ciphertext)` — AES-256-GCM
via Node's built-in `crypto` module, no new dependency. `encryptionKeyVersion` (default 1) exists so a
future key rotation doesn't force re-consenting every channel at once, even though only one key
version is ever issued by this task.

### `models/credential-crypto.ts` — the only file allowed to touch `CREDENTIAL_ENCRYPTION_KEY`
`encryptRefreshToken`/`decryptRefreshToken`, keyed off a new required env var
`CREDENTIAL_ENCRYPTION_KEY` (32 random bytes, base64 — `openssl rand -base64 32`, same "tell the
founder exactly what to generate and where it goes" treatment `.env.example` gives every other
credential). Placed in `models/` rather than `agents/publishing/` since Performance Analytics'
clients need it too, and agents don't import from one another's directories
(`AGENT_FLEET_DESIGN.md` Principle 5).

### `agent-credential.repository.ts`
`findByChannel`, `upsertForChannel` (encrypts on write), `deleteForChannel` (M2's disconnect path),
plus `findDecryptedRefreshTokenForChannel` — one function beyond the task's own literal 3-function
list, added because M3's three client `getOAuthClient()`s all need "give me channel X's real,
decrypted token or `null`," and duplicating that decrypt-and-null-check logic three times across
`agents/publishing/` and `agents/performance-analytics/` would have violated this same schema's own
DRY convention for repository-owned logic.

### Domain types
`types/agent-credential.types.ts` — `AgentCredential` (`refreshTokenEncrypted` deliberately **not**
exposed on the domain type returned to callers outside the repository — only
`findDecryptedRefreshTokenForChannel`'s plaintext return value is meant to leave this file).
Re-exported from `types/index.ts`.

### Real verification: a genuine ciphertext, not the plaintext re-encoded
A real, live encrypt→store→read→decrypt round trip against the founder's actual migrated refresh
token — see `sprint3/reports/task5.md` for the full detail, including a **direct raw-SQL column
read** (bypassing the repository's own decrypt path entirely) confirming the stored
`refreshTokenEncrypted` value: (a) does not contain the real plaintext token as a substring, (b)
decodes to 131 raw bytes (12-byte IV + 16-byte auth tag + ~103 ciphertext bytes — consistent with a
real Google refresh token's length, not a fixed/dummy size), and (c) decrypts back to the exact
original plaintext via the repository's real decrypt path.

## Task 6 — No schema changes (N1/N2)

`Channel`, `CreateChannelInputSchema`, and `AgentCredential` are all unchanged — every piece this task
needed (the cap-check function, the input schema, the credential-existence lookup) already existed
from Tasks 2/5 and Sprint 1. `hasYoutubeCredential` is a derived field computed at query time
(`api/routers/channels.ts`'s `withHasYoutubeCredential`), not a column — no migration.

## Task 7 — Retire Telegram, add real push (O1/O2)

Reopens Sprint 3 after it was first marked closed (see `sprint3/STATUS.md`'s own note) — a real
product decision to retire Telegram as an application dependency entirely, not a bug fix. One real
migration (`sprint3_retire_telegram_add_push`):

```prisma
model User {
  // ...
  // Sprint 3 Task 7 (O1) — replaces telegramChatId (retired by this same
  // task's O2). null means "in-app notifications only."
  expoPushToken String? @db.VarChar(255)
  // ...
}
```

```sql
ALTER TABLE "users" ADD COLUMN "expoPushToken" VARCHAR(255);
ALTER TABLE "telegram_link_codes" DROP CONSTRAINT "telegram_link_codes_userId_fkey";
DROP TABLE "telegram_link_codes";
ALTER TABLE "users" DROP COLUMN "telegramChatId";
```

The `TelegramLinkCode` model and its `@@map("telegram_link_codes")` table — Task 3 (K2)'s `/link
<code>` linking flow — are gone entirely, along with `User.telegramChatId` and the
`User.telegramLinkCodes` reverse relation. `Notification` is unchanged (already channel-agnostic, per
Task 3's own note). `Tenant.lastFounderDigestSentAt` is unchanged (O3 keeps the existing tenant-scoped
cadence model, see `BUSINESS_LOGIC.md`).

Applied via this project's established apply-then-fix-checksum pattern (`prisma migrate dev` refuses
non-interactively when a column/table being dropped isn't empty — real data existed: the founder's own
`telegramChatId` and 2 `telegram_link_codes` rows), confirmed via `prisma migrate status` reporting
"Database schema is up to date!" afterward.

### Domain types
`types/user.types.ts` — `User.telegramChatId` → `User.expoPushToken`. `types/telegram-link-code.types.ts`
deleted entirely (no replacement type needed — push tokens live directly on `User`, no separate
short-lived-code table the way Telegram linking needed one).

## Reference
- `docs/execution/sprint2/SCHEMA.md` — the schema this sprint's first task extends
- `AGENT_FLEET_DESIGN.md` Section 6 — the cumulative schema reference
- `week1/SCHEMA.md` / `week4/SCHEMA.md` — the original `AgentCredential` deferral note this task
  finally picks up ("a Week 2+ task once a second channel makes env-var-per-channel unworkable")
