// Sprint 5 Task 7 R11.4 — progress bar colours.
import { describe, it, expect } from 'vitest';
import { barColors } from './stepper-colors';
import { color } from './theme';

describe('stepper colours', () => {
  it('a finished run is all green, never red', () => {
    expect(new Set(barColors(7, 7, 'completed'))).toEqual(new Set([color.okText]));
  });
  it('a running run: done green, current amber, rest grey', () => {
    expect(barColors(4, 7)).toEqual([color.okText, color.okText, color.okText, color.okText, color.amber, color.border, color.border]);
  });
  it('a failed run is red only on the step it failed on', () => {
    const c = barColors(4, 7, 'failed');
    expect(c.filter((x) => x === color.danger)).toHaveLength(1);
    expect(c[4]).toBe(color.danger);
    expect(c[3]).toBe(color.okText);
  });
  it('a cancelled or rejected run is grey-dark, not red', () => {
    expect(barColors(5, 7, 'stopped')[5]).toBe(color.muted);
  });
});
