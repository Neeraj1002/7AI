import '../config/env';

// Admin Sprint 1 - database-backed tests only run against a sandbox database
// (name ends in _sandbox or _test), never sevenai_dev or sevenai_preview. With
// any other DATABASE_URL they are skipped, so `npx vitest run` stays safe.
export function databaseName(url: string | undefined = process.env.DATABASE_URL): string {
  if (!url) return '';
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

export function isSandboxDatabase(url?: string): boolean {
  return /_(sandbox|test)$/.test(databaseName(url));
}

export const SANDBOX = isSandboxDatabase();
