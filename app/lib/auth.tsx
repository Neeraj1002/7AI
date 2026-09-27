import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSecureItem, setSecureItem, deleteSecureItem } from './storage';
import { isServerReachable, type Session } from './auth-api';
import type { UserRole } from './auth-types';
import { registerForPushNotificationsAsync } from './push';

const SESSION_TOKEN_KEY = 'sevenai.sessionToken';
const API_URL_KEY = 'sevenai.apiBaseUrl';
const USER_ID_KEY = 'sevenai.userId';
const TENANT_ID_KEY = 'sevenai.tenantId';
const ROLE_KEY = 'sevenai.role';

type AuthState = {
  isLoading: boolean;
  token: string | null; // the session JWT, post Sprint 3 Task 1 — a drop-in replacement for the old shared token on the wire (lib/trpc.ts is unchanged)
  apiUrl: string | null;
  userId: string | null;
  tenantId: string | null;
  role: UserRole | null;
  // Persists just the API URL, independent of having a session yet — needed
  // so a magic-link deep link opened on a fresh install still knows which
  // API to call /auth/verify against (FE7).
  setApiUrl: (apiUrl: string) => Promise<void>;
  // Sprint 3 Task 1 (FE7): replaces the old `signIn(token, apiUrl)` — the
  // real `GET /auth/verify` call itself happens in auth-api.ts, called from
  // either the deep-link handler (app/verify.tsx) or the manual-paste
  // fallback (login.tsx); both converge here with the same real result.
  // `apiUrl` is taken as an explicit argument (not read from this
  // provider's own state) deliberately — the caller always just resolved it
  // locally (it's what it used for the verify call itself), and reading it
  // from context here instead would risk a stale closure if `setApiUrl`
  // hasn't finished re-rendering yet (Sprint 3 Task 3/FE11' needs the
  // *current* apiUrl for push-token registration, not a lagging one).
  completeSignIn: (result: { sessionToken: string; session: Session }, apiUrl: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Bugs Task 8 (R2) — 'unknown' until the first /health ping (only made once
  // there's a stored session + API URL; the login screen has its own errors).
  // 'down' routes the signed-in app to /server-down instead of spinning.
  serverStatus: 'unknown' | 'up' | 'down';
  // Re-pings /health; resolves true when the server answered.
  checkServer: () => Promise<boolean>;
  // Called by the shared QueryClient when a request fails at the network level.
  reportServerUnreachable: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

// Sprint 3 Task 1 (FE6/FE7): real magic-link session auth replaces the old
// "paste the shared API_AUTH_TOKEN" flow. `token` now holds a real session
// JWT (Sprint 3 backend Task 1/J2's `SessionTokenPayload`, `purpose:
// 'session'`), obtained by verifying a real magic link — never entered
// directly by the user.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [apiUrl, setApiUrlState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [serverStatus, setServerStatus] = useState<AuthState['serverStatus']>('unknown');

  const checkServer = useCallback(async () => {
    if (!apiUrl) return false;
    const reachable = await isServerReachable(apiUrl);
    setServerStatus(reachable ? 'up' : 'down');
    return reachable;
  }, [apiUrl]);

  const reportServerUnreachable = useCallback(() => setServerStatus('down'), []);

  // Ping once the stored session/URL are loaded (and again if the URL changes
  // after sign-in), so a dead server is caught before any screen starts
  // spinning on it.
  useEffect(() => {
    if (isLoading || !token || !apiUrl) return;
    let cancelled = false;
    void isServerReachable(apiUrl).then((reachable) => {
      if (!cancelled) setServerStatus(reachable ? 'up' : 'down');
    });
    return () => {
      cancelled = true;
    };
  }, [isLoading, token, apiUrl]);

  useEffect(() => {
    void (async () => {
      const [storedToken, storedApiUrl, storedUserId, storedTenantId, storedRole] = await Promise.all([
        getSecureItem(SESSION_TOKEN_KEY),
        getSecureItem(API_URL_KEY),
        getSecureItem(USER_ID_KEY),
        getSecureItem(TENANT_ID_KEY),
        getSecureItem(ROLE_KEY),
      ]);
      setToken(storedToken);
      setApiUrlState(storedApiUrl);
      setUserId(storedUserId);
      setTenantId(storedTenantId);
      setRole((storedRole as UserRole | null) ?? null);
      setIsLoading(false);
    })();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      token,
      apiUrl,
      userId,
      tenantId,
      role,
      setApiUrl: async (newApiUrl: string) => {
        await setSecureItem(API_URL_KEY, newApiUrl);
        setApiUrlState(newApiUrl);
      },
      completeSignIn: async ({ sessionToken, session }, signInApiUrl) => {
        await Promise.all([
          setSecureItem(SESSION_TOKEN_KEY, sessionToken),
          setSecureItem(USER_ID_KEY, session.userId),
          setSecureItem(TENANT_ID_KEY, session.tenantId),
          setSecureItem(ROLE_KEY, session.role),
        ]);
        setToken(sessionToken);
        setUserId(session.userId);
        setTenantId(session.tenantId);
        setRole(session.role);
        // Sprint 3 Task 3 (FE11') — fire-and-forget: a push-registration
        // failure (denied permission, no EAS project configured, web
        // platform, ...) must never block sign-in itself.
        void registerForPushNotificationsAsync(signInApiUrl, sessionToken);
      },
      signOut: async () => {
        await Promise.all([
          deleteSecureItem(SESSION_TOKEN_KEY),
          deleteSecureItem(USER_ID_KEY),
          deleteSecureItem(TENANT_ID_KEY),
          deleteSecureItem(ROLE_KEY),
        ]);
        setToken(null);
        setUserId(null);
        setTenantId(null);
        setRole(null);
      },
      serverStatus,
      checkServer,
      reportServerUnreachable,
    }),
    [isLoading, token, apiUrl, userId, tenantId, role, serverStatus, checkServer, reportServerUnreachable],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
