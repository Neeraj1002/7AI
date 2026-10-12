// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { EMPTY_FORM, buildProfileData, profileToForm, parseServerProfileError, profileEntrySummary, formsEqual } from './profile-form';

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
  assert.strictEqual(profileEntrySummary(3, { offeredFormatKeys: ['a', 'b', 'c'] }, '2026-10-06T10:00:00Z'), 'v3 · 3 formats · saved 6 Oct');
  assert.strictEqual(profileEntrySummary(2, { offeredFormatKeys: ['a'] }, '2026-10-06T10:00:00Z'), 'v2 · 1 format · saved 6 Oct');
  assert.strictEqual(profileEntrySummary(1, { script: { guide: 'x' } }, '2026-09-28T10:00:00Z'), 'v1 · 0 formats · saved 28 Sep');
});

import { firstErrorField, formatsNote, sectionOfField, sectionSummary } from './profile-form';

test('offeredFormatKeys round-trips and is written only when something is picked', () => {
  const form = profileToForm({ offeredFormatKeys: ['origin-story', 'myth-vs-fact'], script: { guide: 'x' } });
  assert.deepEqual(form.offeredFormatKeys, ['origin-story', 'myth-vs-fact']);
  assert.deepEqual(buildProfileData(form).data, { offeredFormatKeys: ['origin-story', 'myth-vs-fact'], script: { guide: 'x' } });
  assert.deepEqual(buildProfileData({ ...form, offeredFormatKeys: [] }).data, { script: { guide: 'x' } });
});

test('an older version without the field means none offered, and untouched fields survive a save', () => {
  const old = { script: { guide: 'g', targetSeconds: 40 }, audio: { defaultVoice: 'echo' } };
  const form = profileToForm(old);
  assert.deepEqual(form.offeredFormatKeys, []);
  assert.deepEqual(buildProfileData({ ...form, offeredFormatKeys: ['countdown'] }).data, { ...old, offeredFormatKeys: ['countdown'] });
});

test('formsEqual compares the format list by content and order', () => {
  assert.equal(formsEqual({ ...EMPTY_FORM, offeredFormatKeys: ['a', 'b'] }, { ...EMPTY_FORM, offeredFormatKeys: ['a', 'b'] }), true);
  assert.equal(formsEqual({ ...EMPTY_FORM, offeredFormatKeys: ['a'] }, EMPTY_FORM), false);
});

test('a server error on offeredFormatKeys lands on the formats field', () => {
  const r = parseServerProfileError('Invalid channel profile: offeredFormatKeys.1: unknown format key');
  assert.deepEqual(r, { fields: { offeredFormatKeys: 'unknown format key' }, general: null });
});

test('section summaries: "{set} of {total} set" or "uses defaults"', () => {
  assert.equal(sectionSummary(EMPTY_FORM, 'script'), 'uses defaults');
  assert.equal(sectionSummary({ ...EMPTY_FORM, guide: 'x', targetSeconds: '40', editorCredit: 'no' }, 'script'), '2 of 5 set');
  assert.equal(sectionSummary({ ...EMPTY_FORM, editorCredit: 'no', categoryId: '27' }, 'packaging'), '2 of 7 set');
  assert.equal(sectionSummary({ ...EMPTY_FORM, defaultVoice: 'a', defaultMoodTag: 'b' }, 'audio'), '2 of 2 set');
});

test('error reveal: field -> section, and the first error in screen order', () => {
  assert.equal(sectionOfField('secondsPerStill'), 'visual');
  assert.equal(sectionOfField('offeredFormatKeys'), null);
  assert.equal(firstErrorField({ categoryId: 'bad', stylePrompt: 'bad' }), 'stylePrompt');
  assert.equal(firstErrorField({ categoryId: 'bad', offeredFormatKeys: 'bad' }), 'offeredFormatKeys');
  assert.equal(firstErrorField({}), null);
});

test('formats note: none, 1 to 4, and 5 or more (warn)', () => {
  assert.deepEqual(formatsNote(0), { text: 'None selected: New brief shows only Freeform for this channel.', warn: false });
  assert.equal(formatsNote(2).text, '2 selected. New brief shows these (for the chosen Type) plus Freeform.');
  assert.equal(formatsNote(4).warn, false);
  assert.deepEqual(formatsNote(5), {
    text: '5 selected. More than 4 makes the New brief picker crowded; allowed, but consider fewer.',
    warn: true,
  });
});
