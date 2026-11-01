// Hand-written from the Task 3/4 contract; replace with the router types when the backend merges.
// Sprint 6 Task 4 (NEXT 6, FE): the pure logic of the Creative direction card on the Content profile screen.
// Preset labels, summaries, parts and warnings are the server's and are shown as given; the app keeps no copy of any preset word.
// The types are hand-written from the Task 4 contract (C1, C2, C3) because `channels.directionPresets` and `direction` are not in
// the router types on main yet. Replace them with the inferred types when the Task 4 backend merges.
import { flags } from './feature-flags';

export type DirectionPreset = {
  key: string;
  version: number;
  label: string;
  summary: string;
  parts: { key: string; label: string; text: string }[];
};
export type Direction = { preset: string; note: string };

/** The server applies Neutral when nothing is saved (contract C4). The key is the server's own preset key, not a word. */
export const NEUTRAL_KEY = 'neutral';
/** The note limit and the amber threshold. The server counts characters as a string length (zod max 300). */
export const NOTE_MAX = 300;
export const NOTE_WARN_FROM = 270;

export const CHANGE_LINE = 'A change affects new videos only, not runs already in progress.';
export const SAVE_HINT = 'Saving creates a new version; runs already started keep theirs.';
export const SAVE_ERROR = "Couldn't save. Your choice is still here: try again.";
export const NOTE_HINT = 'One short extra instruction, added after the direction. For example: a word to avoid, or how the ending should feel.';
export const NO_CHANGES = 'No changes to save';

export const directionOn = (flagOn: boolean = flags.creativeDirection): boolean => flagOn;

/** `data.direction` of the active profile, or null when nothing is saved. */
export function savedDirectionOf(profileData: unknown): Direction | null {
  const d = (profileData as { direction?: { preset?: unknown; note?: unknown } } | null | undefined)?.direction;
  if (!d || typeof d.preset !== 'string') return null;
  return { preset: d.preset, note: typeof d.note === 'string' ? d.note : '' };
}

/** What the server applies: the saved choice, else Neutral with no note. */
export const effectiveDirection = (saved: Direction | null): Direction => saved ?? { preset: NEUTRAL_KEY, note: '' };

export type ChoiceTag = 'Default, nothing saved' | 'Current' | 'Not saved yet' | null;

export function choiceTags(presetKey: string, draft: Direction, saved: Direction | null): ChoiceTag[] {
  const current = effectiveDirection(saved).preset;
  const tags: ChoiceTag[] = [];
  if (presetKey === current) tags.push(saved ? 'Current' : 'Default, nothing saved');
  if (presetKey === draft.preset && draft.preset !== current) tags.push('Not saved yet');
  return tags;
}

/** True when the chosen preset or the trimmed note differs from what is saved, including a note on Neutral. */
export function directionDirty(draft: Direction, saved: Direction | null): boolean {
  const cur = effectiveDirection(saved);
  return draft.preset !== cur.preset || draft.note.trim() !== cur.note.trim();
}

export function counterText(n: number): string {
  return n >= NOTE_MAX ? `${n} / ${NOTE_MAX} · limit reached` : `${n} / ${NOTE_MAX}`;
}
export const counterAmber = (n: number): boolean => n >= NOTE_WARN_FROM;
export const clampNote = (text: string): string => (text.length > NOTE_MAX ? text.slice(0, NOTE_MAX) : text);

/** The direction sent on save: the chosen preset and the trimmed note (no note key when it is empty). */
export function directionPayload(draft: Direction): { preset: string; note?: string } {
  const note = draft.note.trim();
  return note ? { preset: draft.preset, note } : { preset: draft.preset };
}

/**
 * The whole profile data back with only the direction changed. The form builds the sections it owns; every other top-level key
 * the server holds (and the app has no field for) is carried over from what was read, so a save never drops it.
 */
export function withDirection(built: Record<string, unknown>, loaded: unknown, draft: Direction | null): Record<string, unknown> {
  const owned = new Set(['offeredFormatKeys', 'script', 'visual', 'audio', 'packaging', 'direction']);
  const out: Record<string, unknown> = {};
  if (loaded && typeof loaded === 'object') {
    for (const [k, v] of Object.entries(loaded as Record<string, unknown>)) if (!owned.has(k)) out[k] = v;
  }
  Object.assign(out, built);
  const loadedDirection = (loaded as { direction?: unknown } | null | undefined)?.direction;
  if (draft) out.direction = directionPayload(draft);
  else if (loadedDirection !== undefined) out.direction = loadedDirection;
  return out;
}

export function saveLabel(args: { dirty: boolean; saving: boolean; failed: boolean; nextVersion: number; flagOn: boolean }): string {
  if (!args.flagOn) return `Save as v${args.nextVersion}`;
  if (args.saving) return 'Saving…';
  if (args.failed) return 'Try again';
  return args.dirty ? `Save as v${args.nextVersion}` : NO_CHANGES;
}

export const savedWithWarning = (version: number): string => `Saved as v${version}, with a warning:`;
