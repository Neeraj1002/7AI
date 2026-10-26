import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, GlobalFonts, loadImage, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import { DATA_DIR } from '../config/paths';
import {
  MIN_MAIN_LETTER_PX_SIDEBAR,
  MIN_SUBLINE_PX_SIDEBAR,
  SUBLINE_MIN_PX_FULL,
  THUMB_FEED_WIDTH,
  THUMB_FULL,
  THUMB_SIDEBAR_WIDTH,
  TYPEFACES,
  type TypefaceMood,
} from './constants';

// R3: the lettering is drawn in code over the generated picture (the image model is never asked for words).
// Adapted from the spike's lettering.ts (reports/task1-spike.md section 6): safe boxes, a dark scrim on the side the
// lettering sits, outline and shadow, a feed preview and a sidebar preview. Never a duration chip or any badge.

export const THUMBNAIL_FONTS_DIR = path.resolve(DATA_DIR, 'fonts', 'thumbnails');

export type Zone = 'top' | 'bottom' | 'left' | 'right';

let fontsRegistered = false;
function registerFonts(): void {
  if (fontsRegistered) return;
  for (const face of Object.values(TYPEFACES)) {
    const file = path.join(THUMBNAIL_FONTS_DIR, face.file);
    if (!GlobalFonts.registerFromPath(file, face.family)) {
      throw new Error(`Thumbnail font did not load: ${file} (studio/data/fonts/thumbnails/ must ship with the app)`);
    }
  }
  fontsRegistered = true;
}

// Safe boxes as fractions of the frame. The bottom-right corner stays free because YouTube lays its duration chip
// there (the chip itself is never drawn into the image).
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

export type Layout = { lines: string[]; size: number; subSize: number };

// The largest lettering that fits the box, over every way of breaking the words into at most three lines.
export function bestLayout(ctx: SKRSContext2D, family: string, words: string, subline: string | null, boxW: number, boxH: number): Layout | null {
  const ws = words.toUpperCase().split(/\s+/).filter(Boolean);
  let best: Layout | null = null;
  for (let parts = 1; parts <= Math.min(3, ws.length); parts += 1) {
    for (const lines of partitions(ws, parts)) {
      for (let size = Math.floor(THUMB_FULL.height * 0.34); size >= 28; size -= 2) {
        ctx.font = `${size}px ${family}`;
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const subSize = subline ? Math.max(SUBLINE_MIN_PX_FULL, Math.round(size * 0.34)) : 0;
        const height = lines.length * size * 1.04 + (subline ? subSize * 1.5 : 0);
        if (widest <= boxW && height <= boxH) {
          if (!best || size > best.size) best = { lines, size, subSize };
          break;
        }
      }
    }
  }
  return best;
}

const sidebarPx = (px: number): number => (px * THUMB_SIDEBAR_WIDTH) / THUMB_FULL.width;

export type LetteredThumbnail = {
  words: string;
  subline: string | null;
  sublineDropped: boolean;
  typeface: TypefaceMood;
  fontFamily: string;
  zone: Zone;
  lines: number;
  mainPxFull: number;
  mainPxFeed: number;
  mainPxSidebar: number;
  readableAtSidebar: boolean;
  files: { full: string; feed: string; sidebar: string };
};

function scaled(src: Canvas, width: number): Canvas {
  const h = Math.round((width * THUMB_FULL.height) / THUMB_FULL.width);
  const c = createCanvas(width, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, h);
  return c;
}

// Draws the lettering over a raw 3:2 picture and writes the full file plus the feed and sidebar previews.
// A subline that would be unreadable at the sidebar size is dropped, and the result says so.
export async function composeThumbnail(params: {
  rawImagePath: string;
  outDir: string;
  baseName: string;
  words: string;
  subline: string | null;
  zone: Zone;
  typeface: TypefaceMood;
}): Promise<LetteredThumbnail> {
  registerFonts();
  const face = TYPEFACES[params.typeface];
  const img = await loadImage(params.rawImagePath);
  // Centre-crop the 3:2 render to 16:9.
  const srcH = Math.round((img.width * 9) / 16);
  const sy = Math.round((img.height - srcH) / 2);
  const canvas = createCanvas(THUMB_FULL.width, THUMB_FULL.height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, sy, img.width, srcH, 0, 0, THUMB_FULL.width, THUMB_FULL.height);

  const box = BOX[params.zone];
  const bx = box.x0 * THUMB_FULL.width;
  const by = box.y0 * THUMB_FULL.height;
  const bw = (box.x1 - box.x0) * THUMB_FULL.width;
  const bh = (box.y1 - box.y0) * THUMB_FULL.height;

  let subline = params.subline?.trim() || null;
  let layout = bestLayout(ctx, face.family, params.words, subline, bw, bh);
  let sublineDropped = false;
  if (subline && (!layout || sidebarPx(layout.subSize) < MIN_SUBLINE_PX_SIDEBAR || sidebarPx(layout.size) < MIN_MAIN_LETTER_PX_SIDEBAR)) {
    subline = null;
    sublineDropped = true;
    layout = bestLayout(ctx, face.family, params.words, null, bw, bh);
  }
  if (!layout) throw new Error(`Thumbnail lettering does not fit: ${params.words}`);

  // Scrim: a soft dark gradient on the side the lettering sits, so it reads on any picture.
  const pad = 0.12;
  const g =
    params.zone === 'top' ? ctx.createLinearGradient(0, 0, 0, by + bh + THUMB_FULL.height * pad)
    : params.zone === 'bottom' ? ctx.createLinearGradient(0, THUMB_FULL.height, 0, by - THUMB_FULL.height * pad)
    : params.zone === 'left' ? ctx.createLinearGradient(0, 0, bx + bw + THUMB_FULL.width * pad, 0)
    : ctx.createLinearGradient(THUMB_FULL.width, 0, bx - THUMB_FULL.width * pad, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.72)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, THUMB_FULL.width, THUMB_FULL.height);

  const textH = layout.lines.length * layout.size * 1.04 + (subline ? layout.subSize * 1.5 : 0);
  const align = params.zone === 'right' ? 'right' : 'left';
  const x = align === 'right' ? bx + bw : bx;
  const yStart = params.zone === 'top' ? by : params.zone === 'bottom' ? by + bh - textH : by + (bh - textH) / 2;

  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  let y = yStart;
  for (const line of layout.lines) {
    ctx.font = `${layout.size}px ${face.family}`;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = layout.size * 0.14;
    ctx.shadowOffsetY = layout.size * 0.04;
    ctx.lineWidth = layout.size * 0.09;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(line, x, y);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = face.color;
    ctx.fillText(line, x, y);
    y += layout.size * 1.04;
  }
  if (subline) {
    ctx.font = `${layout.subSize}px ${face.family}`;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = layout.subSize * 0.3;
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillText(subline.toUpperCase(), x, y + layout.subSize * 0.2);
    ctx.shadowColor = 'transparent';
  }

  await fs.mkdir(params.outDir, { recursive: true });
  const base = path.join(params.outDir, params.baseName);
  const files = { full: `${base}-full.jpg`, feed: `${base}-feed.jpg`, sidebar: `${base}-sidebar.jpg` };
  await fs.writeFile(files.full, canvas.toBuffer('image/jpeg', 90));
  await fs.writeFile(files.feed, scaled(canvas, THUMB_FEED_WIDTH).toBuffer('image/jpeg', 90));
  await fs.writeFile(files.sidebar, scaled(canvas, THUMB_SIDEBAR_WIDTH).toBuffer('image/jpeg', 90));
  const mainPxSidebar = Math.round(sidebarPx(layout.size) * 10) / 10;
  return {
    words: params.words,
    subline,
    sublineDropped,
    typeface: params.typeface,
    fontFamily: face.family,
    zone: params.zone,
    lines: layout.lines.length,
    mainPxFull: layout.size,
    mainPxFeed: Math.round(((layout.size * THUMB_FEED_WIDTH) / THUMB_FULL.width) * 10) / 10,
    mainPxSidebar,
    readableAtSidebar: mainPxSidebar >= MIN_MAIN_LETTER_PX_SIDEBAR,
    files,
  };
}

export async function readFileBytes(file: string): Promise<number> {
  return (await fs.stat(file)).size;
}
