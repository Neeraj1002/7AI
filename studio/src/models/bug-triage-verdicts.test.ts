import { describe, it, expect } from 'vitest';
import { classifyReport, VERDICTS } from './bug-triage-verdicts';
import { BUG_REPORT_STATUSES } from './repositories/bug-report.repository';

const r = (description: string, reportType: 'bug' | 'feedback' = 'bug', id = 'aaaa1111') => ({
  id,
  description,
  reportType,
  screenContext: null,
});

describe('verdict statuses and notes', () => {
  it('only use statuses that already exist', () => {
    for (const v of Object.values(VERDICTS)) if (v.status) expect(BUG_REPORT_STATUSES).toContain(v.status);
  });
  it("keep the founder's notes verbatim", () => {
    expect(VERDICTS.budget.note).toBe('No longer reproduces on the real build (2026-10-11)');
    expect(VERDICTS['wrong-status-after-approval'].note).toBe(
      'Reproduced, fixed by PR #63, verified on the phone 2026-10-11 (stepper, Publishing chip, no Cancel)',
    );
    expect(VERDICTS['quality-line'].status).toBe('open');
    expect(VERDICTS['area-only'].status).toBeUndefined();
  });
});

describe('classifyReport', () => {
  it('matches a group by description', () => {
    expect(classifyReport(r('The video stutters when I watch the draft'))).toMatchObject({ group: 'stutter' });
    expect(classifyReport(r('Dashboard shows 17 failed runs'))).toMatchObject({ group: 'dashboard' });
    expect(classifyReport(r('AI images do not work, same footage every time'))).toMatchObject({ group: 'identical-clips' });
  });
  it('leaves an unmatched report for a decision', () => {
    expect(classifyReport(r('something odd happened'))).toMatchObject({ kind: 'needs-decision', reason: 'matches no group' });
  });
  it('leaves an ambiguous report for a decision', () => {
    expect(classifyReport(r('the dashboard budget number looks wrong'))).toMatchObject({
      kind: 'needs-decision',
      candidates: ['budget', 'dashboard'],
    });
  });
  it('with restFixed, a report matching no group is closed with the earlier-fixes note; an ambiguous one still waits', () => {
    expect(classifyReport(r('something odd happened'), {}, true)).toMatchObject({ group: 'earlier-fixes', via: 'rest' });
    expect(classifyReport(r('the dashboard budget number looks wrong'), {}, true)).toMatchObject({ kind: 'needs-decision' });
  });
  it('treats every feedback report as area-only, even one that mentions the inbox', () => {
    expect(classifyReport(r('UI bug in inbox: two entries', 'feedback'))).toMatchObject({ group: 'area-only', via: 'feedback' });
  });
  it('treats unmatched feedback as area-only, and an override wins', () => {
    expect(classifyReport(r('would be nice to have dark mode', 'feedback'))).toMatchObject({ group: 'area-only', via: 'feedback' });
    expect(classifyReport(r('something odd happened', 'bug', 'beef0001'), { beef: 'area-only' })).toMatchObject({
      group: 'area-only',
      via: 'override',
    });
  });
});
