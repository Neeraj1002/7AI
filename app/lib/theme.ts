// Design tokens for direction C ("Bold red") — UI Enhancement 1, founder-locked
// 2026-09-26 on the "7AI Studio — Visual Directions" canvas. Every color/size
// in the app should come from here; no hex literals in screen files.
export const color = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#F1F1F1',
  border: '#E4E4E4',
  ink: '#0F0F0F',
  muted: '#595959',
  accent: '#C8261F',
  onAccent: '#FFFFFF',
  accentSoft: '#FDEBEA',
  accentText: '#A81E18',
  warnBg: '#FFF2CC',
  warnText: '#784A00',
  okBg: '#E2F5E8',
  okText: '#146C3A',
  failBg: '#0F0F0F',
  failText: '#FFFFFF',
  danger: '#A81E18',
  dangerBorder: '#A81E18',
  inputBorder: '#0F0F0F',
  ring: '#0F0F0F',
  future: '#CFCFCF',
  scrim: 'rgba(10,10,14,0.5)',
  chartLow: '#F6C3C0',
  chartEdit: '#F2A19D',
  video: '#000000',
};

export const card = {
  borderWidth: 1.5,
  borderColor: color.ink,
  borderRadius: 16,
  backgroundColor: color.surface,
};

export const radius = { sm: 10, md: 12, lg: 14, xl: 16, sheet: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

export const font = {
  regular: 'Archivo_400Regular',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  black: 'Archivo_800ExtraBold',
};

export const type = {
  screenTitle: { fontFamily: font.black, fontSize: 30, letterSpacing: -0.6 } as const,
  stackTitle: { fontFamily: font.black, fontSize: 20 } as const,
  sectionTitle: { fontFamily: font.bold, fontSize: 15 } as const,
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 } as const,
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 } as const,
  meta: { fontFamily: font.regular, fontSize: 13, color: '#595959' } as const,
  chip: { fontFamily: font.bold, fontSize: 12 } as const,
  button: { fontFamily: font.black, fontSize: 16 } as const,
  stat: { fontFamily: font.black, fontSize: 30 } as const,
};

// Fixed per-channel identity colors, index = channel's position in
// channels.list (createdAt asc). [background, foreground] of the avatar tile;
// the small dot uses the foreground.
// U11: the dot uses the tile's foreground, which is white on the black tile (channel #2) and so vanished on a
// white card. A white foreground falls back to the tile's own (dark) background.
export function channelDotColor(index: number): string {
  const [bg, fg] = channelColors[((index % channelColors.length) + channelColors.length) % channelColors.length];
  return fg.toUpperCase() === '#FFFFFF' ? bg : fg;
}

export const channelColors = [
  ['#FDEBEA', '#A81E18'],
  ['#0F0F0F', '#FFFFFF'],
  ['#E2F5E8', '#146C3A'],
  ['#FFF2CC', '#784A00'],
  ['#E7EEF9', '#1D4F91'],
  ['#F1F1F1', '#0F0F0F'],
  ['#FCE3EC', '#8E1B4B'],
] as const;
