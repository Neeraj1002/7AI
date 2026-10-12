// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { chipFromRun } from './run-video';
import { videoChipLabel } from './long-video';

test('chip props from a runs.list row', () => {
  const long = chipFromRun({ creationOptions: { videoKind: 'long', targetDurationSec: 600, resolvedOptions: {} } });
  assert.deepEqual(long, { videoKind: 'long', targetSeconds: 600 });
  assert.equal(videoChipLabel(long.videoKind, long.targetSeconds), 'Video · 10 min');
});

test('a Short, or a row without options, has no chip', () => {
  for (const row of [{ creationOptions: { targetDurationSec: 45 } }, { creationOptions: null }, {}, null, undefined]) {
    const c = chipFromRun(row);
    assert.equal(videoChipLabel(c.videoKind, c.targetSeconds), null);
  }
});
