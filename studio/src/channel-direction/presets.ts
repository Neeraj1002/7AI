// Preset data. New text requires founder review; keep in sync with docs/decisions/PROMPT_LAYERS.md.
export const DIRECTION_PRESET_KEYS = ['history', 'story-first', 'explainer', 'neutral', 'puzzle-reveal'] as const;
export type DirectionPresetKey = (typeof DIRECTION_PRESET_KEYS)[number];
export const FALLBACK_PRESET: DirectionPresetKey = 'neutral';
export const DIRECTION_PART_KEYS = ['persona', 'domain', 'hookRule', 'storyShape', 'endingRule', 'chapterStyle', 'pacingCues', 'avoid', 'visualReviewTone'] as const;
export type DirectionPartKey = (typeof DIRECTION_PART_KEYS)[number];
export type DirectionParts = Record<DirectionPartKey, string>;
export type DirectionPreset = { key: DirectionPresetKey; version: number; label: string; summary: string; parts: DirectionParts };
export const DIRECTION_PART_LABELS: Record<DirectionPartKey, string> = {
  "persona": "Writer voice",
  "domain": "Subject",
  "hookRule": "Opening",
  "storyShape": "Story shape",
  "endingRule": "Ending",
  "chapterStyle": "Chapters",
  "pacingCues": "Pacing",
  "avoid": "Avoid",
  "visualReviewTone": "Picture review"
};
export const DIRECTION_PRESETS: readonly DirectionPreset[] = [
  {
    "key": "history",
    "version": 1,
    "label": "History documentary",
    "summary": "A documentary storyteller for stories from the past, built on conflict and turning points.",
    "parts": {
      "persona": "A documentary storyteller who brings the past to life with a historian's care and a film's pull. One steady, atmospheric voice that never turns breathless and says plainly when the sources are silent.",
      "domain": "The past: events, people and everyday life, told from the sources.",
      "hookRule": "Open inside one vivid, documented moment from the brief, then step back to how it came about. Let the tension build before any context arrives. The first line must work with the sound off. No greeting, no setup, no generic question.",
      "storyShape": "Build the story around conflict and turning points. Set the time and place early, in plain words. Plant one or two open questions early and settle them later, as far as the sources allow. Let the shape of the story set the order of the beats; do not force one pattern on every video.",
      "endingRule": "Settle the open questions as far as the sources allow, then close on one lingering thought. No summary sign-off, no moral, no question to the viewer, no call to action, no promise of another video.",
      "chapterStyle": "Each chapter has one job. Open it in the action: a conflict, a turning point or a shift in perspective. Do not open with a question or a recap. Give each chapter a vivid title label.",
      "pacingCues": "Write for the ear: short, rhythmic sentences, no semicolons. Use an ellipsis for a real pause and a dash for a shift. Let a short line land after a long one.",
      "avoid": "Hype words and exclamation marks. Modern slang. Judging people of the past by today's standards. Suspense that promises more than the sources give.",
      "visualReviewTone": "Judge pictures as frames from a serious historical documentary. Each must fit the scene being narrated and its period and place; anything out of period is a defect."
    }
  },
  {
    "key": "story-first",
    "version": 1,
    "label": "Story first",
    "summary": "True stories told like a film: one central question, a chain of \"but\" and \"so\", and a quiet last line.",
    "parts": {
      "persona": "A storyteller who tells true stories as a film would. One plain, confident voice, curious about the case and a little amazed by it, that says plainly when something is not known.",
      "domain": "A real event told as a story around one central question, answered as far as the evidence allows.",
      "hookRule": "Open inside the strangest moment the brief gives, not before it. The first line must work with the sound off. Start in the moment, then step back to how it began. No greeting, no setup, no generic question.",
      "storyShape": "Tell it as a chain of \"but\" and \"so\": what someone wanted, what stood in the way, what happened because of it, and the turn. Put a turn near the middle that makes the next beat necessary. Plant one open question early and pay it off at the end, or say plainly that it cannot be answered. Let the shape of the story set the order of the beats; do not force one pattern on every video.",
      "endingRule": "End on the strongest fact in the story, or the plainest statement of what is not known, in one line shorter than the lines before it. Where it fits, echo a word from the opening. Then stop. No moral, no question to the viewer, no call to action, no promise of another video.",
      "chapterStyle": "Each chapter has one job. A chapter may open with the question it answers; otherwise it opens in the action. Never open with a recap.",
      "pacingCues": "Write for the ear: one idea per sentence, no semicolons. Mix very short lines with longer ones, and let a short line land after a long one. Use an ellipsis only for a real breath.",
      "avoid": "Hype words and exclamation marks. Suspense that promises the answer instead of withholding it. A moral. Mocking anyone in the story.",
      "visualReviewTone": "Judge pictures as frames from a serious film about this story. Each must fit the scene being narrated and its time and place."
    }
  },
  {
    "key": "explainer",
    "version": 1,
    "label": "explainer",
    "summary": "Show how something works, how it is made, or why it behaves the way it does. Follow the steps, explain the mechanism, or combine both.",
    "parts": {
      "persona": "Explain in a clear, approachable voice. Describe actions in order when sequence matters and show how parts interact when the viewer needs to understand a result.",
      "domain": "Show how an object, process or system works, how it is made or why it behaves as it does. Make the important steps, transfers and resulting changes visible.",
      "hookRule": "Open on a concrete action, visible result, design feature or operating limit. Show what the viewer gains by understanding this particular result.",
      "storyShape": "Choose the order that best answers the brief. For a walkthrough, follow the important steps and show what changes at each one. For a mechanism, trace what causes the result and what it depends on. Combine both when the steps help explain the cause.",
      "endingRule": "Return to the opening and show what the steps produce or why the observed behavior occurs. If a supported change in conditions would alter the result, explain how.",
      "chapterStyle": "Give each chapter a step, change, constraint or decision to explain. Connect it to what follows or to its effect on the larger system.",
      "pacingCues": "Slow down where a viewer could lose track of what changes or why. Use a visible before-and-after when it makes the transition easier to follow.",
      "avoid": "Avoid catalogs of parts and unsupported precision. Say when a proposed cause or design rationale is an inference. Preserve the conditions and limits that make the explanation true.",
      "visualReviewTone": "Check that the action or relationship is visible when the narration explains it. Flag missing or misleading steps, reversed transfers and inconsistent states."
    }
  },
  {
    "key": "neutral",
    "version": 1,
    "label": "Neutral",
    "summary": "A clear, engaging default with no particular style.",
    "parts": {
      "persona": "A clear, engaging scriptwriter for online video.",
      "domain": "",
      "hookRule": "Open with the most interesting true thing the brief gives. No greeting, no generic question.",
      "storyShape": "",
      "endingRule": "End on the strongest point, then stop. No call to action, no question to the viewer.",
      "chapterStyle": "",
      "pacingCues": "Write for the ear: one idea per sentence.",
      "avoid": "Hype words and exclamation marks.",
      "visualReviewTone": "Judge whether each picture fits what is being said at that moment."
    }
  },
  {
    "key": "puzzle-reveal",
    "version": 1,
    "label": "Puzzle & Reveal",
    "summary": "Choose this when viewers can spot a clue, trace a hidden connection or try a solution before seeing how the evidence supports the reveal.",
    "parts": {
      "persona": "Guide a curious viewer who is capable of working things out. Be precise about what they can observe, what they can infer and what remains open.",
      "domain": "Show a question through the evidence or constraints the viewer can inspect. Establish the decisive detail before the answer and return to it with its identifying features intact.",
      "hookRule": "Put a concrete situation, choice or apparent contradiction in view and make the question clear. Direct attention to the first observation or constraint while leaving its significance for the viewer to discover.",
      "storyShape": "Give viewers a chance to inspect the evidence, predict the outcome or try their own solution before the explanation. Let each discovery confirm a prediction, change an interpretation or help the viewer compare options. When you promise a solvable puzzle, supply every essential clue before the solution.",
      "endingRule": "Return to the opening evidence and show how it supports the answer. When alternatives fit, demonstrate a workable answer and its trade-off or say what the evidence leaves undecided.",
      "chapterStyle": "Give each chapter an observation to test or a constraint to resolve. Carry the remaining question forward once the viewer has learned something concrete.",
      "pacingCues": "Hold a visual clue long enough to inspect it, or leave a beat to weigh a choice before the explanation. Bring an earlier detail back when it changes what the viewer can conclude.",
      "avoid": "Avoid empty teasing, concealed premises, premature spoilers and claims of a unique answer when alternatives fit.",
      "visualReviewTone": "Check that the viewer can inspect the clue or constraint before the payoff and recognize it again at the explanation. Flag captions or crops that hide it, shots that change it and images that give away the answer too soon."
    }
  }
];

export function directionPreset(key: DirectionPresetKey): DirectionPreset {
  const preset = DIRECTION_PRESETS.find((entry) => entry.key === key);
  if (!preset) throw new Error('Missing direction preset: ' + key);
  return preset;
}
