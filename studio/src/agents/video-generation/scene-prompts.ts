// Sprint 4 Task 3 (R9/R11): builds the final text for each AI-still scene prompt.
// Pure. The channel's style and negative text are appended to every scene, then
// (when the platform flag is on) the fixed safety clause, after the profile's own
// negative rather than replacing it. With nothing set, the input scenes are
// returned unchanged, so a profile-less channel is byte-identical to before.

export const SAFETY_NEGATIVE_CLAUSE =
  'no logos or trademarks, no text or lettering in the image, no photorealistic depiction of an identifiable real person, no gore or graphic content';

export type SceneStyle = {
  stylePrompt?: string | null;
  negativePrompt?: string | null;
  safetyNegatives?: boolean;
};

export function buildStyledScenePrompts(scenes: string[], style: SceneStyle): string[] {
  return scenes.map((scene) => {
    const parts = [scene];
    if (style.stylePrompt) parts.push(`Style: ${style.stylePrompt}`);
    const avoid = [style.negativePrompt, style.safetyNegatives ? SAFETY_NEGATIVE_CLAUSE : null].filter(Boolean);
    if (avoid.length > 0) parts.push(`Avoid: ${avoid.join('; ')}`);
    return parts.join('. ');
  });
}
