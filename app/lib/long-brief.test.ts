// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import {
  parseMinutes,
  minutesError,
  parseMoney,
  maxSpendError,
  maxSpendText,
  weeklyBudgetBlocked,
  weeklyBudgetText,
  estimateHelper,
  longRunFields,
  placeServerError,
  formatUsd,
} from './long-brief';

const est = { estimateUsd: 2.1, worstCaseUsd: 4.9, suggestedMaxUsd: 3.5, remainingWeeklyUsd: 8.4 };

test('length: whole minutes 2..15 only', () => {
  assert.equal(parseMinutes('10'), 10);
  assert.equal(parseMinutes(' 2 '), 2);
  assert.equal(parseMinutes('15'), 15);
  for (const bad of ['', '1', '16', '20', '10.5', '1e1', '-3', 'abc', '0']) assert.equal(parseMinutes(bad), null, bad);
  assert.equal(minutesError('20'), 'Enter 2 to 15 minutes.');
  assert.equal(minutesError('7'), null);
});

test('money parsing', () => {
  assert.equal(parseMoney('3.50'), 3.5);
  assert.equal(parseMoney('$ 3'), 3);
  assert.equal(parseMoney('0'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('3,5'), null);
  assert.equal(parseMoney('-1'), null);
});

test('max spend must cover one attempt, with the board wording', () => {
  assert.equal(maxSpendError('1.00', est), 'Must be at least $2.10, the estimate for one attempt.');
  assert.equal(maxSpendError('2.10', est), null);
  assert.equal(maxSpendError('', est), 'Enter an amount in dollars.');
  // Before an estimate exists only the shape is checked.
  assert.equal(maxSpendError('1.00', undefined), null);
});

test('max spend follows the suggestion until edited, then stays', () => {
  assert.equal(maxSpendText(null, est), '3.50');
  assert.equal(maxSpendText(null, { ...est, suggestedMaxUsd: 4 }), '4.00');
  assert.equal(maxSpendText('1.00', { ...est, suggestedMaxUsd: 4 }), '1.00');
  assert.equal(maxSpendText(null, undefined), '');
});

test('weekly budget card text and trigger', () => {
  const short = { ...est, remainingWeeklyUsd: 1.2 };
  assert.equal(weeklyBudgetBlocked(short), true);
  assert.equal(weeklyBudgetBlocked(est), false);
  assert.equal(weeklyBudgetBlocked({ ...est, remainingWeeklyUsd: 2.1 }), false);
  assert.equal(
    weeklyBudgetText(short),
    "Estimated $2.10 for this video, $1.20 left this week for this channel. Pick a shorter length or wait for next week's budget.",
  );
  assert.equal(estimateHelper(est), 'Up to $4.90 if the video has to be made again. $8.40 left this week for this channel.');
  assert.equal(formatUsd(2.1), '$2.10');
});

test('a Short adds nothing to the request body', () => {
  assert.deepEqual(longRunFields({ kind: 'short', minutes: 10, formatLocksLength: false, maxSpendUsd: 3.5 }), {});
});

test('a Video sends videoKind, minutes x 60 and maxCostUsd; a format sends no length', () => {
  assert.deepEqual(longRunFields({ kind: 'long', minutes: 2, formatLocksLength: false, maxSpendUsd: 3.5 }), {
    videoKind: 'long',
    targetDurationSec: 120,
    maxCostUsd: 3.5,
  });
  assert.deepEqual(longRunFields({ kind: 'long', minutes: 10, formatLocksLength: true, maxSpendUsd: 3.5 }), {
    videoKind: 'long',
    maxCostUsd: 3.5,
  });
});

test('server errors are placed by field; the words are never rewritten', () => {
  assert.equal(placeServerError('Video length must be a whole number of minutes from 2 to 15'), 'length');
  assert.equal(placeServerError('Spend limit $1.00 is below the estimated $2.10 for this video'), 'maxSpend');
  assert.equal(placeServerError('The spend limit cannot be more than $10.00 per video'), 'maxSpend');
  assert.equal(placeServerError('Estimated $2.10 for this video, $1.20 left this week for this channel'), 'budget');
  assert.equal(placeServerError('That format is not offered by this channel'), 'general');
});
