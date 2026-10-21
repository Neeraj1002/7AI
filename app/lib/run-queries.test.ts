import { describe, it, expect } from 'vitest';
import { someRunLeft } from './run-queries';

describe('someRunLeft', () => {
  it('is false on the first load and when nothing left', () => {
    expect(someRunLeft(null, ['a'])).toBe(false);
    expect(someRunLeft(['a', 'b'], ['b', 'a', 'c'])).toBe(false);
  });
  it('is true when a run finished and left the active list', () => {
    expect(someRunLeft(['a', 'b'], ['b'])).toBe(true);
    expect(someRunLeft(['a'], [])).toBe(true);
  });
});
