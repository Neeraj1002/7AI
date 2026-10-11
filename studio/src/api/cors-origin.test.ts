import { describe, it, expect } from 'vitest';
import { isOriginAllowed, parseAllowedOrigins } from './cors-origin';

describe('CORS allow-list', () => {
  const allowed = parseAllowedOrigins('https://admin.example.com/, https://b.example.com', 'https://7aistudio.tech/api');
  it('builds the list from the env var and the public base URL origin', () => {
    expect(allowed).toEqual(['https://admin.example.com', 'https://b.example.com', 'https://7aistudio.tech']);
  });
  it('never blocks the native app (no Origin header)', () => {
    expect(isOriginAllowed(undefined, [], 'production')).toBe(true);
  });
  it('allows listed origins and refuses others in production', () => {
    expect(isOriginAllowed('https://7aistudio.tech', allowed, 'production')).toBe(true);
    expect(isOriginAllowed('https://evil.example', allowed, 'production')).toBe(false);
    expect(isOriginAllowed('http://localhost:8081', allowed, 'production')).toBe(false);
  });
  it('allows localhost outside production', () => {
    expect(isOriginAllowed('http://localhost:8081', [], 'development')).toBe(true);
  });
});
