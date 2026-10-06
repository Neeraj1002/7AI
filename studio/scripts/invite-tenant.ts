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
//   npx tsx scripts/invite-tenant.ts "<tenant name>" <ownerEmail> "<owner name>" --weekly-budget <usd>
//   (owner name may be ""; --weekly-budget is required — the tenant's weekly budget is a stored number
//   the founder chooses, never derived from a channel count; $20 per active channel is the guide.)

import { prisma } from '../src/models/prisma-client';
import { insertTenant } from '../src/models/repositories/tenant.repository';
import { insertUser, findUserByEmail } from '../src/models/repositories/user.repository';
import { insertAgentQuota } from '../src/models/repositories/agent-quota.repository';

async function main(): Promise<void> {
  // Bugs Closure R1 (D4) — no default budget: the founder states the weekly amount explicitly.
  const args = process.argv.slice(2);
  const flagAt = args.indexOf('--weekly-budget');
  const weeklyBudgetUsd = flagAt >= 0 ? Number(args[flagAt + 1]) : NaN;
  const positional = args.filter((_, i) => i !== flagAt && i !== flagAt + 1);
  const [tenantName, ownerEmail, ownerName] = positional;

  if (!tenantName || !ownerEmail || !Number.isFinite(weeklyBudgetUsd) || weeklyBudgetUsd <= 0) {
    throw new Error(
      'usage: invite-tenant.ts "<tenant name>" <ownerEmail> ["<owner name>"] --weekly-budget <usd>  (weekly budget is required)',
    );
  }

  const existing = await findUserByEmail(ownerEmail);
  if (existing) {
    throw new Error(`a User with email ${ownerEmail} already exists (tenant ${existing.tenantId}) — not creating a duplicate`);
  }

  const { tenant, user, quota } = await prisma.$transaction(async (tx) => {
    const tenant = await insertTenant(tenantName, tx);
    const user = await insertUser({ tenantId: tenant.id, email: ownerEmail, name: ownerName, role: 'owner' }, tx);
    const quota = await insertAgentQuota(tenant.id, 'youtube', weeklyBudgetUsd, tx);
    return { tenant, user, quota };
  });

  console.log(
    `[invite-tenant] created tenant ${tenant.id} (${tenant.name}), owner ${user.id} (${user.email}), AgentQuota $${quota.budgetCeilingUsd}/week (youtube). They can log in via POST /auth/request-link with email "${ownerEmail}".`,
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
