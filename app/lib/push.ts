import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { createTrpcClient } from './trpc';
import { getSecureItem, setSecureItem, deleteSecureItem } from './storage';

// Sprint 3 Task 3 (FE11') — real Expo push registration, consuming backend
// Task 7/O1's `notifications.registerPushToken`. A plain one-off tRPC client,
// the same pattern auth-api.ts uses for the REST auth endpoints, rather than
// threading this through React context from a non-component function.
//
// Bugs Task 10 (R4) — what changed: registration now runs on every launch with
// a signed-in user (auth.tsx's effect), not only inside completeSignIn; the
// Android channel is created before the permission request; foreground pushes
// are shown; and the outcome is kept as a small status the Account section
// shows. A denied permission is a valid outcome, not an error. Nothing here
// ever throws: a failure is logged and kept as the status's reason.

const LAST_SENT_KEY = 'sevenai.pushTokenSent';

export type PushStatus =
  | { state: 'checking' }
  | { state: 'on' }
  | { state: 'off' }
  | { state: 'error'; reason: string };

let status: PushStatus = { state: 'checking' };
const listeners = new Set<() => void>();

function setStatus(next: PushStatus): void {
  status = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Status line for the Account section (a read-only indicator, not a control).
export function usePushStatus(): PushStatus {
  return useSyncExternalStore(subscribe, () => status, () => status);
}

// A push that arrives while the app is open is shown as a banner (the tap
// still deep-links through _layout.tsx's response listener). Set once, at
// module load. No native push on web.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function shortReason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine || 'unknown error';
}

let inFlight: Promise<void> | null = null;

// Forget what was last sent (called on sign-out) so the next sign-in registers
// the token against the new session's user again.
export async function clearPushRegistrationMemory(): Promise<void> {
  try {
    await deleteSecureItem(LAST_SENT_KEY);
  } catch {
    // best effort
  }
  setStatus({ state: 'checking' });
}

export function registerForPushNotificationsAsync(apiUrl: string, sessionToken: string, userId: string): Promise<void> {
  if (!inFlight) {
    inFlight = register(apiUrl, sessionToken, userId).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function register(apiUrl: string, sessionToken: string, userId: string): Promise<void> {
  // expo-notifications has no real push-token support on web
  // (getExpoPushTokenAsync throws there) — real push registration is a
  // real-device-only path by definition; skip cleanly on web.
  if (Platform.OS === 'web') {
    console.log('[push] skipping push registration on web — no native push support on this platform');
    return;
  }

  try {
    // Android 13+ needs the notification channel to exist before the
    // permission prompt will appear at all.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: permission } = await Notifications.requestPermissionsAsync();
    if (permission !== 'granted') {
      console.log('[push] permission not granted — the in-app inbox (FE10) still covers this user');
      setStatus({ state: 'off' });
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

    // Only send it when it differs from what this user already registered —
    // keyed by user too, so a second account on the same device still gets
    // its own registration.
    const marker = `${userId}:${tokenResponse.data}`;
    if ((await getSecureItem(LAST_SENT_KEY)) !== marker) {
      const trpcClient = createTrpcClient(apiUrl, sessionToken);
      await trpcClient.notifications.registerPushToken.mutate({ token: tokenResponse.data });
      await setSecureItem(LAST_SENT_KEY, marker);
      console.log('[push] registered a real Expo push token for this session');
    }
    setStatus({ state: 'on' });
  } catch (error) {
    console.error('[push] registration failed (the app continues regardless):', error);
    setStatus({ state: 'error', reason: shortReason(error) });
  }
}
