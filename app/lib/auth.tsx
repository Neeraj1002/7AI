import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSecureItem, setSecureItem, deleteSecureItem } from './storage';

const TOKEN_KEY = 'sevenai.apiAuthToken';
const API_URL_KEY = 'sevenai.apiBaseUrl';

type AuthState = {
  isLoading: boolean;
  token: string | null;
  apiUrl: string | null;
  signIn: (token: string, apiUrl: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

// The "lock on the door" MOBILE_APP_DESIGN.md Section 3 describes — a single
// long-lived token plus the API's base URL, entered once and held in
// SecureStore (storage.ts). No real session/login flow: this is a
// single-operator tool per SCHEMA.md, same reasoning the API layer itself
// uses for a plain shared-token check.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [storedToken, storedApiUrl] = await Promise.all([
        getSecureItem(TOKEN_KEY),
        getSecureItem(API_URL_KEY),
      ]);
      setToken(storedToken);
      setApiUrl(storedApiUrl);
      setIsLoading(false);
    })();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      token,
      apiUrl,
      signIn: async (newToken: string, newApiUrl: string) => {
        await Promise.all([setSecureItem(TOKEN_KEY, newToken), setSecureItem(API_URL_KEY, newApiUrl)]);
        setToken(newToken);
        setApiUrl(newApiUrl);
      },
      signOut: async () => {
        await Promise.all([deleteSecureItem(TOKEN_KEY), deleteSecureItem(API_URL_KEY)]);
        setToken(null);
        setApiUrl(null);
      },
    }),
    [isLoading, token, apiUrl],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
