import { describe, it, expect } from 'vitest';
import { sourceIdsFromUsageMetadata } from './usage-event.repository';

describe('sourceIdsFromUsageMetadata', () => {
  it('reads the array Task 8 writes', () => {
    expect(sourceIdsFromUsageMetadata({ stockFootageSourceIds: ['11', '12'], stockFootageSourceId: '11,12' })).toEqual(['11', '12']);
  });
  it('falls back to the comma-joined singular key', () => {
    expect(sourceIdsFromUsageMetadata({ stockFootageSourceId: '11, 12' })).toEqual(['11', '12']);
  });
  it('degrades to no ids for older/odd rows instead of throwing', () => {
    expect(sourceIdsFromUsageMetadata(null)).toEqual([]);
    expect(sourceIdsFromUsageMetadata('x')).toEqual([]);
    expect(sourceIdsFromUsageMetadata({ aiVisualsModel: 'gpt-image-1.5' })).toEqual([]);
    expect(sourceIdsFromUsageMetadata({ stockFootageSourceIds: [1, 2] })).toEqual([]);
  });
});
