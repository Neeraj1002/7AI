// Sprint 4 Task 9 (R5.1): the two still sizes the image model is asked for. Portrait is the
// value Shorts have always used (unchanged). Landscape is the closest fixed size to 16:9 on
// the GPT image models (3:2); the long-form render scales and centre-crops it to 1920x1080,
// leaving room for the zoom. Sprint 4 Task 11 owns the model and may change these values if
// its measurements show another size is better.
export const STILL_SIZE_PORTRAIT = '1024x1536' as const;
export const STILL_SIZE_LANDSCAPE = '1536x1024' as const;

export type StillSize = typeof STILL_SIZE_PORTRAIT | typeof STILL_SIZE_LANDSCAPE;
export const STILL_QUALITY = 'low' as const;
