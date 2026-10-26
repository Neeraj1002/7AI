import { buildStyledScenePrompts } from '../agents/video-generation/scene-prompts';
import {
  CONCEPTS_MADE,
  LETTERING_MAX_WORDS,
  NEUTRAL_TITLE_LIMIT,
  PACKAGES_KEPT,
  SUBLINE_MAX_WORDS,
} from './constants';
import type { Concept, SubjectKind, ThumbnailConcept } from './schemas';

// All prompt text for packaging, in one place. No channel name appears here or anywhere in this folder: a channel's
// look only arrives as its own profile text. The wording follows the spike (reports/task1-spike.md section 9).

export type ChannelLook = { stylePrompt?: string | null; titleGuidance?: string | null };
export type ScriptChapterText = { title: string; text: string };

// The approved script as the model reads it. A long script keeps its chapter numbers so "answered in chapter N"
// is something it can say and code can check.
export function renderScript(scriptText: string, chapters?: ScriptChapterText[]): string {
  if (!chapters || chapters.length === 0) return scriptText;
  return chapters.map((c, i) => `[Chapter ${i + 1}: ${c.title}]\n${c.text.trim()}`).join('\n\n');
}

export const BRIEF_SYSTEM = `You prepare the curiosity brief for one YouTube video, from its approved script. A stranger who has never heard of this channel must feel curious enough to click, and the video must honestly pay that curiosity off.

Work in this order.
1. What do people believe or assume about this subject? (whatPeopleBelieve)
2. What does the record in the script say? (whatTheRecordSays)
3. The gap between them is the question a stranger will have (question). A familiar subject plus a contradiction of what people believe is the strongest gap. Never invent a gap the script does not have.
4. What is at stake, and what is the one thing a viewer should look at in the picture (stake, lookAt)?
5. Pick one primary device: stake, scale, mystery, correction, how, person, countdown.
6. Where does the script answer the question? Give the chapter number if the script has chapters, and a quote of the answer copied EXACTLY from the script (answeredIn).
7. What is the picture about (subjectKind)? iconic-thing: a landmark, ship, object or place that is the subject by itself. named-person: a named person is central to the story. anonymous-person: unnamed people (a crew, a worker, a child) are there. no-focal-subject: nothing in the story is a clear thing to look at.
8. typefaceMood for the lettering: stakes (urgent, numbers, risk, business), editorial (people, human stories), historic (ancient or long-ago subjects).
9. promise: one sentence saying what the first 5 to 10 seconds of the video deliver.
10. correction: fill it ONLY when the script itself states the popular version and then the documented record. Quote the sentence that states the record, copied exactly. Otherwise null.

If the script has no honest gap (no belief it contradicts, no open question it answers), set weakGap to one plain sentence saying why, and leave the other text fields as short plain statements. Do not dress up a weak script.

Reply with JSON only.`;

export function briefUser(renderedScript: string, look: ChannelLook): string {
  return `${look.titleGuidance ? `Channel title guidance (the question must suit it):\n${look.titleGuidance}\n\n` : ''}The approved script:\n"""\n${renderedScript}\n"""`;
}

export const CONCEPTS_SYSTEM = `You design YouTube packages: a title and a thumbnail concept that make a stranger who has never heard of this channel curious enough to click, for a video whose approved script you are given together with its curiosity brief.

How curiosity works here. Pick one clear primary device per package and at most one supporting device:
- stake: something is at risk and we can see it (a person and a threat)
- scale: a small human next to something enormous
- mystery: we are shown only part of it (a figure seen from behind, a shadowed face, an unread sign)
- correction: the popular version versus the record (only when the script itself has that contrast)
- how: a process or survival question the viewer wants answered
- person: a named human moment with a face or gesture we feel
- countdown: time pressure that is true of the story

What makes a package work:
- Start from what people believe versus what the record says. A familiar subject plus a contradiction of what people believe wins.
- ONE dominant thing to look at, named in the concept. A tiny subject on a vast empty background, or nothing to look at, fails.
- The picture must connect to the title WITHOUT the script: a stranger looking at the picture and reading the title sees one idea. A good picture that does not match the title is a failed package.
- The title opens a question and WITHHOLDS the answer. Never state in the title what the video reveals.
- The large lettering (at most ${LETTERING_MAX_WORDS} words, plus an optional small subline of at most ${SUBLINE_MAX_WORDS} words) names the world or subject. The title asks the specific question. They must not repeat each other.

Honest curiosity, never bent:
- The question must be answered by the script; give the chapter number if there are chapters, and a quote of the answer copied EXACTLY from the script (answeredIn).
- The thumbnail must not show a scene, person or object the script does not contain or support. Copy the short phrase of the script that supports the scene EXACTLY into supportQuote.
- Words like "untold", "what really happened", "secret", "banned" only if the brief's correction field is set.
- No fake badges or labels ("4K", "Full Movie", "Official"). No logos. No real, identifiable living people: list every real person named in a title, the lettering or the picture in namedPeople and say whether they may be alive.
- Every figure, date and hedge word (about, roughly, almost, by sales) in a title or lettering must be in the script exactly as the script states it, hedges kept.

Make ${CONCEPTS_MADE} concepts. Use different primary devices where the script supports them; where it does not, repeat the strongest honest one and say so in deviceNote. Do not invent a gap the script does not have.

The thumbnail concept is written for an image generator, so be concrete and visual: one dominant subject, what it is doing, where it looks or gestures, how big it is against what, the threat or the thing we cannot see, the light (direction, quality, colour), and the composition (what is foreground, middle and background, and which zone stays calm for lettering). Follow the face rule you are given. Never describe text or letters inside the picture; lettering is added afterwards in code. lettering.zone is where the lettering sits: top, bottom, left or right.

Reply with JSON only.`;

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

export function conceptsUser(renderedScript: string, brief: unknown, look: ChannelLook, titleLimit: number, faceMode: FaceMode): string {
  const title = look.titleGuidance
    ? `Title guidance for this channel (follow it; titles never longer than ${titleLimit} characters):\n${look.titleGuidance}`
    : `Title guidance: none given. Plain, specific, honest; at most about ${NEUTRAL_TITLE_LIMIT} characters.`;
  const visual = look.stylePrompt
    ? `Visual style of this channel's pictures (the concept must be drawable within it):\nStyle: ${look.stylePrompt}`
    : 'Visual style: none given. Any honest, cinematic look is fine.';
  return `${title}\n\n${visual}\n\n${FACE_RULE_TEXT[faceMode]}\n\nThe curiosity brief:\n${JSON.stringify(brief, null, 2)}\n\nThe approved script:\n"""\n${renderedScript}\n"""\n\nReturn ${CONCEPTS_MADE} concepts.`;
}

export const COLD_READER_SYSTEM = `You are an ordinary person scrolling YouTube. You know nothing about this channel or the video. For each candidate you see only its title and the big words on its thumbnail (and a small line under them, if any). For each one say, in a single short sentence, what you think the video is about; how curious it makes you from 1 (not at all) to 5 (I have to know); whether you would click (yes, maybe, no); and whether the title already tells you the answer to the question it raises (answerGivenAway). Then rank all candidates from most to least likely to be clicked by a stranger. Be honest and hard to impress; a title that gives its answer away is not curious. Reply with JSON only.`;

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
