// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { validateSources, chipFormatKeys } from './brief-extras';

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

const formats = [{ key: 'countdown' }, { key: 'origin-story' }, { key: 'cost-vs-price' }];

test('chips: most-used first, topped up from the library, selected always visible', () => {
  const ch = { channelId: 'c', byFormat: [{ formatKey: null, videoCount: 9 }, { formatKey: 'cost-vs-price', videoCount: 3 }] };
  assert.deepEqual(chipFormatKeys(formats, ch, null), ['cost-vs-price', 'countdown']);
  assert.deepEqual(chipFormatKeys(formats, undefined, null), ['countdown', 'origin-story']);
  assert.deepEqual(chipFormatKeys(formats, undefined, 'cost-vs-price'), ['countdown', 'cost-vs-price']);
  assert.deepEqual(chipFormatKeys(formats, ch, 'bogus'), ['cost-vs-price', 'countdown']);
});
