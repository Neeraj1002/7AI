// Sprint 4 FE N2 — helpers for "formats per channel": length labels and who may edit a channel's profile.

import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../studio/src/api/router';

type ProfileFormat = Pick<inferRouterOutputs<AppRouter>['channels']['listFormats'][number], 'key' | 'label' | 'videoKind' | 'targetSeconds'>;

export function isProfileFormatList(value: unknown): value is ProfileFormat[] {
  return Array.isArray(value) && value.every((format) =>
    format &&
    typeof format.key === 'string' &&
    typeof format.label === 'string' &&
    (format.videoKind === 'short' || format.videoKind === 'long') &&
    Number.isFinite(format.targetSeconds),
  );
}

// 45 -> "45 s"; 600 -> "10 min" (a Video format). Under two minutes is always seconds.
export function formatLengthLabel(targetSeconds: number): string {
  if (targetSeconds < 120) return `${targetSeconds} s`;
  const min = targetSeconds / 60;
  return `${Number.isInteger(min) ? min : Number(min.toFixed(1))} min`;
}

// Sentence form used on New brief: "Length: 45 s (from format). Pick Freeform to choose your own."
export function formatLengthNote(targetSeconds: number): string {
  return `Length: ${formatLengthLabel(targetSeconds)} (from format). Pick Freeform to choose your own.`;
}

// Who may edit a channel's content profile. Channel settings has no client-side check (its Save is gated only by
// feature flags and the server decides), so this mirrors the rule the server applies to `channels.createProfileVersion`
// (`canResolveGate`): the tenant's owner role, or the channel's own owner. The server stays the real gate.
export function canEditChannelProfile(
  user: { role: string | null; userId: string | null },
  channel: { ownerUserId: string | null } | undefined,
): boolean {
  if (!channel) return false;
  return user.role === 'owner' || (user.userId !== null && user.userId === channel.ownerUserId);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "6 Oct" — spelled out here because Intl abbreviations differ between engines ("Sept" vs "Sep").
export function shortDate(value: string | Date): string {
  const d = new Date(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
