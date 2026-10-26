import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { TYPEFACE_MOODS, THUMB_FEED_WIDTH, THUMB_FULL, THUMB_SIDEBAR_WIDTH } from './constants';
import { BUSY_FACTOR, chooseZone, composeThumbnail, zoneBusyness } from './lettering';

let dir: string;
let raw: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lettering-'));
  // A 3:2 picture like the image model returns, light in the middle so the scrim has work to do.
  const canvas = createCanvas(1536, 1024);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, '#d9c9a0');
  g.addColorStop(1, '#40506a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1536, 1024);
  raw = path.join(dir, 'raw.png');
  fs.writeFileSync(raw, canvas.toBuffer('image/png'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('composeThumbnail (R3)', () => {
  it.each(TYPEFACE_MOODS)('draws %s lettering and writes the full file and both previews at the right sizes', async (typeface) => {
    const out = await composeThumbnail({ rawImagePath: raw, outDir: dir, baseName: `t-${typeface}`, words: 'Sold for scrap?', subline: 'Twenty years after it opened', zone: 'top', typeface });
    const sizes = await Promise.all([out.files.full, out.files.feed, out.files.sidebar].map(async (f) => {
      const img = await loadImage(f);
      return [img.width, img.height];
    }));
    expect(sizes).toEqual([
      [THUMB_FULL.width, THUMB_FULL.height],
      [THUMB_FEED_WIDTH, Math.round((THUMB_FEED_WIDTH * 9) / 16)],
      [THUMB_SIDEBAR_WIDTH, Math.round((THUMB_SIDEBAR_WIDTH * 9) / 16)],
    ]);
    expect(fs.statSync(out.files.full).size).toBeLessThan(2 * 1024 * 1024);
    expect(out.readableAtSidebar).toBe(true);
    expect(out.mainPxSidebar).toBeGreaterThanOrEqual(12);
    expect(out.words).toBe('Sold for scrap?');
  });

  it('keeps the subline when it stays readable and says so', async () => {
    const out = await composeThumbnail({ rawImagePath: raw, outDir: dir, baseName: 'sub', words: 'Iron tower', subline: 'Almost scrap', zone: 'bottom', typeface: 'stakes' });
    expect(out.subline).toBe('Almost scrap');
    expect(out.sublineDropped).toBe(false);
  });

  it('drops a subline that cannot be made readable at the sidebar size instead of shrinking the main words', async () => {
    // Four long words and a subline in the narrow side box: the main words would shrink below readable with the subline.
    const out = await composeThumbnail({
      rawImagePath: raw, outDir: dir, baseName: 'drop', words: 'Extraordinarily improbable engineering marvel', subline: 'Including a very long explanatory line', zone: 'left', typeface: 'historic',
    });
    expect(out.sublineDropped || out.subline !== null).toBe(true);
    if (out.sublineDropped) expect(out.subline).toBeNull();
  });

  it('writes a plain file with no duration chip or badge: the picture is only the crop plus lettering', async () => {
    const out = await composeThumbnail({ rawImagePath: raw, outDir: dir, baseName: 'chip', words: 'Iron tower', subline: null, zone: 'top', typeface: 'editorial' });
    // The bottom-right corner (where YouTube draws its duration chip) is left as the picture was.
    const img = await loadImage(out.files.full);
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const corner = ctx.getImageData(THUMB_FULL.width - 150, THUMB_FULL.height - 70, 120, 40).data;
    const bright = Array.from({ length: corner.length / 4 }, (_, i) => corner[i * 4]).filter((v) => v > 250).length;
    expect(bright).toBe(0);
  });
});

describe('where the lettering goes (live check: a top line sat across a woman face)', () => {
  it('keeps the zone the concept asked for on a calm picture, and moves to the calmest zone when that zone is busy', () => {
    const calm = { top: 3, bottom: 4, left: 5, right: 4 };
    expect(chooseZone('top', calm)).toBe('top');
    const busyTop = { top: 30, bottom: 4, left: 12, right: 14 };
    expect(chooseZone('top', busyTop)).toBe('bottom');
    // A small difference is not worth moving the lettering.
    expect(chooseZone('top', { top: 5, bottom: 4, left: 5, right: 5 })).toBe('top');
    expect(BUSY_FACTOR).toBeGreaterThan(1);
  });

  it('reads detail from the picture: noise at the top makes the top busy, a flat bottom stays calm', () => {
    const c = createCanvas(1280, 720);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#334';
    ctx.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 4000; i += 1) {
      ctx.fillStyle = i % 2 ? '#fff' : '#000';
      ctx.fillRect(Math.random() * 1280, Math.random() * 300, 6, 6);
    }
    const busy = zoneBusyness(c);
    expect(busy.top).toBeGreaterThan(busy.bottom * 3);
    expect(chooseZone('top', busy)).not.toBe('top');
  });

  it('draws the lettering where the picture is calm and reports both zones', async () => {
    const c = createCanvas(1536, 1024);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#556';
    ctx.fillRect(0, 0, 1536, 1024);
    for (let i = 0; i < 6000; i += 1) {
      ctx.fillStyle = i % 2 ? '#eee' : '#111';
      ctx.fillRect(Math.random() * 1536, Math.random() * 420, 8, 8);
    }
    const file = path.join(dir, 'busytop.png');
    fs.writeFileSync(file, c.toBuffer('image/png'));
    const out = await composeThumbnail({ rawImagePath: file, outDir: dir, baseName: 'busytop', words: 'Iron tower', subline: null, zone: 'top', typeface: 'stakes' });
    expect(out.requestedZone).toBe('top');
    expect(out.zone).not.toBe('top');
  });
});
