import { describe, it, expect } from 'vitest';
import { isValidDuration, resolveRequestedVideoKind, durationErrorMessage } from './video-kind';

describe('isValidDuration', () => {
  it('short keeps 30/45/60 only', () => {
    for (const s of [30, 45, 60]) expect(isValidDuration('short', s)).toBe(true);
    for (const s of [15, 50, 90, 120]) expect(isValidDuration('short', s)).toBe(false);
  });
  it('long is whole minutes from 120 to 900', () => {
    for (const s of [120, 300, 600, 900]) expect(isValidDuration('long', s)).toBe(true);
    for (const s of [60, 90, 150, 119, 960, 1200, 600.5]) expect(isValidDuration('long', s)).toBe(false);
  });
  it('states the rule in plain words', () => {
    expect(durationErrorMessage('long')).toBe('Video length must be a whole number of minutes from 2 to 15');
  });
});

describe('resolveRequestedVideoKind', () => {
  it('defaults to short', () => {
    expect(resolveRequestedVideoKind({})).toEqual({ videoKind: 'short', conflict: false });
  });
  it('infers from the format when videoKind is not sent', () => {
    expect(resolveRequestedVideoKind({ formatKey: 'chaptered-explainer' }).videoKind).toBe('long');
    expect(resolveRequestedVideoKind({ formatKey: 'countdown' }).videoKind).toBe('short');
  });
  it('flags a format that disagrees with an explicit videoKind', () => {
    expect(resolveRequestedVideoKind({ videoKind: 'short', formatKey: 'chaptered-explainer' }).conflict).toBe(true);
    expect(resolveRequestedVideoKind({ videoKind: 'long', formatKey: 'chaptered-explainer' }).conflict).toBe(false);
  });
});
