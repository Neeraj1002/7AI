import { describe, it, expect } from 'vitest';
import { CONTENT_FORMATS, FORMAT_KEYS, findFormat } from './manifest';

describe('CONTENT_FORMATS', () => {
  it('has the 9 short seed formats plus the long chaptered-explainer, with unique keys', () => {
    expect(CONTENT_FORMATS).toHaveLength(10);
    expect(new Set(CONTENT_FORMATS.map((f) => f.key)).size).toBe(10);
    expect(CONTENT_FORMATS.filter((f) => f.videoKind === 'short')).toHaveLength(9);
    expect(CONTENT_FORMATS.filter((f) => f.videoKind === 'long').map((f) => f.key)).toEqual(['chaptered-explainer']);
    expect(FORMAT_KEYS).toEqual(CONTENT_FORMATS.map((f) => f.key));
  });

  it('keeps every short format within 15-60 s and every long format on whole minutes from 2 to 15', () => {
    for (const f of CONTENT_FORMATS) {
      if (f.videoKind === 'short') {
        expect(f.targetSeconds).toBeGreaterThanOrEqual(15);
        expect(f.targetSeconds).toBeLessThanOrEqual(60);
      } else {
        expect(f.targetSeconds % 60).toBe(0);
        expect(f.targetSeconds).toBeGreaterThanOrEqual(120);
        expect(f.targetSeconds).toBeLessThanOrEqual(900);
      }
    }
  });

  it('every format has non-empty label, brief template and structure', () => {
    for (const f of CONTENT_FORMATS) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.briefTemplate.length).toBeGreaterThan(0);
      expect(f.scriptStructure.length).toBeGreaterThan(0);
    }
  });

  it('findFormat returns the format, or undefined for unknown/empty', () => {
    expect(findFormat('countdown')?.targetSeconds).toBe(45);
    expect(findFormat('nope')).toBeUndefined();
    expect(findFormat(null)).toBeUndefined();
    expect(findFormat(undefined)).toBeUndefined();
  });
});
