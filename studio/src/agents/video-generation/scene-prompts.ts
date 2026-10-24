// Sprint 4 Task 3 (R9/R11): builds the final text for each AI-still scene prompt.
// Pure. The channel's style and negative text are appended to every scene, then
// (when the platform flag is on) the fixed safety clause, after the profile's own
// negative rather than replacing it, then the no-marks rule (always, unless the brief asks otherwise).

export const SAFETY_NEGATIVE_CLAUSE =
  'no logos or trademarks, no text or lettering in the image, no photorealistic depiction of an identifiable real person, no gore or graphic content';

// Sprint 5 Task 8 (R6): the rule that goes on EVERY picture prompt, for every style and provider, whether or
// not the platform safety flag is on. The image model draws brand logos and invented lettering on its own
// when a topic is a brand (run 7a90cd6e: about 12 of 24 stills for a brief about Lego), and shows decay for
// a sentence about selling a site. Switched off only when the brief itself asks for logos or text on screen.
export const NO_MARKS_CLAUSE =
  'no text, letters, numbers, signs, logos, brand names, trademarks, watermarks or readable writing anywhere in the image (show signs, screens, documents and labels blank or out of focus); no recognisable branded packaging or products; no ruins, decay, closure or mourning imagery unless the story states it';

// True only when the brief asks for brand marks or on-screen text and does not also forbid them.
export function briefAllowsBrandMarks(brief: string | null | undefined): boolean {
  if (!brief) return false;
  const asks = /\b(show|include|display|feature)\b[^.\n]{0,40}\b(logos?|brand(ing| marks?| names?)|lettering|on-screen text)\b/i.test(brief);
  const forbids = /\b(no|without|avoid|never|don'?t|do not)\b[^.\n]{0,40}\b(logos?|lettering|brand(ing| marks?)|text)\b/i.test(brief);
  return asks && !forbids;
}

export type SceneStyle = {
  stylePrompt?: string | null;
  negativePrompt?: string | null;
  safetyNegatives?: boolean;
  // The brief itself asks for logos or on-screen text; the no-marks rule is then left out.
  allowBrandMarks?: boolean;
};

export function buildStyledScenePrompts(scenes: string[], style: SceneStyle): string[] {
  return scenes.map((scene) => {
    const parts = [scene];
    if (style.stylePrompt) parts.push(`Style: ${style.stylePrompt}`);
    const avoid = [style.negativePrompt, style.safetyNegatives ? SAFETY_NEGATIVE_CLAUSE : null, style.allowBrandMarks ? null : NO_MARKS_CLAUSE].filter(Boolean);
    if (avoid.length > 0) parts.push(`Avoid: ${avoid.join('; ')}`);
    return parts.join('. ');
  });
}
