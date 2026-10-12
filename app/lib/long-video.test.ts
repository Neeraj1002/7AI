// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import {
  videoChipLabel,
  mmss,
  imageStageLine,
  imageStageFraction,
  needsHigherLimit,
  newLimitError,
  parseLimit,
  mediaLink,
} from './long-video';

test('chip: long runs only, minutes from targetSeconds', () => {
  assert.equal(videoChipLabel('long', 600), 'Video · 10 min');
  assert.equal(videoChipLabel('long', 120), 'Video · 2 min');
  assert.equal(videoChipLabel('long', 150), 'Video · 2.5 min');
  assert.equal(videoChipLabel('long', undefined), 'Video');
  assert.equal(videoChipLabel('short', 45), null);
  assert.equal(videoChipLabel(undefined, 600), null);
});

test('mm:ss', () => {
  assert.equal(mmss(602), '10:02');
  assert.equal(mmss(0), '0:00');
  assert.equal(mmss(151.4), '2:31');
});

test('image stage line: count only when the server sends one, never a percentage', () => {
  assert.equal(imageStageLine({ done: 34, total: 120 }), 'Generating images 34 of 120');
  assert.equal(imageStageLine({}), 'Generating images…');
  assert.equal(imageStageLine(undefined), 'Generating images…');
  assert.equal(imageStageLine({ done: 0, total: 0 }), 'Generating images…');
  assert.equal(imageStageFraction({ done: 30, total: 120 }), 0.25);
  assert.equal(imageStageFraction({}), null);
});

test('spend-limit sheet shows from the two numbers only', () => {
  assert.equal(needsHigherLimit({ videoKind: 'long', spentUsd: 3.5, maxCostUsd: 3.5 }), true);
  assert.equal(needsHigherLimit({ videoKind: 'long', spentUsd: 4, maxCostUsd: 3.5 }), true);
  assert.equal(needsHigherLimit({ videoKind: 'long', spentUsd: 1, maxCostUsd: 3.5 }), false);
  // 0 spent is "nothing booked", never at the limit.
  assert.equal(needsHigherLimit({ videoKind: 'long', spentUsd: 0, maxCostUsd: 3.5 }), false);
  assert.equal(needsHigherLimit({ videoKind: 'long', spentUsd: 3.5 }), false);
  assert.equal(needsHigherLimit({ videoKind: 'long', maxCostUsd: 3.5 }), false);
  assert.equal(needsHigherLimit({ videoKind: 'short', spentUsd: 5, maxCostUsd: 3.5 }), false);
  assert.equal(needsHigherLimit({ spentUsd: 5, maxCostUsd: 3.5 }), false);
});

test('new limit must be above what was spent', () => {
  assert.equal(newLimitError('', 3.5), 'Enter an amount in dollars.');
  assert.equal(newLimitError('abc', 3.5), 'Enter an amount in dollars.');
  assert.equal(newLimitError('3.50', 3.5), 'Enter more than the $3.50 already spent.');
  assert.equal(newLimitError('3.51', 3.5), null);
  assert.equal(newLimitError('$ 6', 3.5), null);
  assert.equal(parseLimit('6'), 6);
  assert.equal(parseLimit('x'), null);
});

test('media links: signed links stay as they are, API paths get the base and the token', () => {
  assert.deepEqual(mediaLink('https://r2.example/x.mp4?sig=1', 'https://api.example/'), { url: 'https://r2.example/x.mp4?sig=1', sendAuth: false });
  assert.deepEqual(mediaLink('/runs/1/preview', 'https://api.example/'), { url: 'https://api.example/runs/1/preview', sendAuth: true });
  assert.equal(mediaLink('/runs/1/preview', null), null);
  assert.equal(mediaLink(undefined, 'https://api.example'), null);
});
