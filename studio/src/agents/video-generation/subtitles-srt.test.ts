import { describe, it, expect } from 'vitest';
import { buildSrtFromScript, buildSrtCues, parseSrt, SRT_MAX_LINE_CHARS } from './subtitles-srt';
import { splitIntoChunks } from './long-narration';

const SENTENCES = [
  'Have you ever wondered why the oldest bridge in the city is still standing today?',
  'It was built in 1412, long before anyone had heard of modern engineering.',
  "The builders, however, knew something we have almost forgotten: stone remembers every load it carries.",
  'So what did they do differently, and why does it matter now?',
  'Let us walk through three decisions, starting with the quarry.',
];

function makeScript(n: number): string {
  return Array.from({ length: n }, (_, i) => SENTENCES[i % SENTENCES.length]).join(' ');
}

// Whisper stand-in: every word 400 ms, a 150 ms pause after each sentence.
function fakeWhisper(script: string) {
  const out: { text: string; startMs: number; endMs: number }[] = [];
  let t = 0;
  for (const w of script.split(/\s+/)) {
    out.push({ text: w.replace(/[.,;:!?]/g, '').toLowerCase(), startMs: t, endMs: t + 400 });
    t += 400 + (/[.!?]$/.test(w) ? 150 : 0);
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('buildSrtFromScript', () => {
  const script = makeScript(60);
  const { srt, cues } = buildSrtFromScript(script, fakeWhisper(script));
  const parsed = parseSrt(srt);

  it('parses back with increasing times and the exact script text', () => {
    expect(parsed.cues.length).toBe(cues.length);
    for (let i = 1; i < parsed.cues.length; i += 1) {
      expect(parsed.cues[i].startMs).toBeGreaterThanOrEqual(parsed.cues[i - 1].endMs);
      expect(parsed.cues[i].endMs).toBeGreaterThan(parsed.cues[i].startMs);
    }
    expect(norm(parsed.cues.map((c) => c.text).join(' '))).toBe(norm(script));
  });

  it('keeps lines at most 42 characters, at most 2 lines, and cues 1 to 6 seconds', () => {
    for (const c of parsed.cues) {
      const lines = c.text.split('\n');
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(SRT_MAX_LINE_CHARS);
      const seconds = (c.endMs - c.startMs) / 1000;
      expect(seconds).toBeGreaterThanOrEqual(1);
      expect(seconds).toBeLessThanOrEqual(6.05);
    }
  });

  it('fails loudly when the audio does not match the script', () => {
    const unrelated = fakeWhisper('completely different words that never appear anywhere in that text at all really');
    expect(() => buildSrtFromScript(script, unrelated)).toThrow(/could not be built/);
  });
});

describe('buildSrtCues', () => {
  it('handles a single very short script', () => {
    const cues = buildSrtCues([{ text: 'Hello.', startMs: 0, endMs: 400 }]);
    expect(cues).toHaveLength(1);
    expect(cues[0].endMs - cues[0].startMs).toBeGreaterThanOrEqual(1000);
  });
});

describe('splitIntoChunks', () => {
  it('returns one chunk under the limit and none for empty text', () => {
    expect(splitIntoChunks('Short text.')).toEqual(['Short text.']);
    expect(splitIntoChunks('   ')).toEqual([]);
  });

  it('splits an over-long chapter at sentence boundaries into chunks under 4,000 characters', () => {
    const text = makeScript(150);
    expect(text.length).toBeGreaterThan(8000);
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(4000);
      expect(/[.!?]$/.test(c)).toBe(true);
    }
    expect(norm(chunks.join(' '))).toBe(norm(text));
  });

  it('splits a single sentence longer than the limit at a space', () => {
    const text = Array.from({ length: 1200 }, () => 'word').join(' ');
    const chunks = splitIntoChunks(text, 4000);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4000);
    expect(norm(chunks.join(' '))).toBe(norm(text));
  });
});
