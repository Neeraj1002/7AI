// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { EMPTY_FORM, buildProfileData, profileToForm, parseServerProfileError, profileSummary, formsEqual } from './profile-form';

test('blank form builds an empty profile (everything falls back to defaults)', () => {
  assert.deepEqual(buildProfileData(EMPTY_FORM), { data: {}, localErrors: {} });
});

test('fields map into the four sections; blanks are omitted', () => {
  const { data } = buildProfileData({
    ...EMPTY_FORM,
    guide: ' Dry, fast ',
    targetSeconds: '45',
    bannedOpeners: 'In 1993\n\n Did you know ',
    factPolicy: 'brief-only',
    defaultSource: 'ai-stills',
    secondsPerStill: '2.5',
    defaultVoice: 'alloy',
    hashtagsBase: '#a, #b  #c',
    editorCredit: 'no',
    selfDeclaredMadeForKids: 'no',
    categoryId: '27',
  });
  assert.deepEqual(data, {
    script: { guide: 'Dry, fast', targetSeconds: 45, bannedOpeners: ['In 1993', 'Did you know'], factPolicy: 'brief-only' },
    visual: { defaultSource: 'ai-stills', secondsPerStill: 2.5 },
    audio: { defaultVoice: 'alloy' },
    packaging: { hashtagsBase: ['#a', '#b', '#c'], editorCredit: false, selfDeclaredMadeForKids: false, categoryId: '27' },
  });
});

test('a non-number in a numeric field is a local error', () => {
  assert.strictEqual(buildProfileData({ ...EMPTY_FORM, targetSeconds: 'abc' }).localErrors.targetSeconds, 'Enter a number.');
});

test('stored data round-trips through the form', () => {
  const stored = { script: { targetSeconds: 40, bannedEndings: ['Follow for more'] }, packaging: { editorCredit: true } };
  const form = profileToForm(stored);
  assert.strictEqual(form.targetSeconds, '40');
  assert.strictEqual(form.bannedEndings, 'Follow for more');
  assert.strictEqual(form.editorCredit, 'yes');
  assert.deepEqual(buildProfileData(form).data, stored);
  assert.ok(formsEqual(form, profileToForm(stored)));
  assert.deepEqual(profileToForm(null), EMPTY_FORM);
});

test('server Zod errors land under their field; unknown paths go to general', () => {
  const r = parseServerProfileError(
    'Invalid channel profile: script.targetSeconds: Number must be less than or equal to 60; script.bannedOpeners.0: Expected string; (root): weird',
  );
  assert.strictEqual(r.fields.targetSeconds, 'Number must be less than or equal to 60');
  assert.strictEqual(r.fields.bannedOpeners, 'Expected string');
  assert.strictEqual(r.general, '(root): weird');
  assert.deepEqual(parseServerProfileError('Network request failed'), { fields: {}, general: 'Network request failed' });
});

test('summary lists only sections that hold something', () => {
  assert.strictEqual(profileSummary(2, { script: { guide: 'x' }, visual: {}, packaging: { categoryId: '1' } }), 'v2 · script, packaging');
  assert.strictEqual(profileSummary(1, {}), 'v1');
});
