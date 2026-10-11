// Run: node --test lib/compare.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error node's type stripping needs the .ts extension; the app tsconfig does not allow it
import { formatLabel, compactNumber } from './compare.ts';

test('formatKey null reads Freeform; unknown key falls back to the key', () => {
  assert.equal(formatLabel(null, {}), 'Freeform');
  assert.equal(formatLabel('countdown', { countdown: 'Countdown' }), 'Countdown');
  assert.equal(formatLabel('gone', {}), 'gone');
});

test('compactNumber', () => {
  assert.equal(compactNumber(null), '—');
  assert.equal(compactNumber(0), '0');
  assert.equal(compactNumber(842.4), '842');
  assert.equal(compactNumber(1250), '1.3K');
  assert.equal(compactNumber(48000), '48K');
  assert.equal(compactNumber(2_400_000), '2.4M');
});
