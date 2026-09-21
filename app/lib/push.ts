import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { createTrpcClient } from './trpc';

// Sprint 3 Task 3 (FE11') — real Expo push registration, consuming backend
// Task 7/O1's `notifications.registerPushToken`. Called from
// auth.tsx's completeSignIn with the apiUrl/sessionToken it already has in
// hand — a plain one-off tRPC client, the same pattern auth-api.ts uses for
// the REST auth endpoints, rather than threading this through React context
// from a non-component function.
//
// A denied permission is a real, valid outcome (per the task spec's own
// instruction), not an error — this function returns quietly either way and
// never throws into completeSignIn; a failure here must not block sign-in
// itself.
export async function registerForPushNotificationsAsync(apiUrl: string, sessionToken: string): Promise<void> {
  // expo-notifications has no real push-token support on web (getExpoPushTokenAsync
  // throws there) — this dev environment's only available testing surface
  // (`expo start --web`, no simulator/device here) can exercise everything
  // else in this app, but real push registration is a real-device-only path
  // by definition; skip cleanly on web rather than surfacing a confusing
  // platform error on every sign-in during development.
  if (Platform.OS === 'web') {
    console.log('[push] skipping push registration on web — no native push support on this platform');
    return;
  }

  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('[push] permission not granted — the in-app inbox (FE10) still covers this user');
      return;
    }

    // A real Expo push token requires a real EAS project id
    // (expoConfig.extra.eas.projectId) from SDK 49+ — this app has never
    // been through `eas init`, so this will throw a clear, specific error
    // until that's done. Caught below rather than left to crash sign-in;
    // flagged plainly in this task's own report as a real founder-action
    // prerequisite, not silently swallowed.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    const trpcClient = createTrpcClient(apiUrl, sessionToken);
    await trpcClient.notifications.registerPushToken.mutate({ token: tokenResponse.data });
    console.log('[push] registered a real Expo push token for this session');
  } catch (error) {
    console.error('[push] registration failed (sign-in continues regardless):', error);
  }
}
