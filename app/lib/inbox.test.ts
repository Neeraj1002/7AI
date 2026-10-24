// Sprint 4 Frontend Task 2 (R3). Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { buildInboxCards, gateOf, INBOX_PAGE_SIZE, pageEarlier, reviewLabel, type InboxNotification, type InboxRun } from './inbox';

const run = (id: string, status: string, extra: Partial<InboxRun> = {}): InboxRun => ({
  id,
  channelId: 'c1',
  status,
  currentStage: null,
  lastError: null,
  briefText: `Topic of ${id}`,
  completedAt: null,
  ...extra,
});

const note = (id: string, threadKey: string | null, message: string, createdAt: string, resolvedAt: string | null = null): InboxNotification => ({
  id,
  kind: 'approval_request',
  message,
  threadKey,
  createdAt,
  resolvedAt,
});

describe('gateOf', () => {
  it('reads the gate off the message the gate wrote', () => {
    expect(gateOf('Gate 1 — Underdogs')).toBe(1);
    expect(gateOf('Gate 2 — Underdogs')).toBe(2);
    expect(gateOf('Gate 10 — x')).toBeNull();
    expect(gateOf('Something else')).toBeNull();
  });
});

describe('inbox cards', () => {
  it('one card per run: a run with two gate notifications is not shown twice', () => {
    const notifications = [
      note('n1', 'r1', 'Gate 1 — Underdogs', '2026-10-12T10:00:00Z', '2026-10-12T10:05:00Z'),
      note('n2', 'r1', 'Gate 2 — Underdogs', '2026-10-12T10:20:00Z'),
    ];
    const { needsYou, earlier } = buildInboxCards(notifications, [run('r1', 'paused_gate2', { currentStage: 'gate2' })]);
    expect(needsYou).toHaveLength(1);
    expect(earlier).toHaveLength(0);
    const card = needsYou[0];
    expect(card.gate).toBe(2);
    expect(reviewLabel(card.gate)).toBe('Review video');
    expect(card.steps?.map((s) => `${s.name}:${s.word}`)).toEqual(['Script:Approved', 'Video:Waiting for you']);
    expect(card.steps?.[0].when?.toISOString()).toBe('2026-10-12T10:05:00.000Z');
  });

  it('a published run lands in Earlier with Script, Video and Published', () => {
    const { needsYou, earlier } = buildInboxCards(
      [note('n1', 'r1', 'Gate 1 — x', '2026-10-12T10:00:00Z', '2026-10-12T10:01:00Z'), note('n2', 'r1', 'Gate 2 — x', '2026-10-12T10:10:00Z', '2026-10-12T10:11:00Z')],
      [run('r1', 'completed', { completedAt: '2026-10-12T10:15:00Z' })],
    );
    expect(needsYou).toHaveLength(0);
    expect(earlier[0].steps?.map((s) => `${s.name}:${s.word}`)).toEqual(['Script:Approved', 'Video:Approved', 'Run:Published']);
  });

  it('a cancelled run reads "Cancelled by you" and has no Video row', () => {
    const { earlier } = buildInboxCards(
      [note('n1', 'r1', 'Gate 1 — x', '2026-10-12T10:00:00Z', '2026-10-12T10:01:00Z')],
      [run('r1', 'failed', { currentStage: 'video_generation', lastError: 'Cancelled by user' })],
    );
    expect(earlier[0].steps?.map((s) => `${s.name}:${s.word}`)).toEqual(['Script:Approved', 'Run:Cancelled by you']);
  });

  it('a waiting script review says Review script', () => {
    const { needsYou } = buildInboxCards([note('n1', 'r1', 'Gate 1 — x', '2026-10-12T10:00:00Z')], [run('r1', 'paused_gate1', { currentStage: 'gate1' })]);
    expect(reviewLabel(needsYou[0].gate)).toBe('Review script');
    expect(needsYou[0].steps?.map((s) => s.word)).toEqual(['Waiting for you']);
  });

  it('a notification whose run is not loaded keeps its title and button, with no timeline', () => {
    const { needsYou } = buildInboxCards([note('n1', 'gone', 'Gate 2 — Underdogs\nVideo Intelligence verdict: pass', '2026-10-12T10:00:00Z')], []);
    expect(needsYou).toHaveLength(1);
    expect(needsYou[0].title).toBe('Gate 2 — Underdogs');
    expect(needsYou[0].steps).toBeNull();
    expect(reviewLabel(needsYou[0].gate)).toBe('Review video');
  });

  it('sorts newest first within a section', () => {
    const { earlier } = buildInboxCards(
      [note('a', 'r1', 'Gate 1 — x', '2026-10-12T09:00:00Z', '2026-10-12T09:01:00Z'), note('b', 'r2', 'Gate 1 — x', '2026-10-12T11:00:00Z', '2026-10-12T11:01:00Z')],
      [run('r1', 'completed'), run('r2', 'completed')],
    );
    expect(earlier.map((c) => c.runId)).toEqual(['r2', 'r1']);
  });
});

describe('every run gets a card (Sprint 5 Task 7 R1)', () => {
  const many = Array.from({ length: 45 }, (_, i) =>
    run(`r${i}`, 'completed', { completedAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() }),
  );

  it('45 runs and only 3 notifications: all 45 runs get a card', () => {
    const notifications = [0, 1, 2].map((i) => note(`n${i}`, `r${i}`, 'Gate 1 — x', '2026-10-12T10:00:00Z', '2026-10-12T10:01:00Z'));
    const { needsYou, earlier } = buildInboxCards(notifications, many);
    expect(needsYou.length + earlier.length).toBe(45);
    expect(new Set(earlier.map((c) => c.runId)).size).toBe(45);
  });

  it('a run with several notifications is still one card', () => {
    const notifications = [note('a', 'r0', 'Gate 1 — x', '2026-10-12T10:00:00Z'), note('b', 'r0', 'Gate 2 — x', '2026-10-12T11:00:00Z')];
    const { earlier } = buildInboxCards(notifications, [run('r0', 'completed')]);
    expect(earlier).toHaveLength(1);
  });

  it('a run without notifications sorts by its finish time and a waiting one lands in Needs you', () => {
    const { needsYou, earlier } = buildInboxCards([], [...many.slice(0, 3), run('w', 'paused_gate2', { currentStage: 'gate2' })]);
    expect(needsYou.map((c) => c.runId)).toEqual(['w']);
    expect(reviewLabel(needsYou[0].gate)).toBe('Review video');
    expect(earlier.map((c) => c.runId)).toEqual(['r2', 'r1', 'r0']);
  });

  it('a run still being made says so instead of having an empty card', () => {
    const { earlier } = buildInboxCards([], [run('s', 'running', { currentStage: 'script_generation' })]);
    expect(earlier[0].steps?.map((s) => `${s.name}:${s.word}`)).toEqual(['Script:In progress']);
  });

  it('pages the Earlier list and reports how many remain', () => {
    const { earlier } = buildInboxCards([], many);
    const first = pageEarlier(earlier, INBOX_PAGE_SIZE);
    expect(first.shown).toHaveLength(20);
    expect(first.remaining).toBe(25);
    const all = pageEarlier(earlier, 60);
    expect(all.shown).toHaveLength(45);
    expect(all.remaining).toBe(0);
  });
});
