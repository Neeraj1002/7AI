import { describe, it, expect } from 'vitest';
import { CONTENT_FORMATS, FORMAT_KEYS, findFormat } from './manifest';

describe('CONTENT_FORMATS', () => {
  it('has the 9 seed formats with unique keys', () => {
    expect(CONTENT_FORMATS).toHaveLength(9);
    expect(new Set(CONTENT_FORMATS.map((f) => f.key)).size).toBe(9);
    expect(FORMAT_KEYS).toEqual(CONTENT_FORMATS.map((f) => f.key));
  });

  it('keeps every targetSeconds within the platform 15-60 s bound', () => {
    for (const f of CONTENT_FORMATS) {
      expect(f.targetSeconds).toBeGreaterThanOrEqual(15);
      expect(f.targetSeconds).toBeLessThanOrEqual(60);
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
