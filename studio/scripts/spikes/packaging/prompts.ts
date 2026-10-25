// All prompt text the spike uses, in one place, so the report can quote it as the "prompt skeleton" Task 1 needs.
// No channel name appears anywhere in here; a channel's look only arrives as its own profile text.
import { buildStyledScenePrompts } from '../../../src/agents/video-generation/scene-prompts';
import { env } from '../../../src/config/env';
import type { Look } from './config';
import { NEUTRAL_TITLE_LIMIT } from './config';

// ---- S2: six candidate packages (one call per script) -------------------------------------------------------

export const PACKAGES_SYSTEM = `You design YouTube packages: a title and a thumbnail concept that make a stranger who has never heard of this channel curious enough to click, for a video whose script you are given.

How curiosity works here. Pick one clear primary device per package and at most one supporting device:
- stake: something is at risk and we can see it (a person and a threat)
- scale: a small human next to something enormous
- mystery: we are shown only part of it (a figure seen from behind, a shadowed face, an unread sign)
- correction: the popular version versus the record (only when the script itself has that contrast)
- how: a process or survival question the viewer wants answered
- person: a named human moment with a face or gesture we feel
- countdown: time pressure that is true of the story
The thumbnail and the title divide the work. The large lettering (at most four words, plus an optional small subline of at most five) names the world or subject; the title opens the specific question. They must not repeat each other. Light, depth and one dominant subject carry the rest.

Honest curiosity, never bent:
- The question must be answered by the script, and you say where (a chapter title, or the part of the script).
- The thumbnail must not show a scene, person or object the script does not contain or support. Quote the short phrase of the script that supports the scene in supportQuote.
- Words like "untold", "what really happened", "secret", "banned" only if the script contains the documented contrast that earns them.
- No fake badges or labels ("4K", "Full Movie", "Official"). No logos. No real, identifiable living people.
- Any figure, date or claim in a title or lettering must be in the script exactly as the script states it.

Make six packages. Use six different primary devices where the script supports them; where it does not, repeat the strongest honest one and say so in deviceNote. Do not invent a gap the script does not have: if a device is weak for this script, say so in deviceNote.

The thumbnail concept is written for an image generator, so be concrete and visual: one dominant subject, what it is doing, where it looks or gestures, how big it is against what, the threat or the thing we cannot see, the light (direction, quality, colour), and the composition (what is foreground, middle and background, and which zone stays calm for lettering). Never describe text or letters inside the picture; the lettering is added afterwards in code. lettering.zone is where the lettering sits: top, bottom, left or right.

Reply with JSON only.`;

export function packagesUser(scriptText: string, look: Look): string {
  const title = look.titleGuidance
    ? `Title guidance for this channel (follow it):\n${look.titleGuidance}`
    : `Title guidance: none given. Plain, specific, honest; at most about ${NEUTRAL_TITLE_LIMIT} characters.`;
  const visual = look.stylePrompt || look.negativePrompt
    ? `Visual rules for this channel's pictures (the concept must be drawable within them):\n${look.stylePrompt ? `Style: ${look.stylePrompt}\n` : ''}${look.negativePrompt ? `Never in the picture: ${look.negativePrompt}\n` : ''}`
    : 'Visual rules: none given. Any honest, cinematic look is fine.';
  return `${title}\n\n${visual}\n\nThe approved script:\n"""\n${scriptText}\n"""\n\nReturn six packages.`;
}

// ---- S3: cold-reader prune ------------------------------------------------------------------------------------

export const COLD_READER_SYSTEM = `You are an ordinary person scrolling YouTube. You know nothing about this channel or the video. For each candidate you see only its title and the big words on its thumbnail (and a small line under them, if any). For each one say, in a single short sentence, what you think the video is about, how curious it makes you from 1 (not at all) to 5 (I have to know), and whether you would click (yes, maybe, no). Then rank all candidates from most to least likely to be clicked by a stranger. Be honest and a little hard to impress. Reply with JSON only.`;

// ---- S5: critic on the real image -----------------------------------------------------------------------------

export const CRITIC_SYSTEM = `You are an ordinary person scrolling YouTube, who knows nothing about this channel or video. You are shown a video's thumbnail and its title. First image: how it looks in your feed. Second image: the same thumbnail tiny, as in a sidebar. Answer honestly, as a stranger, and never assume you know what the video is. Reply with JSON only.`;

export function criticUser(title: string): string {
  return `Title: ${title}\n\nAnswer: what you think this is about; what you expect to see if you click; what you most want to know; whether you would click (yes, maybe, no) and the main reason you might not; what would disappoint you if you clicked. Then, from the SECOND (tiny) image only, copy exactly the words you can read on it (write "none" if you cannot read any) and say whether they are comfortably readable at that size.`;
}

// ---- S3: image prompts ------------------------------------------------------------------------------------------

export type ThumbnailConcept = {
  subject: string;
  gazeOrGesture: string;
  scale: string;
  threatOrMystery: string;
  light: string;
  composition: string;
  lettering: { words: string; subline: string | null; zone: 'top' | 'bottom' | 'left' | 'right' };
};

const ZONE_WORDS = { top: 'top', bottom: 'bottom', left: 'left side', right: 'right side' } as const;

// The scene text built from a concept's fields. This is the prompt skeleton (see the report).
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

// Channel-look render: the pipeline's own assembly (scene + "Style:" + "Avoid:" with the safety and no-marks rules).
export function channelLookPrompt(c: ThumbnailConcept, look: Look): string {
  return buildStyledScenePrompts([conceptScene(c)], {
    stylePrompt: look.stylePrompt,
    negativePrompt: look.negativePrompt,
    safetyNegatives: env.AI_VISUALS_SAFETY_NEGATIVES_ENABLED === '1',
    allowBrandMarks: false,
  })[0];
}

// Ceiling render: same concept, no channel style or negative, richer cinematic craft. Same safety and no-marks rules.
export function ceilingPrompt(c: ThumbnailConcept): string {
  const scene = [
    `A single richly detailed cinematic key-art frame, wide 16:9, for a documentary thumbnail: ${c.subject}`,
    c.gazeOrGesture,
    `Scale: ${c.scale}`,
    c.threatOrMystery,
    `Light: ${c.light}`,
    `Layered depth: a sharp foreground element, a clear mid-ground subject and an atmospheric background; one dominant subject with a strong silhouette; dramatic directional light with volumetric haze; rich but controlled colour; shallow depth of field; fine film grain; a feeling of vast scale and of something looming or unanswered`,
    `Composition: ${c.composition}`,
    `Keep every important element inside the central horizontal band, and keep the ${ZONE_WORDS[c.lettering.zone]} calm and darker so lettering can be added later`,
  ].join('. ');
  return buildStyledScenePrompts([scene], {
    safetyNegatives: env.AI_VISUALS_SAFETY_NEGATIVES_ENABLED === '1',
    allowBrandMarks: false,
  })[0];
}
