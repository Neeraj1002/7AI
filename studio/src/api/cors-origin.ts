// Bugs Task 12 (R10.12) - CORS allow-list. The native app sends no Origin header, so it is never
// affected; browsers are allowed only from CORS_ALLOWED_ORIGINS (comma-separated) plus the origin of
// PUBLIC_API_BASE_URL. Outside production, localhost origins are also allowed (`expo start --web`).
export function parseAllowedOrigins(corsAllowedOrigins: string | undefined, publicApiBaseUrl: string | undefined): string[] {
  const list = (corsAllowedOrigins ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  if (publicApiBaseUrl) {
    try {
      list.push(new URL(publicApiBaseUrl).origin);
    } catch {
      /* an unparsable base URL is reported elsewhere; it just adds no origin */
    }
  }
  return [...new Set(list)];
}

export function isOriginAllowed(origin: string | undefined, allowed: string[], nodeEnv: string): boolean {
  if (!origin) return true; // native app, curl, server-to-server
  if (allowed.includes(origin)) return true;
  if (nodeEnv !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}
