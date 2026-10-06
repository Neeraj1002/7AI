// Admin Sprint 1 - test helpers for the "no secret / no tenant content in an admin
// response" walks. superjson-free: pass the value the router returned directly.

// Every object key found anywhere in `value`, with its dotted path.
export function collectKeys(value: unknown, path = '$'): { key: string; path: string }[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => collectKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
      { key: k, path: `${path}.${k}` },
      ...collectKeys(v, `${path}.${k}`),
    ]);
  }
  return [];
}

export function findForbiddenKeys(value: unknown, forbidden: readonly string[]): string[] {
  const set = new Set(forbidden.map((k) => k.toLowerCase()));
  return collectKeys(value)
    .filter((k) => set.has(k.key.toLowerCase()))
    .map((k) => k.path);
}

// True if any forbidden literal appears anywhere in the serialised response.
export function findForbiddenValues(value: unknown, forbidden: readonly string[]): string[] {
  const text = JSON.stringify(value);
  return forbidden.filter((v) => text.includes(v));
}
