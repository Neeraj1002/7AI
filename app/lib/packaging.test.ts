// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { dashIfNull, downloadLink, pictureLink, watchTime } from './packaging';

test('a signed link needs no session header; the plain path does; downloads add a flag', () => {
  assert.deepEqual(pictureLink('/runs/r/thumbnail/c1/feed?t=abc', 'https://api.example.com/'), { url: 'https://api.example.com/runs/r/thumbnail/c1/feed?t=abc', sendAuth: false });
  assert.deepEqual(pictureLink('/runs/r/thumbnail/c1/feed', 'https://api.example.com'), { url: 'https://api.example.com/runs/r/thumbnail/c1/feed', sendAuth: true });
  assert.equal(pictureLink('/runs/r/x', null), null);
  assert.equal(downloadLink('/runs/r/thumbnail/c1/full?t=abc', 'https://api.example.com'), 'https://api.example.com/runs/r/thumbnail/c1/full?t=abc&download=1');
  assert.equal(downloadLink('/runs/r/thumbnail/c1/full', 'https://api.example.com'), 'https://api.example.com/runs/r/thumbnail/c1/full?download=1');
});

test('Compare by device: a missing metric is a dash, never zero or an estimate', () => {
  assert.equal(dashIfNull(null), '\u2014');
  assert.equal(dashIfNull(0), '0');
  assert.equal(dashIfNull(2500, (n) => `${n / 1000}K`), '2.5K');
  assert.equal(watchTime(null), '\u2014');
  assert.equal(watchTime(95), '1:35');
  assert.equal(watchTime(0), '0:00');
});
