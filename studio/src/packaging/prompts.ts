import { buildStyledScenePrompts } from '../agents/video-generation/scene-prompts';
import {
  CONCEPTS_MADE,
  NEUTRAL_TITLE_LIMIT,
  PACKAGES_KEPT,
} from './constants';
import type { Concept, SubjectKind, ThumbnailConcept } from './schemas';
export { PACKAGING_BRIEF_SYSTEM_PROMPT as BRIEF_SYSTEM, PACKAGING_CONCEPTS_SYSTEM_PROMPT as CONCEPTS_SYSTEM, PACKAGING_COLD_READER_SYSTEM_PROMPT as COLD_READER_SYSTEM } from '../prompts/system-prompts';

export type ChannelLook = { stylePrompt?: string | null; titleGuidance?: string | null };
export type ScriptChapterText = { title: string; text: string };

// The approved script as the model reads it. A long script keeps its chapter numbers so "answered in chapter N"
// is something it can say and code can check.
export function renderScript(scriptText: string, chapters?: ScriptChapterText[]): string {
  if (!chapters || chapters.length === 0) return scriptText;
  return chapters.map((c, i) => `[Chapter ${i + 1}: ${c.title}]\n${c.text.trim()}`).join('\n\n');
}

export function briefUser(renderedScript: string, look: ChannelLook): string {
  return `${look.titleGuidance ? `Channel title guidance (the question must suit it):\n${look.titleGuidance}\n\n` : ''}The approved script:\n"""\n${renderedScript}\n"""`;
}

export type FaceMode = 'none' | 'face' | 'figure';

// A face is decided from the script, never configured: an iconic subject needs none, a story built around people
// gets an imagined, anonymous face, a script with nothing to look at may get an anonymous figure.
export function faceModeFor(kind: SubjectKind): FaceMode {
  switch (kind) {
    case 'iconic-thing':
      return 'none';
    case 'named-person':
    case 'anonymous-person':
      return 'face';
    case 'no-focal-subject':
      return 'figure';
  }
}

export const FACE_RULE_TEXT: Record<FaceMode, string> = {
  none: 'Face rule: the subject is a thing or a place; show no face and no portrait. A small figure for scale is fine if it is seen from behind.',
  face: 'Face rule: an imagined, anonymous person may be in the frame with a clearly visible face, eyes on the thing under threat, an expression that shows what is at stake. Never a likeness or portrait of any real person, living or dead, and never labelled as one.',
  figure: 'Face rule: if a person is shown, make them one imagined, anonymous figure seen from behind, in profile or in shadow, never a recognisable face.',
};

export function conceptsUser(renderedScript: string, brief: unknown, look: ChannelLook, titleLimit: number, faceMode: FaceMode, feedback?: string[]): string {
  const title = look.titleGuidance
    ? `Title guidance for this channel (follow it; titles never longer than ${titleLimit} characters):\n${look.titleGuidance}`
    : `Title guidance: none given. Plain, specific, honest; at most about ${NEUTRAL_TITLE_LIMIT} characters.`;
  const visual = look.stylePrompt
    ? `Visual style of this channel's pictures (the concept must be drawable within it):\nStyle: ${look.stylePrompt}`
    : 'Visual style: none given. Any honest, cinematic look is fine.';
  // Round two (R10): only rule names and fixed advice, never any dropped text.
  const again = feedback && feedback.length > 0
    ? `This is a second try. Your first ${CONCEPTS_MADE} concepts were ALL dropped by these rules (the number is how many drops broke the rule):\n${feedback.map((f) => `- ${f}`).join('\n')}\nWrite ${CONCEPTS_MADE} new, different concepts, with new angles and new pictures, that keep every rule above.\n\n`
    : '';
  return `${again}${title}\n\n${visual}\n\n${FACE_RULE_TEXT[faceMode]}\n\nThe curiosity brief:\n${JSON.stringify(brief, null, 2)}\n\nThe approved script:\n"""\n${renderedScript}\n"""\n\nReturn ${CONCEPTS_MADE} concepts.`;
}

export function coldReaderUser(items: Array<{ index: number; title: string; lettering: string }>): string {
  return items.map((c) => `Candidate ${c.index}\nTitle: ${c.title}\nThumbnail words: ${c.lettering}`).join('\n\n');
}

export const KEEP_COUNT_NOTE = `Keep the best ${PACKAGES_KEPT}.`;

const ZONE_WORDS = { top: 'top', bottom: 'bottom', left: 'left side', right: 'right side' } as const;

// The scene text built from a concept's fields (the prompt skeleton from the spike).
export function conceptScene(c: ThumbnailConcept): string {
  return [
    `Wide 16:9 thumbnail image of one dominant subject: ${c.subject}`,
    c.gazeOrGesture,
    `Scale: ${c.scale}`,
    c.threatOrMystery,
    `Light: ${c.light}`,
    `Composition: ${c.composition}`,
    `Keep every important element inside the central horizontal band, and keep the ${ZONE_WORDS[c.lettering.zone]} calm, simple and darker so lettering can be added later`,
  ].join('. ');
}

// The image prompt: the concept, the face rule, the profile's own style text, and the platform thumbnail safety
// set (no logos, marks or readable text, no identifiable real person). The stills' negativePrompt is NOT reused:
// it was written for scenes and over-restricts a single-subject thumbnail (spike round 2).
export function thumbnailPrompt(concept: Concept, look: ChannelLook, faceMode: FaceMode): string {
  const scene = `${conceptScene(concept.thumbnail)}. ${FACE_RULE_TEXT[faceMode]}`;
  return buildStyledScenePrompts([scene], {
    stylePrompt: look.stylePrompt,
    safetyNegatives: true,
    allowBrandMarks: false,
  })[0];
}
