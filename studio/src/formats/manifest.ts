// Sprint 4 Task 6 (R25, scoped): a static, typed, in-repo list of reusable
// content formats, same pattern as audio-bed/manifest.ts. Deliberately not a
// DB table: no-deploy editing by non-technical admins is a later requirement.
// `targetSeconds` stays inside the platform 15-60 s bound.

export type ContentFormat = {
  key: string;
  label: string;
  targetSeconds: number;
  briefTemplate: string; // placeholder / starting text in the brief form
  scriptStructure: string; // a short structural hint passed to Script Generation
};

export const CONTENT_FORMATS: ContentFormat[] = [
  {
    key: 'countdown',
    label: 'Countdown',
    targetSeconds: 45,
    briefTemplate: 'Countdown of [N] [things] related to [topic]...',
    scriptStructure: 'Numbered items, ordered ascending or descending, each with one punchy fact.',
  },
  {
    key: 'worse-than-you-thought',
    label: '"X Was Worse Than You Thought"',
    targetSeconds: 40,
    briefTemplate: '[Historical event/thing] and why it was worse than most people realize...',
    scriptStructure: 'Open with the common perception, then escalate with 2-3 specific worse facts.',
  },
  {
    key: 'question-surprising-answer',
    label: 'Question → Surprising Answer',
    targetSeconds: 35,
    briefTemplate: 'A question about [topic] with a genuinely surprising answer...',
    scriptStructure: 'Pose the question cold-open, hold the answer until at least 1/3 through.',
  },
  {
    key: 'origin-story',
    label: 'Origin Story',
    targetSeconds: 45,
    briefTemplate: 'How [thing] actually came to be...',
    scriptStructure: 'Chronological, starting from the least expected origin point, not the well-known version.',
  },
  {
    key: 'underdog-vs-giant',
    label: 'Underdog vs. Giant',
    targetSeconds: 45,
    briefTemplate: '[Small/underrated thing] against [large/famous thing]...',
    scriptStructure: 'Frame the mismatch early, then reveal why the underdog actually won/mattered.',
  },
  {
    key: 'cost-vs-price',
    label: 'Cost vs. Price',
    targetSeconds: 40,
    briefTemplate: 'What [thing] really costs, beyond the sticker price...',
    scriptStructure: 'State the obvious price, then reveal the hidden/real cost.',
  },
  {
    key: 'what-it-feels-like',
    label: '"What It Feels Like To…"',
    targetSeconds: 40,
    briefTemplate: 'What it actually feels like to [experience]...',
    scriptStructure: 'Second-person, sensory, present-tense narration.',
  },
  {
    key: 'myth-vs-fact',
    label: 'Myth vs. Fact',
    targetSeconds: 40,
    briefTemplate: 'A common myth about [topic] and the real fact...',
    scriptStructure: 'State the myth as most people believe it, then correct it directly.',
  },
  {
    key: 'top-3',
    label: 'Top 3',
    targetSeconds: 40,
    briefTemplate: 'The top 3 [things] related to [topic]...',
    scriptStructure: 'Exactly 3 items, most-to-least or least-to-most surprising.',
  },
];

export const FORMAT_KEYS = CONTENT_FORMATS.map((f) => f.key) as [string, ...string[]];

export function findFormat(key: string | null | undefined): ContentFormat | undefined {
  return key ? CONTENT_FORMATS.find((f) => f.key === key) : undefined;
}
