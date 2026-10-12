// Sprint 4 Task 10 (R4.3, R4.4): small publishing constants and helpers for long-form uploads.

// YouTube category 27 = Education; used when the channel profile sets none.
export const LONG_FORM_DEFAULT_CATEGORY_ID = '27';

// The caption track's visible name: the language's own English name ("English", "Hindi"), falling
// back to the code when the runtime does not know it.
export function languageDisplayName(languageCode: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(languageCode) ?? languageCode;
  } catch {
    return languageCode;
  }
}
