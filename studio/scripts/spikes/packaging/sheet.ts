// S6: the blind rating sheet. Twelve YouTube-feed-style cards in shuffled order A to L: thumbnail, title and a
// placeholder channel name only. No concept, device, critic text, duration or badge. The key lives in a separate file.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { OUT, ensureDir, readJson, seededShuffle, writeJson } from './common';
import { SCRIPTS } from './config';
import type { Lettered } from './lettering';
import type { Card, PackagesRecord } from './stages';

export const SHUFFLE_SEED = 20261025;
const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PLACEHOLDER_CHANNEL = 'Channel name';

export type KeyRow = {
  label: string;
  cardId: string;
  script: string;
  channelLabel: string;
  look: string;
  kind: string;
  packageId: string;
  device: string;
  supportingDevice: string;
  font: string;
  zone: string;
  title: string;
  lettering: string;
  seed: number;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

function wrapLines(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

export type SheetRow = { label: string; title: string; file: string };

// HTML plus PNG contact sheet and a blank ratings.csv for the rows given (images already copied into sheetDir).
export async function writeSheet(rows: SheetRow[], sheetDir: string): Promise<void> {
  // HTML sheet (relative image paths; open it next to the A.jpg to L.jpg files).
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thumbnail rating sheet</title>
<style>
:root{--bg:#fff;--fg:#0f0f0f;--muted:#606060;--chip:#f2f2f2}
@media (prefers-color-scheme: dark){:root{--bg:#0f0f0f;--fg:#f1f1f1;--muted:#aaa;--chip:#272727}}
body{margin:0;background:var(--bg);color:var(--fg);font-family:Roboto,Arial,sans-serif}
header{padding:16px}
h1{font-size:18px;margin:0 0 6px}
p{margin:0;color:var(--muted);font-size:14px;line-height:1.4}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px 16px;padding:0 16px 32px}
.label{display:inline-block;background:var(--chip);border-radius:6px;padding:1px 8px;font-weight:700;font-size:13px;margin-bottom:6px}
.card img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;display:block}
.meta{display:flex;gap:12px;margin-top:10px}
.av{flex:none;width:36px;height:36px;border-radius:50%;background:var(--chip)}
.t{font-size:16px;line-height:22px;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.c{font-size:14px;color:var(--muted);margin-top:4px}
</style></head><body>
<header><h1>Thumbnail rating sheet</h1>
<p>Twelve cards, shuffled. For each letter fill the two columns in ratings.csv: would I click (1 to 5) and as rich as my references (1 to 5). Do not open the after-rating folder first.</p></header>
<div class="grid">
${rows.map((r) => `<div class="card"><span class="label">${r.label}</span><img src="${r.file}" alt="Card ${r.label}"><div class="meta"><div class="av"></div><div><div class="t">${esc(r.title)}</div><div class="c">${PLACEHOLDER_CHANNEL}</div></div></div></div>`).join('\n')}
</div></body></html>
`;
  fs.writeFileSync(path.join(sheetDir, 'contact-sheet.html'), html);

  // PNG sheet: the same cards at feed size, three per row, for viewing on a phone.
  const cols = 3;
  const cellW = 380;
  const thumbW = 360;
  const thumbH = Math.round((thumbW * 9) / 16);
  const cellH = thumbH + 112;
  const rowsN = Math.ceil(rows.length / cols);
  const canvas = createCanvas(cols * cellW + 20, rowsN * cellH + 20);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, r] of rows.entries()) {
    const x = 20 + (i % cols) * cellW - 10;
    const y = 20 + Math.floor(i / cols) * cellH;
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(x, y, 30, 22);
    ctx.fillStyle = '#0f0f0f';
    ctx.font = 'bold 14px Arial';
    ctx.textBaseline = 'top';
    ctx.fillText(r.label, x + 9, y + 4);
    const img = await loadImage(path.join(sheetDir, r.file));
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y + 28, thumbW, thumbH, 10);
    ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y + 28, thumbW, thumbH);
    ctx.restore();
    ctx.fillStyle = '#e6e6e6';
    ctx.beginPath();
    ctx.arc(x + 18, y + 28 + thumbH + 28, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f0f0f';
    ctx.font = '500 15px Arial';
    const lines = wrapLines(ctx, r.title, thumbW - 52, 2);
    lines.forEach((ln, k) => ctx.fillText(ln, x + 44, y + 28 + thumbH + 10 + k * 20));
    ctx.fillStyle = '#606060';
    ctx.font = '13px Arial';
    ctx.fillText(PLACEHOLDER_CHANNEL, x + 44, y + 28 + thumbH + 10 + lines.length * 20 + 2);
  }
  fs.writeFileSync(path.join(sheetDir, 'contact-sheet.png'), canvas.toBuffer('image/png'));

  fs.writeFileSync(
    path.join(sheetDir, 'ratings.csv'),
    ['label,would_i_click_1_to_5,as_rich_as_my_references_1_to_5,note', ...rows.map((r) => `${r.label},,,`)].join('\n') + '\n',
  );
}

export async function stageSheet(): Promise<KeyRow[]> {
  const lettered = readJson<Lettered[]>(path.join(OUT, 'lettered.json'));
  const packs = readJson<PackagesRecord[]>(path.join(OUT, 'packages.json'));
  const cards = readJson<Card[]>(path.join(OUT, 'cards.json'));
  const order = seededShuffle(lettered, SHUFFLE_SEED);
  const sheetDir = ensureDir(path.join(OUT, 'sheet'));

  const rows: Array<KeyRow & { file: string }> = order.map((l, i) => {
    const card = cards.find((c) => c.cardId === l.cardId)!;
    const spec = SCRIPTS.find((s) => s.id === card.scriptId)!;
    const pkg = packs.find((p) => p.scriptId === spec.id)!.packages.find((p) => p.id === card.packageId)!;
    const label = LABELS[i];
    fs.copyFileSync(path.join(OUT, l.full), path.join(sheetDir, `${label}.jpg`));
    return {
      label,
      cardId: l.cardId,
      script: spec.id,
      channelLabel: spec.channelLabel,
      look: card.kind === 'ceiling' ? 'ceiling (no channel look, richer prompt)' : spec.look.stylePrompt ? 'channel profile text' : 'neutral (no profile)',
      kind: card.kind,
      packageId: pkg.id,
      device: pkg.device,
      supportingDevice: pkg.supportingDevice ?? '',
      font: l.fontFamily,
      zone: l.zone,
      title: pkg.title,
      lettering: l.subline ? `${l.words} / ${l.subline}` : l.words,
      seed: SHUFFLE_SEED,
      file: `${label}.jpg`,
    };
  });

  await writeSheet(rows.map((r) => ({ label: r.label, title: r.title, file: r.file })), sheetDir);

  const keyRows: KeyRow[] = rows.map(({ file, ...rest }) => {
    void file;
    return rest;
  });
  const header = Object.keys(keyRows[0]);
  fs.writeFileSync(path.join(OUT, 'KEY.csv'), [header.join(','), ...keyRows.map((r) => header.map((h) => csv((r as Record<string, string | number>)[h])).join(','))].join('\n') + '\n');
  writeJson(path.join(OUT, 'key.json'), keyRows);
  return keyRows;
}
