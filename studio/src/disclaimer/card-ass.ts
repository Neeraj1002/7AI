import { DISCLAIMER_SENTENCE } from './sentence';

// The disclaimer card: unbranded, dark and translucent, white text, small and soft, never full-screen. One ASS event with a
// boxed style (BorderStyle 3), so the box follows the text and never covers the frame; it fades in and out with the clip.
// Placed in the upper area, away from the caption zone and the platform's bottom and right-hand safe zones.
export type CardLayout = 'portrait' | 'landscape';

const LAYOUT = {
  // Real pixels on the PlayRes canvas, sized so the white text stays about 15 px tall at a 360 px wide player.
  portrait: { w: 1080, h: 1920, fontSize: 52, marginV: 330, pad: 12 },
  landscape: { w: 1920, h: 1080, fontSize: 80, marginV: 110, pad: 16 },
} as const;
const FONT_FAMILY = 'Montserrat ExtraBold';

const fmt = (s: number) => {
  const cs = Math.round(s * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor((cs % 360000) / 6000)).padStart(2, '0')}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

// Two balanced lines, split at a word boundary near the middle.
export function wrapSentence(sentence: string): string {
  const words = sentence.split(' ');
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return `${words.slice(0, best).join(' ')}\\N${words.slice(best).join(' ')}`;
}

export function buildDisclaimerCardAss(params: { layout: CardLayout; startSec: number; endSec: number; fadeSec?: number }): string {
  const L = LAYOUT[params.layout];
  const fadeMs = Math.round((params.fadeSec ?? 0.25) * 1000);
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${L.w}`,
    `PlayResY: ${L.h}`,
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // White text on a dark box about 35% see-through (ASS alpha 00 = opaque, FF = clear).
    `Style: Card,${FONT_FAMILY},${L.fontSize},&H00FFFFFF,&H00FFFFFF,&H59101010,&H59101010,0,0,0,0,100,100,0,0,3,${L.pad},0,8,60,60,${L.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 5,${fmt(params.startSec)},${fmt(params.endSec)},Card,,0,0,0,,{\\fad(${fadeMs},${fadeMs})}${wrapSentence(DISCLAIMER_SENTENCE)}`,
    '',
  ].join('\n');
}
