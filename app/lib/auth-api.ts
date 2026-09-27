import type { UserRole } from './auth-types';

// Sprint 3 backend Task 1 (J2) exposes magic-link auth as two plain Fastify
// REST routes (`POST /auth/request-link`, `GET /auth/verify`), not tRPC
// procedures — confirmed by reading `studio/src/api/server.ts` directly
// rather than assuming the task spec's "exposed as a tRPC procedure" framing
// was accurate (it wasn't: these routes exist specifically because a request
// here can't already carry a session, so they're exempted from the tRPC
// auth-context hook entirely). Same plain-fetch pattern
// `lib/use-video-source.ts` already established for this app's other
// REST-shaped endpoint (`GET /runs/:id/video`).

export type Session = { userId: string; tenantId: string; role: UserRole };

// Bugs Task 3 (R5) — telegramChatId is optional, same no-enumeration
// posture the rest of this flow already has: passing it (or not) never
// changes the response shape.
export async function requestMagicLink(
  apiUrl: string,
  email: string,
  telegramChatId?: string,
): Promise<{ message: string }> {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/auth/request-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, ...(telegramChatId && { telegramChatId }) }),
  });
  const body = (await res.json()) as { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return { message: body.message ?? '' };
}

export type VerifyResult = { sessionToken: string; session: Session };

// Accepts either a bare token or the full link the backend logs
// (`${baseUrl}/auth/verify?token=...`) — the manual-paste fallback (FE6) and
// the deep-link handler (FE7) both funnel through this one function.
export function extractToken(pasted: string): string {
  const trimmed = pasted.trim();
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get('token');
    if (fromQuery) return fromQuery;
  } catch {
    // Not a URL — treat the whole pasted value as the raw token itself.
  }
  return trimmed;
}

export async function verifyMagicLinkToken(apiUrl: string, token: string): Promise<VerifyResult> {
  const url = `${apiUrl.replace(/\/$/, '')}/auth/verify?token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const body = (await res.json()) as { sessionToken?: string; session?: Session; error?: string };
  if (!res.ok || !body.sessionToken || !body.session) {
    throw new Error(body.error ?? `Verification failed (${res.status})`);
  }
  return { sessionToken: body.sessionToken, session: body.session };
}

// Bugs Task 8 (R2) — a server that's down (or a wrong/stale API URL) used to
// leave every screen spinning forever: fetch has no timeout of its own and
// react-query retried each call. One bounded GET /health tells the app which
// case it's in so it can show a real "can't reach the server" screen.
export const SERVER_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = SERVER_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Honour a caller's own abort (react-query cancels queries on unmount).
  init.signal?.addEventListener('abort', () => controller.abort());
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function isServerReachable(apiUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${apiUrl.replace(/\/$/, '')}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
