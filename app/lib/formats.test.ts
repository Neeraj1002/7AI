// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { canEditChannelProfile, formatLengthLabel, formatLengthNote, isProfileFormatList } from './formats';
import { CONTENT_FORMATS } from '../../studio/src/formats/manifest';

test('length labels: seconds under two minutes, minutes above', () => {
  assert.equal(formatLengthLabel(45), '45 s');
  assert.equal(formatLengthLabel(600), '10 min');
  assert.equal(formatLengthLabel(150), '2.5 min');
  assert.equal(formatLengthNote(45), 'Length: 45 s (from format). Pick Freeform to choose your own.');
  assert.equal(formatLengthNote(600), 'Length: 10 min (from format). Pick Freeform to choose your own.');
});

test('profile edit: tenant owner role or the channel owner; never when unknown', () => {
  assert.equal(canEditChannelProfile({ role: 'owner', userId: 'u1' }, { ownerUserId: 'u2' }), true);
  assert.equal(canEditChannelProfile({ role: 'approver', userId: 'u1' }, { ownerUserId: 'u1' }), true);
  assert.equal(canEditChannelProfile({ role: 'approver', userId: 'u1' }, { ownerUserId: 'u2' }), false);
  assert.equal(canEditChannelProfile({ role: 'approver', userId: null }, { ownerUserId: null }), false);
  assert.equal(canEditChannelProfile({ role: 'owner', userId: 'u1' }, undefined), false);
});

test('the profile format guard accepts the real catalog and rejects malformed rows', () => {
  const format = CONTENT_FORMATS[0];
  assert.isTrue(isProfileFormatList(CONTENT_FORMATS));
  assert.isTrue(isProfileFormatList([]));
  assert.isFalse(isProfileFormatList(null));
  assert.isFalse(isProfileFormatList([format, null]));
  assert.isFalse(isProfileFormatList([{ ...format, label: { invalid: true } }]));
  assert.isFalse(isProfileFormatList([{ ...format, videoKind: undefined }]));
  assert.isFalse(isProfileFormatList([{ ...format, targetSeconds: null }]));
});
