import { describe, it, expect } from 'vitest';
import { extractJsonObjectText, extractJsonText } from './extract-json';

const parse = (raw: string) => JSON.parse(extractJsonObjectText(raw));

describe('extractJsonObjectText (Bugs Task 11 R5)', () => {
  it('leaves valid JSON unchanged', () => {
    const raw = '{"a":"x \\"q\\" y\\nz","b":[1,2]}';
    expect(extractJsonObjectText(raw)).toBe(raw);
    expect(parse(raw)).toEqual({ a: 'x "q" y\nz', b: [1, 2] });
  });

  it('strips a closed code fence', () => {
    expect(parse('```json\n{"a":"b"}\n```')).toEqual({ a: 'b' });
  });

  it('strips an unclosed code fence (a reply cut off before the closing fence)', () => {
    expect(parse('```json\n{"a":"b"}')).toEqual({ a: 'b' });
  });

  it('drops prose before and after the object', () => {
    expect(parse('Here is the script:\n{"a":"b"}\nHope that helps!')).toEqual({ a: 'b' });
  });

  it('escapes raw newlines and tabs inside a string value', () => {
    const raw = '{"scriptText":"line one\nline two\tindented\r\nline three","captions":"c"}';
    expect(() => JSON.parse(extractJsonText(raw))).toThrow();
    expect(parse(raw)).toEqual({ scriptText: 'line one\nline two\tindented\r\nline three', captions: 'c' });
  });

  it('escapes other control characters inside a string', () => {
    expect(parse('{"a":"x\u0001y"}')).toEqual({ a: 'x\u0001y' });
  });

  it('keeps whitespace between tokens (outside strings) as is', () => {
    expect(parse('{\n  "a": "b",\n  "c": [1,\n 2]\n}')).toEqual({ a: 'b', c: [1, 2] });
  });

  it('does not touch an already escaped sequence or an escaped backslash before a quote', () => {
    expect(parse('{"a":"back\\\\slash","b":"nl\\n"}')).toEqual({ a: 'back\\slash', b: 'nl\n' });
  });

  it('does NOT guess at an unescaped quote inside a string: it stays unparseable', () => {
    const raw = '{"scriptText":"He said "no" to salt.","captions":"c","hashtags":[]}';
    expect(() => parse(raw)).toThrow();
  });

  it('a reply cut off mid-string stays unparseable', () => {
    expect(() => parse('{"scriptText":"cut off mid')).toThrow();
  });
});
