import { describe, it, expect } from 'vitest';
import {
  buildMetadataUserMessage,
  unionHashtags,
  formatSources,
  fillCreditPlaceholders,
  FALLBACK_EDITOR,
  scrubDescription,
  publicEditorName,
} from './packaging';

const base = { scriptText: 'S', hashtags: ['history', 'rome'] };

describe('buildMetadataUserMessage', () => {
  it('with no packaging input it is exactly the old message', () => {
    expect(buildMetadataUserMessage(base)).toBe('Script: S\nHashtags: history, rome');
    expect(
      buildMetadataUserMessage({ ...base, titleGuidance: null, descriptionTemplate: null, hashtagsBase: [], sources: [] }),
    ).toBe('Script: S\nHashtags: history, rome');
  });

  it('adds title guidance and unions the base hashtags (deduped, no #)', () => {
    const msg = buildMetadataUserMessage({
      ...base,
      titleGuidance: 'end with a question mark',
      hashtagsBase: ['#historyshorts', '#History'],
    });
    expect(msg).toContain('Title guidance: end with a question mark');
    expect(msg).toContain('Hashtags: history, rome, historyshorts');
  });

  it('fills {editor} and {sources} before the model sees the template, and leaves {summary}/{hashtags}', () => {
    const msg = buildMetadataUserMessage({
      ...base,
      descriptionTemplate: '{summary}\nEdited by {editor}\n{sources}\n{hashtags}',
      editorName: 'Ada Lovelace',
      sources: ['https://a.example', 'B Journal'],
    });
    expect(msg).toContain('Edited by Ada Lovelace');
    expect(msg).toContain('Sources: https://a.example, B Journal');
    expect(msg).toContain('{summary}');
    expect(msg).toContain('{hashtags}');
    expect(msg).not.toContain('{editor}');
    expect(msg).not.toContain('{sources}');
  });

  it('{editor} falls back to "the team" with no approver; empty {sources} disappears cleanly', () => {
    const msg = buildMetadataUserMessage({
      ...base,
      descriptionTemplate: 'A\nEdited by {editor}\n{sources}\nB',
      editorName: null,
    });
    expect(msg).toContain(`Edited by ${FALLBACK_EDITOR}`);
    expect(msg).not.toContain('{sources}');
    expect(msg).not.toContain('Sources:');
  });

  it('editorCredit adds a credit line when the template has no {editor} (or there is no template)', () => {
    expect(buildMetadataUserMessage({ ...base, editorCredit: true, editorName: 'Ada' })).toContain('Edited by Ada.');
    expect(
      buildMetadataUserMessage({ ...base, editorCredit: true, editorName: 'Ada', descriptionTemplate: '{summary}' }),
    ).toContain('Also end the description with this exact credit line: Edited by Ada.');
    expect(
      buildMetadataUserMessage({ ...base, editorCredit: true, editorName: 'Ada', descriptionTemplate: 'by {editor}' }),
    ).not.toContain('Also end');
  });
});

describe('helpers', () => {
  it('formatSources', () => {
    expect(formatSources(undefined)).toBe('');
    expect(formatSources(['a', ' b '])).toBe('Sources: a, b');
  });
  it('unionHashtags', () => {
    expect(unionHashtags(['A', 'b'], ['#a', 'c'])).toEqual(['A', 'b', 'c']);
  });
  it('fillCreditPlaceholders never leaves a literal placeholder', () => {
    expect(fillCreditPlaceholders('x {editor} {sources} y', 'Bob', '')).toBe('x Bob  y');
  });
});

describe('scrubDescription enforces credits after the model replies', () => {
  const template = '{summary}\nEdited by {editor}\n{sources}';
  it('appends the real editor and sources when the model dropped them', () => {
    const out = scrubDescription('Just a summary.', { descriptionTemplate: template, editorName: 'Ada', sources: ['https://a.example'] });
    expect(out).toContain('Edited by Ada.');
    expect(out).toContain('Sources: https://a.example');
  });
  it('leaves a description that already has them alone, and never leaks a placeholder', () => {
    const out = scrubDescription('Summary. Edited by Ada. Sources: https://a.example {editor}', {
      descriptionTemplate: template,
      editorName: 'Ada',
      sources: ['https://a.example'],
    });
    expect(out).not.toContain('{editor}');
    expect(out.match(/Edited by Ada/g)).toHaveLength(1);
  });
  it('uses the fallback editor for the ops path, adds no sources line when there are none, and does nothing without a template or credit', () => {
    expect(scrubDescription('S', { descriptionTemplate: template, editorName: null })).toContain('Edited by the team.');
    expect(scrubDescription('S', { descriptionTemplate: template, editorName: 'Ada' })).not.toContain('Sources');
    expect(scrubDescription('S', {})).toBe('S');
    expect(scrubDescription('S', { editorCredit: true, editorName: 'Ada' })).toBe('S\n\nEdited by Ada.');
  });
});

describe('publicEditorName (Bugs Acceptance run 1, R1: an email never reaches a public field)', () => {
  it('uses a real display name, trimmed', () => {
    expect(publicEditorName('  Ada Lovelace ')).toBe('Ada Lovelace');
  });

  it.each([null, undefined, '', '   ', 'ada@example.com', 'Ada <ada@example.com>'])('falls back for %j', (name) => {
    expect(publicEditorName(name as string | null | undefined)).toBe(FALLBACK_EDITOR);
  });

  it('keeps an email out of the prompt and the scrubbed description, whatever is passed as the name', () => {
    const params = { editorCredit: true, editorName: 'ada@example.com', descriptionTemplate: 'Edited by {editor}. {summary}' };
    const msg = buildMetadataUserMessage({ scriptText: 'S', hashtags: [], ...params });
    expect(msg).not.toContain('@');
    expect(msg).toContain(`Edited by ${FALLBACK_EDITOR}`);
    const out = scrubDescription('A summary.\n\nEdited by {editor}.', params);
    expect(out).not.toContain('@');
    expect(out).toContain(`Edited by ${FALLBACK_EDITOR}.`);
  });
});
