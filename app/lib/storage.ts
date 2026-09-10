import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Task 2 acceptance criterion: API_AUTH_TOKEN stored via Expo SecureStore.
// SecureStore has no web implementation (it throws), and this app is also
// exercised via `expo start --web` during development (no Android/iOS
// simulator available in this environment) — localStorage is the natural
// web equivalent for a dev-only convenience value, never used on a real
// device build.
export async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
