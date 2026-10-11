// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { formatLabel, compactNumber } from './compare';

test('formatKey null reads Freeform; unknown key falls back to the key', () => {
  assert.strictEqual(formatLabel(null, {}), 'Freeform');
  assert.strictEqual(formatLabel('countdown', { countdown: 'Countdown' }), 'Countdown');
  assert.strictEqual(formatLabel('gone', {}), 'gone');
});

test('compactNumber', () => {
  assert.strictEqual(compactNumber(null), '—');
  assert.strictEqual(compactNumber(0), '0');
  assert.strictEqual(compactNumber(842.4), '842');
  assert.strictEqual(compactNumber(1250), '1.3k');
  assert.strictEqual(compactNumber(1000), '1.0k');
  assert.strictEqual(compactNumber(18400), '18.4k');
  assert.strictEqual(compactNumber(2_400_000), '2.4m');
});
