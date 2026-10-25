// Spike inputs: the three scripts and the three looks. Channel names appear ONLY as labels for the key file;
// no prompt and no logic below reads them. A look is the channel profile's own text (visual.stylePrompt,
// visual.negativePrompt, packaging.titleGuidance) and nothing else.
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, SPIKE_DIR } from './common';

export type Look = { stylePrompt?: string; negativePrompt?: string; titleGuidance?: string; source: string };

export type ScriptSpec = {
  id: string;
  channelLabel: string; // key file only
  kind: 'long' | 'short';
  source: 'generated-from-fixture-brief' | 'dev-db-gate1-passed';
  targetSeconds: number;
  look: Look;
  // generated-from-fixture-brief
  briefFile?: string;
  topic?: string;
  constraints?: string[];
  // dev-db-gate1-passed
  fixtureFile?: string;
};

// The one existing profile text: NIYT's channel config doc (the values its profile is set to). Read verbatim from the
// doc's table rows so the spike uses the real text, not a retyped copy.
function niytLook(): Look {
  const doc = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'channel_bibles', 'NIYT_CHANNEL_CONFIG.md'), 'utf8');
  const field = (name: string): string => {
    const line = doc.split('\n').find((l) => l.startsWith(`| | ${name} |`) || l.startsWith(`| Visual | ${name} |`) || l.startsWith(`| Packaging | ${name} |`));
    if (!line) throw new Error(`NIYT config row not found: ${name}`);
    const m = /`([\s\S]*)`\s*\|\s*$/.exec(line);
    if (!m) throw new Error(`NIYT config row has no backticked value: ${name}`);
    return m[1];
  };
  return {
    stylePrompt: field('stylePrompt'),
    negativePrompt: field('negativePrompt'),
    titleGuidance: field('titleGuidance'),
    source: 'docs/channel_bibles/NIYT_CHANNEL_CONFIG.md (profile table, verbatim)',
  };
}

// No profile on the channel: the pipeline adds no "Style:" line and no channel "Avoid:" text. Title limit is the
// task doc's neutral one.
const NEUTRAL: Look = { source: 'no profile (neutral look)' };
export const NEUTRAL_TITLE_LIMIT = 70;

export const SCRIPTS: ScriptSpec[] = [
  {
    id: 'mary-celeste',
    channelLabel: 'Not In Your Textbook',
    kind: 'long',
    source: 'generated-from-fixture-brief',
    targetSeconds: 600,
    look: niytLook(),
    briefFile: 'studio/src/long-form/fixtures/briefs/mary-celeste.txt',
  },
  {
    id: 'lego',
    channelLabel: 'Underdogs',
    kind: 'long',
    source: 'generated-from-fixture-brief',
    targetSeconds: 120,
    look: NEUTRAL,
    briefFile: 'studio/src/long-form/fixtures/briefs/task6-appendix-b-lego.txt',
    topic: "Lego's recovery from financial crisis to market leader, 2003-2015",
    constraints: [
      'first sentence exactly "In 2003, Lego was losing money fast."',
      'last sentence exactly "Lego won by going back to the brick."',
      'each chapter opens with a question',
      'use the hedge words "about", "roughly", "almost", "by sales"',
      'no logos or brand lettering in pictures',
    ],
  },
  {
    id: 'eiffel',
    channelLabel: 'Dry-run test channel',
    kind: 'long',
    source: 'dev-db-gate1-passed',
    targetSeconds: 120,
    look: NEUTRAL,
    fixtureFile: path.join(SPIKE_DIR, 'fixtures', 'eiffel-gate1-script.json'),
  },
];

export const DEVICES = ['stake', 'scale', 'mystery', 'correction', 'how', 'person', 'countdown'] as const;
export type Device = (typeof DEVICES)[number];

export const FONTS = [
  { key: 'serif', family: 'PlayfairDisplay', file: 'PlayfairDisplay-Black.woff', licence: 'SIL OFL 1.1 (Playfair Display, Black 900)', color: '#F6EDD9' },
  { key: 'condensed', family: 'Anton', file: 'Anton-Regular.woff', licence: 'SIL OFL 1.1 (Anton)', color: '#FFFFFF' },
  { key: 'display', family: 'Cinzel', file: 'Cinzel-Black.woff', licence: 'SIL OFL 1.1 (Cinzel, Black 900)', color: '#F0D68C' },
] as const;
export type FontKey = (typeof FONTS)[number]['key'];

export const FULL = { w: 1280, h: 720 };
export const FEED_W = 360;
export const SIDE_W = 170;
