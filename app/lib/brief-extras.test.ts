// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { validateSources, formatKeyField } from './brief-extras';

test('sources: empty rows ignored, valid links kept, order preserved', () => {
  assert.deepEqual(validateSources(['', ' https://nvidia.com/annual-report-2025 ', 'http://a.org/x']), {
    sources: ['https://nvidia.com/annual-report-2025', 'http://a.org/x'],
    error: null,
  });
  assert.deepEqual(validateSources([]), { sources: [], error: null });
});

test('sources: bad rows are named and nothing is returned', () => {
  assert.match(validateSources(['https://ok.com', 'nvidia.com/report']).error!, /Source 2/);
  assert.match(validateSources(['ftp://x.com/a']).error!, /Source 1/);
  assert.match(validateSources(['https://localhost']).error!, /Source 1/);
  assert.strictEqual(validateSources(['https://x.com/' + 'a'.repeat(500)]).sources.length, 0);
  assert.match(validateSources(Array.from({ length: 21 }, (_, i) => `https://s${i}.com`)).error!, /At most 20/);
});

const formats = [{ key: 'countdown' }, { key: 'origin-story' }];

test('Freeform sends no formatKey; a picked, offered format sends it; an unoffered key is not sent', () => {
  assert.deepEqual(formatKeyField(null, formats), {});
  assert.strictEqual('formatKey' in formatKeyField(null, formats), false);
  assert.deepEqual(formatKeyField('origin-story', formats), { formatKey: 'origin-story' });
  assert.deepEqual(formatKeyField('myth-vs-fact', formats), {});
  assert.deepEqual(formatKeyField('countdown', []), {});
});
