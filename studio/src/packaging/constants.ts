// Sprint 6 Task 1: curiosity packaging. The limits, the device list and the typefaces live here, once. Every other
// file in this folder (and the app card) reads them; nothing else in studio/ or app/ decides a title or thumbnail
// limit for a curiosity package. No channel name appears anywhere in this folder: a channel's look arrives only
// as its own profile text (visual.stylePrompt, packaging.titleGuidance).

// The starting set from the task's "curiosity grammar". Adding a device needs the architect.
export const CURIOSITY_DEVICES = ['stake', 'scale', 'mystery', 'correction', 'how', 'person', 'countdown'] as const;
export type CuriosityDevice = (typeof CURIOSITY_DEVICES)[number];

export const CONCEPTS_MADE = 6;
export const PACKAGES_KEPT = 3;
// Rendered when the run's spend limit allows three; two otherwise (R3).
export const RENDER_MAX = 3;
export const RENDER_MIN = 2;

// Lettering: at most four words, plus an optional small subline of at most five.
export const LETTERING_MAX_WORDS = 4;
export const SUBLINE_MAX_WORDS = 5;

// YouTube's own title limit, and the neutral limit for a channel whose title guidance gives none.
export const TITLE_MAX_CHARS = 100;
export const NEUTRAL_TITLE_LIMIT = 70;

// The three sizes a thumbnail must stay readable at: the file itself, a feed card (about 360 px wide) and a
// sidebar card (about 170 px wide).
export const THUMB_FULL = { width: 1280, height: 720 } as const;
export const THUMB_FEED_WIDTH = 360;
export const THUMB_SIDEBAR_WIDTH = 170;
export const THUMB_SIZES = ['full', 'feed', 'sidebar'] as const;
export type ThumbSize = (typeof THUMB_SIZES)[number];

// Measured in the spike: main lettering stayed readable down to about 13 px tall at 170 px wide. A subline is
// dropped when it would be shorter than this at the sidebar size.
export const MIN_MAIN_LETTER_PX_SIDEBAR = 12;
export const MIN_SUBLINE_PX_SIDEBAR = 4.5;
export const SUBLINE_MIN_PX_FULL = 36;

// The image is 1536x1024 (3:2) from the model, centre-cropped to 16:9. Quality stays at the stills' setting.
export const THUMBNAIL_IMAGE_COUNT_ESTIMATE = RENDER_MAX;

// Typefaces: three open-licence families (SIL OFL 1.1) shipped under data/fonts/thumbnails/. The engine picks
// one from the mood the brief reports; nothing is configured.
export const TYPEFACE_MOODS = ['stakes', 'editorial', 'historic'] as const;
export type TypefaceMood = (typeof TYPEFACE_MOODS)[number];
export const TYPEFACES: Record<TypefaceMood, { family: string; file: string; color: string; licence: string }> = {
  stakes: { family: 'Anton', file: 'Anton-Regular.woff', color: '#FFFFFF', licence: 'SIL OFL 1.1 (Anton)' },
  editorial: { family: 'PlayfairDisplay', file: 'PlayfairDisplay-Black.woff', color: '#F6EDD9', licence: 'SIL OFL 1.1 (Playfair Display, Black)' },
  historic: { family: 'Cinzel', file: 'Cinzel-Black.woff', color: '#F0D68C', licence: 'SIL OFL 1.1 (Cinzel, Black)' },
};

// How a thumbnail is shown when nothing custom is used.
export const YOUTUBE_SUGGESTED = 'youtube-suggested' as const;
