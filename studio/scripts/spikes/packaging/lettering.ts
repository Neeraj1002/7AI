// S4: lettering drawn in code over the generated picture (the image model is never asked for words).
// Three open-licence font families ship with the spike under ./fonts (licences next to them).
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { OUT, SPIKE_DIR, ensureDir, readJson, writeJson } from './common';
import { FEED_W, FONTS, FULL, SCRIPTS, SIDE_W, type FontKey } from './config';
import type { Card, PackagesRecord } from './stages';

for (const f of FONTS) {
  if (!GlobalFonts.registerFromPath(path.join(SPIKE_DIR, 'fonts', f.file), f.family)) throw new Error(`font did not load: ${f.file}`);
}

type Zone = 'top' | 'bottom' | 'left' | 'right';

// Safe boxes as fractions of the frame. The bottom-right corner stays free of lettering because YouTube lays its
// duration chip there (the chip itself is never drawn into the image).
const BOX: Record<Zone, { x0: number; y0: number; x1: number; y1: number }> = {
  top: { x0: 0.05, y0: 0.06, x1: 0.95, y1: 0.4 },
  bottom: { x0: 0.05, y0: 0.58, x1: 0.84, y1: 0.93 },
  left: { x0: 0.05, y0: 0.14, x1: 0.56, y1: 0.86 },
  right: { x0: 0.44, y0: 0.14, x1: 0.95, y1: 0.8 },
};

function partitions(words: string[], parts: number): string[][] {
  if (parts === 1) return [[words.join(' ')]];
  const out: string[][] = [];
  for (let i = 1; i <= words.length - parts + 1; i += 1) {
    for (const rest of partitions(words.slice(i), parts - 1)) out.push([words.slice(0, i).join(' '), ...rest]);
  }
  return out;
}

type Layout = { lines: string[]; size: number; subSize: number };

function bestLayout(ctx: SKRSContext2D, family: string, words: string, subline: string | null, boxW: number, boxH: number): Layout {
  const ws = words.toUpperCase().split(/\s+/).filter(Boolean);
  let best: Layout | null = null;
  for (let parts = 1; parts <= Math.min(3, ws.length); parts += 1) {
    for (const lines of partitions(ws, parts)) {
      for (let size = Math.floor(FULL.h * 0.34); size >= 28; size -= 2) {
        ctx.font = `${size}px ${family}`;
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const subSize = subline ? Math.max(36, Math.round(size * 0.34)) : 0;
        const height = lines.length * size * 1.04 + (subline ? subSize * 1.5 : 0);
        if (widest <= boxW && height <= boxH) {
          if (!best || size > best.size) best = { lines, size, subSize };
          break;
        }
      }
    }
  }
  if (!best) throw new Error(`lettering does not fit: ${words}`);
  return best;
}

export type Lettered = {
  cardId: string;
  font: FontKey;
  fontFamily: string;
  words: string;
  subline: string | null;
  zone: Zone;
  mainFontPxFull: number;
  mainFontPxSide: number;
  lines: number;
  full: string;
  feed: string;
  side: string;
  plain: string;
};

function resize(src: ReturnType<typeof createCanvas>, w: number) {
  const h = Math.round((w * FULL.h) / FULL.w);
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

export async function letterCard(card: Card, concept: { lettering: { words: string; subline: string | null; zone: Zone } }, fontKey: FontKey, outDir: string): Promise<Lettered> {
  const font = FONTS.find((f) => f.key === fontKey)!;
  const img = await loadImage(path.join(OUT, card.rawFile!));
  // Centre-crop the 3:2 render to 16:9.
  const srcH = Math.round((img.width * 9) / 16);
  const sy = Math.round((img.height - srcH) / 2);
  const canvas = createCanvas(FULL.w, FULL.h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, sy, img.width, srcH, 0, 0, FULL.w, FULL.h);

  ensureDir(outDir);
  const base = path.join(outDir, card.cardId);
  fs.writeFileSync(`${base}-plain.jpg`, canvas.toBuffer('image/jpeg', 86));

  const { words, subline, zone } = concept.lettering;
  const box = BOX[zone];
  const bx = box.x0 * FULL.w;
  const by = box.y0 * FULL.h;
  const bw = (box.x1 - box.x0) * FULL.w;
  const bh = (box.y1 - box.y0) * FULL.h;

  // Scrim: a soft dark gradient on the side the lettering sits, so it reads on any picture.
  const pad = 0.12;
  const g =
    zone === 'top' ? ctx.createLinearGradient(0, 0, 0, by + bh + FULL.h * pad)
    : zone === 'bottom' ? ctx.createLinearGradient(0, FULL.h, 0, by - FULL.h * pad)
    : zone === 'left' ? ctx.createLinearGradient(0, 0, bx + bw + FULL.w * pad, 0)
    : ctx.createLinearGradient(FULL.w, 0, bx - FULL.w * pad, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.72)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FULL.w, FULL.h);

  const layout = bestLayout(ctx, font.family, words, subline, bw, bh);
  const textH = layout.lines.length * layout.size * 1.04 + (subline ? layout.subSize * 1.5 : 0);
  const align = zone === 'right' ? 'right' : 'left';
  const x = align === 'right' ? bx + bw : bx;
  // Vertical placement: lettering hugs the frame edge for top/bottom, centres for sides.
  const yStart = zone === 'top' ? by : zone === 'bottom' ? by + bh - textH : by + (bh - textH) / 2;

  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  let y = yStart;
  for (const line of layout.lines) {
    ctx.font = `${layout.size}px ${font.family}`;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = layout.size * 0.14;
    ctx.shadowOffsetY = layout.size * 0.04;
    ctx.lineWidth = layout.size * 0.09;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(line, x, y);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = font.color;
    ctx.fillText(line, x, y);
    y += layout.size * 1.04;
  }
  if (subline) {
    ctx.font = `${layout.subSize}px ${font.family}`;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = layout.subSize * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillText(subline.toUpperCase(), x, y + layout.subSize * 0.2);
    ctx.shadowColor = 'transparent';
  }

  const paths = { full: `${base}-full.jpg`, feed: `${base}-feed.jpg`, side: `${base}-side.jpg` };
  fs.writeFileSync(paths.full, canvas.toBuffer('image/jpeg', 90));
  fs.writeFileSync(paths.feed, resize(canvas, FEED_W).toBuffer('image/jpeg', 90));
  fs.writeFileSync(paths.side, resize(canvas, SIDE_W).toBuffer('image/jpeg', 90));
  return {
    cardId: card.cardId,
    font: fontKey,
    fontFamily: font.family,
    words,
    subline,
    zone,
    mainFontPxFull: layout.size,
    mainFontPxSide: Math.round((layout.size * SIDE_W) / FULL.w),
    lines: layout.lines.length,
    full: path.relative(OUT, paths.full),
    feed: path.relative(OUT, paths.feed),
    side: path.relative(OUT, paths.side),
    plain: path.relative(OUT, `${base}-plain.jpg`),
  };
}

export async function stageLetter(): Promise<Lettered[]> {
  const cards = readJson<Card[]>(path.join(OUT, 'cards.json'));
  const packs = readJson<PackagesRecord[]>(path.join(OUT, 'packages.json'));
  const out: Lettered[] = [];
  const fontKeys: FontKey[] = FONTS.map((f) => f.key);
  for (const [si, spec] of SCRIPTS.entries()) {
    const mine = cards.filter((c) => c.scriptId === spec.id);
    for (const [j, card] of mine.entries()) {
      if (!card.rawFile) continue;
      const concept = packs.find((p) => p.scriptId === spec.id)!.packages.find((p) => p.id === card.packageId)!.thumbnail;
      out.push(await letterCard(card, concept, fontKeys[(si + j) % fontKeys.length], path.join(OUT, 'cards')));
    }
  }
  writeJson(path.join(OUT, 'lettered.json'), out);
  return out;
}
