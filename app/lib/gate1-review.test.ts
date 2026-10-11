// Run: node --test lib/gate1-review.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error node's type stripping needs the .ts extension; the app tsconfig does not allow it
import { gate1Lists, repeatTopicBanner } from './gate1-review.ts';

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
  assert.equal(b?.runId, 'r1');
  assert.equal(b?.text, 'Similar to a run from 3 days ago: “30 sec shorts”. Approve only if the angle is different.');
});

test('banner: absent, null or malformed returns null', () => {
  assert.equal(repeatTopicBanner(null), null);
  assert.equal(repeatTopicBanner({ repeatTopic: null }), null);
  assert.equal(repeatTopicBanner({ repeatTopic: { runId: 5, topic: 'x' } }), null);
});
