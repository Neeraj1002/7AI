import { listUsersByTenantAndRole, findUserById } from '../models/repositories/user.repository';
import type { Channel, User } from '../types';

// Sprint 3 Task 3 (K2) — who gets told about a gate on this channel. Mirrors
// Task 2 (K1)'s own fail-closed authorization design, applied to
// notification delivery rather than resolution permission: a channel with a
// real ownerUserId notifies exactly that user; a channel with none (an old,
// unbackfilled, or orphaned row) notifies every owner-role user on the
// tenant, the same set of people canResolveGate already lets resolve it —
// nobody who *can* approve a gate is ever left with no notification telling
// them it's open.
export async function resolveNotificationRecipients(channel: Pick<Channel, 'tenantId' | 'ownerUserId'>): Promise<User[]> {
  if (channel.ownerUserId) {
    const owner = await findUserById(channel.ownerUserId);
    // A real, if unlikely, edge case: ownerUserId points at a since-deleted
    // row. Falls through to the tenant-wide owner-role list below rather
    // than silently notifying nobody.
    if (owner) return [owner];
  }
  return listUsersByTenantAndRole(channel.tenantId, 'owner');
}
