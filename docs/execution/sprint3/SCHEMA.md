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

## Reference
- `docs/execution/sprint2/SCHEMA.md` — the schema this sprint's first task extends
- `AGENT_FLEET_DESIGN.md` Section 6 — the cumulative schema reference
