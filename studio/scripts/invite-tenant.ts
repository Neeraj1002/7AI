// Sprint 3 Task 4 (L1) — founder-operator invite flow: a new Tenant + owning
// User(role: 'owner') + AgentQuota, all created in one transaction so no
// tenant is ever left in the "exists but can't actually run anything" state
// NoBudgetConfiguredError previously allowed (exactly one AgentQuota row had
// ever existed before this task — the founder's own, seeded by hand in Week
// 2 Task 4). Not a public signup form — Task 1's own note explicitly defers
// self-serve account creation, matching MVP_PART2 §0's "~10 testers,
// founder-controlled" framing. Same shape/convention as
// scripts/set-channel-default-voice.ts.
//
// Usage:
//   npx tsx scripts/invite-tenant.ts "<tenant name>" <ownerEmail> ["<owner name>"]

import { prisma } from '../src/models/prisma-client';
import { insertTenant } from '../src/models/repositories/tenant.repository';
import { insertUser, findUserByEmail } from '../src/models/repositories/user.repository';
import { insertAgentQuota } from '../src/models/repositories/agent-quota.repository';

// MVP_PART2 §0's own deliberate testing-phase default: "AI costs on us."
// Not the permanent model — the same real dollar figure Week 2 Task 4 chose
// for the founder's own original AgentQuota row (never explicitly confirmed
// by the founder then, either) — reused here rather than inventing a
// different number, but flagged again: **this needs real founder
// confirmation**, same "don't pick a real dollar figure silently"
// discipline that task's own report applied.
const DEFAULT_NEW_TENANT_BUDGET_USD = 2.0;

async function main(): Promise<void> {
  const tenantName = process.argv[2];
  const ownerEmail = process.argv[3];
  const ownerName = process.argv[4];

  if (!tenantName || !ownerEmail) {
    throw new Error('usage: invite-tenant.ts "<tenant name>" <ownerEmail> ["<owner name>"]');
  }

  const existing = await findUserByEmail(ownerEmail);
  if (existing) {
    throw new Error(`a User with email ${ownerEmail} already exists (tenant ${existing.tenantId}) — not creating a duplicate`);
  }

  const { tenant, user, quota } = await prisma.$transaction(async (tx) => {
    const tenant = await insertTenant(tenantName, tx);
    const user = await insertUser({ tenantId: tenant.id, email: ownerEmail, name: ownerName, role: 'owner' }, tx);
    const quota = await insertAgentQuota(tenant.id, 'youtube', DEFAULT_NEW_TENANT_BUDGET_USD, tx);
    return { tenant, user, quota };
  });

  console.log(
    `[invite-tenant] created tenant ${tenant.id} (${tenant.name}), owner ${user.id} (${user.email}), AgentQuota $${quota.budgetCeilingUsd}/day (youtube). They can log in via POST /auth/request-link with email "${ownerEmail}".`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
