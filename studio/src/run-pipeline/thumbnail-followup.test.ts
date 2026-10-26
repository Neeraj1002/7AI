import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PACKAGING_OUTPUT_VERSION, thumbnailsDir, type PackageRecord, type PackagingOutput } from '../packaging/build';
import { thumbnailFailureMessage } from '../agents/publishing/youtube-client';
import { chosenPackage } from '../packaging/view';
import { makeBrief, makeConcept } from '../packaging/testkit';
import { applyThumbnailFollowup, type FollowupState } from './thumbnail-followup';

const RUN = 'followup-test-run-0001';
const dir = thumbnailsDir(RUN);

function pkg(): PackageRecord {
  const c = makeConcept();
  return {
    id: 'c2', device: 'stake', supportingDevice: null, title: c.title, question: c.question,
    answeredAt: { chapter: null, chapterTitle: null, startSec: null, label: 'In the script', quote: 'q' },
    recipe: { concept: c.thumbnail, faceMode: 'none', typeface: 'stakes', typefaceFamily: 'Anton', prompt: 'p', imageModel: 'm' },
    lettering: { words: 'W', subline: null, sublineDropped: false, typeface: 'stakes', fontFamily: 'Anton', zone: 'top', requestedZone: 'top', zonesByCalm: ['top', 'bottom', 'left', 'right'], textBox: { x0: 0.05, y0: 0.06, x1: 0.9, y1: 0.35 }, lines: 1, mainPxFull: 150, mainPxFeed: 42, mainPxSidebar: 20, readableAtSidebar: true },
    files: { full: 'c2-full.jpg', feed: 'c2-feed.jpg', sidebar: 'c2-sidebar.jpg' }, coldReader: null, imageCostUsd: 0.0065,
  };
}
function packaging(choice?: PackagingOutput['choice']): PackagingOutput {
  return {
    version: PACKAGING_OUTPUT_VERSION, status: 'ready', reason: null, scriptHash: 'h', brief: makeBrief(), faceMode: 'none', typeface: 'stakes',
    titleLimit: 70, concepts: [], dropped: [], textCostUsd: 0, imageCostUsd: 0, packages: [pkg()], ...(choice && { choice }),
  };
}
const chose = (packageId: string) => ({ packageId, title: 'T', titleEdited: false, chosenAt: '2026-10-26T00:00:00Z', chosenByUserId: 'u1' });

function harness(over: { state?: FollowupState; alreadySet?: boolean; setThumbnail?: (file: string) => Promise<void>; choice?: string | null } = {}) {
  const marks: FollowupState[] = [];
  let current: FollowupState = over.state ?? 'pending';
  const p = packaging(over.choice === null ? undefined : chose(over.choice ?? 'c2'));
  const setThumbnail = vi.fn<(file: string) => Promise<void>>(over.setThumbnail ?? (async () => undefined));
  const run = () =>
    applyThumbnailFollowup({
      runId: RUN, packaging: p, chosen: chosenPackage(p), alreadySet: over.alreadySet ?? false, state: current,
      setThumbnail: (file) => setThumbnail(file),
      mark: async (s) => { marks.push(s); current = s; },
      readState: async () => current,
      failureMessage: thumbnailFailureMessage,
    });
  return { run, marks, setThumbnail };
}

beforeEach(() => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'c2-full.jpg'), Buffer.alloc(200_000, 1));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('thumbnail follow-up after publishing (R6)', () => {
  it('uploads the chosen file, not a frame grab, and reports coverFrameSet true', async () => {
    const h = harness();
    const out = await h.run();
    expect(h.setThumbnail).toHaveBeenCalledWith(path.join(dir, 'c2-full.jpg'));
    expect(out).toMatchObject({ coverFrameSet: true, thumbnail: { source: 'package', packageId: 'c2', file: 'c2-full.jpg' } });
    expect(h.marks).toEqual(['started', 'succeeded']);
  });

  it('a refusal (403) leaves coverFrameSet false, keeps the file, gives the real reason and marks the outcome uncertain', async () => {
    const h = harness({ setThumbnail: async () => { throw Object.assign(new Error('forbidden'), { response: { status: 403 } }); } });
    const out = await h.run();
    expect(out.coverFrameSet).toBe(false);
    expect(out.coverFrameMessage).toMatch(/phone verification/);
    expect(out.thumbnail).toMatchObject({ source: 'package', file: 'c2-full.jpg' });
    expect(h.marks).toEqual(['started', 'uncertain']);
    expect(fs.existsSync(path.join(dir, 'c2-full.jpg'))).toBe(true);
  });

  it("keeping YouTube's suggested thumbnail uploads nothing and says so", async () => {
    const h = harness({ choice: 'youtube-suggested' });
    const out = await h.run();
    expect(h.setThumbnail).not.toHaveBeenCalled();
    expect(out).toMatchObject({ coverFrameSet: false, thumbnail: { source: 'youtube-suggested' }, coverFrameMessage: "You kept YouTube's suggested thumbnail." });
  });

  it('approving without choosing uploads nothing and does not claim a custom thumbnail', async () => {
    const h = harness({ choice: null });
    const out = await h.run();
    expect(h.setThumbnail).not.toHaveBeenCalled();
    expect(out.coverFrameSet).toBe(false);
    expect(out.coverFrameMessage).toMatch(/No custom thumbnail was chosen/);
  });

  it('refuses a file over 2 MB before any provider call', async () => {
    fs.writeFileSync(path.join(dir, 'c2-full.jpg'), Buffer.alloc(2 * 1024 * 1024 + 1, 1));
    const h = harness();
    const out = await h.run();
    expect(h.setThumbnail).not.toHaveBeenCalled();
    expect(out.coverFrameSet).toBe(false);
    expect(h.marks).toEqual(['failed']);
  });

  it('does not upload twice after success, and does not retry an outcome that is unknown', async () => {
    const done = harness({ alreadySet: true, state: 'succeeded' });
    expect((await done.run()).coverFrameSet).toBe(true);
    expect(done.setThumbnail).not.toHaveBeenCalled();
    const unknown = harness({ state: 'uncertain' });
    expect((await unknown.run()).coverFrameSet).toBe(false);
    expect(unknown.setThumbnail).not.toHaveBeenCalled();
  });
});
