// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { gate1Lists, repeatTopicBanner } from './gate1-review';

test('lists: empty/missing/malformed become empty arrays', () => {
  assert.deepEqual(gate1Lists(null), { factualConcerns: [], styleGuideViolations: [], sources: [] });
  assert.deepEqual(gate1Lists({ factualConcerns: 'x', styleGuideViolations: [1, ' ', 'a'], sources: ['u'] }), {
    factualConcerns: [],
    styleGuideViolations: ['a'],
    sources: ['u'],
  });
});

test('banner: days ago, topic, runId', () => {
  const now = new Date('2026-10-11T00:00:00Z');
  const b = repeatTopicBanner({ repeatTopic: { runId: 'r1', topic: '30 sec shorts', createdAt: '2026-10-08T00:00:00Z' } }, now);
  assert.strictEqual(b?.runId, 'r1');
  assert.strictEqual(b?.text, 'Similar to a run from 3 days ago: “30 sec shorts”. Approve only if the angle is different.');
});

test('banner: absent, null or malformed returns null', () => {
  assert.strictEqual(repeatTopicBanner(null), null);
  assert.strictEqual(repeatTopicBanner({ repeatTopic: null }), null);
  assert.strictEqual(repeatTopicBanner({ repeatTopic: { runId: 5, topic: 'x' } }), null);
});
