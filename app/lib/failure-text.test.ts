// Sprint 5 Task 7 R5. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { describeFailure, returnDate, shortSentence } from './failure-text';
import { humanizeRunError } from './run-labels';

const VOICE_ERR =
  "OpenAI API call failed: 400 [{'type': 'enum', 'loc': ('body', 'voice'), 'msg': \"Input should be 'nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy', 'ash', 'sage' or 'coral'\", 'input': 'ballad'}]";
const ANTHROPIC_LIMIT =
  'Anthropic API call failed: 400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."}}';

describe('shortSentence', () => {
  it('never cuts inside a bracket', () => {
    const out = shortSentence("OpenAI API call failed: 400 [{'type': 'enum', 'loc': ('body', 'voice')}]", 40);
    expect(out).toBe('OpenAI API call failed: 400');
    expect(out).not.toMatch(/[[{(]/);
  });
  it('cuts long plain text at a word with an ellipsis', () => {
    const out = shortSentence('The render worker stopped because the machine ran out of disk space while writing the file to storage', 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out).not.toMatch(/\s…$/);
  });
  it('drops a leading [tag] and keeps only the first sentence', () => {
    expect(shortSentence('[stage] Something broke. And then more.')).toBe('Something broke.');
  });
});

describe('describeFailure', () => {
  it('maps an unsupported voice to a sentence and the voice setting', () => {
    const f = describeFailure(VOICE_ERR);
    expect(f.kind).toBe('voice');
    expect(f.title).toContain("isn't supported");
    expect(f.fix).toBe('voice');
    expect(f.technical).toBe(VOICE_ERR);
  });
  it('maps a provider usage limit and shows the return date', () => {
    const f = describeFailure(ANTHROPIC_LIMIT);
    expect(f.kind).toBe('provider_limit');
    expect(f.title).toBe('Anthropic usage limit reached');
    expect(f.detail).toContain('1 Nov 2026');
  });
  it('names the spend and the limit, with the control to raise it', () => {
    const f = describeFailure('Video Generation refused: the run reached its max cost', { spentUsd: 0.5123, maxCostUsd: 0.5 });
    expect(f.kind).toBe('spend_limit');
    expect(f.title).toBe('This video used $0.51 of its $0.50 limit');
    expect(f.fix).toBe('limit');
  });
  it('uses 4 decimals only under one cent', () => {
    expect(describeFailure('x', { spentUsd: 0.0053, maxCostUsd: 0.005 }).title).toBe('This video used $0.0053 of its $0.0050 limit');
  });
  it('the retry allowance stop offers the limit control', () => {
    const f = describeFailure('Automatic retry allowance used ($0.48 of $0.48); raise the limit to continue');
    expect(f.kind).toBe('spend_limit');
    expect(f.fix).toBe('limit');
    expect(f.title).toContain('allowance');
  });
  it('video review problem carries the reviewer reason', () => {
    const f = describeFailure('Video Intelligence regen cap reached', { reviewReason: 'Longest shot 8.3 s, limit 7.5 s. Spread the scenes.', tries: 3 });
    expect(f.kind).toBe('video_review');
    expect(f.title).toBe('The video did not pass review after 3 tries');
    expect(f.detail).toBe('Reviewer: Longest shot 8.3 s, limit 7.5 s.');
  });
  it('an unknown error is one short sentence, full text kept for Technical details', () => {
    const raw = 'Disk write failed: ENOSPC [{"path":"/tmp/x","errno":-28}]';
    const f = describeFailure(raw);
    expect(f.kind).toBe('other');
    expect(f.title).toBe('Disk write failed: ENOSPC');
    expect(f.technical).toBe(raw);
  });
});

describe('humanizeRunError (queue rows and attempt reasons)', () => {
  it('no longer shows the voice error cut at 60 characters', () => {
    expect(humanizeRunError(VOICE_ERR)).toBe("This voice isn't supported by the speech model");
  });
  it('keeps the known labels', () => {
    expect(humanizeRunError('Video Intelligence regen cap reached')).toBe('Video retry limit reached');
  });
});

describe('returnDate', () => {
  it('formats an ISO date and returns null without one', () => {
    expect(returnDate('regain access on 2026-11-01 at 00:00 UTC')).toBe('1 Nov 2026');
    expect(returnDate('no date')).toBeNull();
  });
});
