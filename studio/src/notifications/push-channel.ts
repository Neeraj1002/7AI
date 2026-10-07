import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import type { NotificationChannel } from './channel';
import {
  getOrCreatePendingApproval,
  resolvePendingApproval as resolvePendingApprovalShared,
  type ApprovalReply,
} from './pending-approvals';
import { env } from '../config/env';

// Sprint 3 Task 7 (O1) — the only file allowed to touch expo-server-sdk
// directly, same provider-boundary pattern every external-integration
// client.ts in this codebase already holds (jwt.ts for jsonwebtoken,
// credential-crypto.ts's callers for crypto, etc).
//
// EXPO_ACCESS_TOKEN is optional — Expo's push API works without one; an
// access token only adds enhanced push-security (per-app request signing),
// which this project doesn't have configured yet. Real per-recipient
// delivery still works either way.
const expo = new Expo(env.EXPO_ACCESS_TOKEN ? { accessToken: env.EXPO_ACCESS_TOKEN } : undefined);

// Sprint 3 Task 7 (O1) — "the channel that actually reaches someone away
// from the app," constructed per-recipient the same way InAppChannel
// already is. Title + the same message text the in-app Notification row
// gets — no separate copy to maintain.
export class ExpoPushChannel implements NotificationChannel {
  constructor(
    private readonly params: { tenantId: string; channelId: string | null; userId: string; expoPushToken: string },
  ) {}

  private async sendPush(title: string, body: string, data: Record<string, unknown>): Promise<void> {
    if (!Expo.isExpoPushToken(this.params.expoPushToken)) {
      // A stale/malformed token (the device reinstalled the app, revoked
      // permission, etc.) must not throw and take the in-app channel down
      // with it — MultiNotificationChannel already isolates channel
      // failures via Promise.allSettled, but failing fast and loud here
      // (rather than letting Expo's SDK throw deeper in) makes the real
      // cause obvious in logs.
      console.error(
        `[push-channel] user ${this.params.userId}'s stored token is not a valid Expo push token — skipping send`,
      );
      return;
    }
    const message: ExpoPushMessage = {
      to: this.params.expoPushToken,
      title,
      body,
      data,
      sound: 'default',
    };
    // Push payload data carries the run/notification identity (O1's own
    // spec) so a tap can deep-link straight to the right screen — reuses
    // Sprint 3 frontend Task 1's existing Expo deep-link mechanism (the
    // app's own `sevenai://` scheme), not a second deep-link scheme.
    const [ticket] = await expo.sendPushNotificationsAsync([message]);
    if (ticket.status === 'error') {
      console.error(
        `[push-channel] Expo push send failed for user ${this.params.userId}: ${ticket.message}`,
        ticket.details,
      );
    }
  }

  async notify(message: string, meta?: { threadKey?: string }): Promise<void> {
    await this.sendPush('7AI', message, {
      kind: 'notify',
      ...(meta?.threadKey && { runId: meta.threadKey }),
    });
  }

  async requestApproval(params: { threadKey: string; message: string }): Promise<ApprovalReply> {
    await this.sendPush('7AI — action needed', params.message, {
      kind: 'approval_request',
      runId: params.threadKey,
    });
    return getOrCreatePendingApproval(params.threadKey);
  }

  resolvePendingApproval(threadKey: string, value: ApprovalReply): { resolved: boolean } {
    return resolvePendingApprovalShared(threadKey, value);
  }
}
