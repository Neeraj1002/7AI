// Sprint 4 FE E5 — maps the Content profile form <-> `ChannelProfileData` (studio/src/channel-profile/schema.ts).
// The form holds strings only; a blank field is "leave blank to use the default" and is omitted from the data.
// Validation is the server's (Zod): its error is parsed back onto the matching field, nothing is re-implemented here.

export type ProfileForm = {
  offeredFormatKeys: string[]; // formats this channel uses (New brief offers these plus Freeform); [] = none
  guide: string;
  targetSeconds: string;
  bannedOpeners: string; // one per line
  bannedEndings: string; // one per line
  factPolicy: string; // '' | 'brief-only' | 'brief-plus-common'
  defaultSource: string; // '' | a visual source
  stylePrompt: string;
  negativePrompt: string;
  secondsPerStill: string;
  defaultVoice: string; // '' | a voice key
  defaultMoodTag: string; // '' | a mood tag
  titleGuidance: string;
  descriptionTemplate: string;
  hashtagsBase: string; // separated by spaces, commas or lines
  editorCredit: '' | 'yes' | 'no';
  selfDeclaredMadeForKids: '' | 'yes' | 'no';
  categoryId: string;
  defaultLanguage: string;
};

export type ProfileFieldKey = keyof ProfileForm;

export const EMPTY_FORM: ProfileForm = {
  offeredFormatKeys: [],
  guide: '',
  targetSeconds: '',
  bannedOpeners: '',
  bannedEndings: '',
  factPolicy: '',
  defaultSource: '',
  stylePrompt: '',
  negativePrompt: '',
  secondsPerStill: '',
  defaultVoice: '',
  defaultMoodTag: '',
  titleGuidance: '',
  descriptionTemplate: '',
  hashtagsBase: '',
  editorCredit: '',
  selfDeclaredMadeForKids: '',
  categoryId: '',
  defaultLanguage: '',
};

type Data = {
  offeredFormatKeys?: string[];
  script?: Record<string, unknown>;
  visual?: Record<string, unknown>;
  audio?: Record<string, unknown>;
  packaging?: Record<string, unknown>;
};

const lines = (v: string) => v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const tokens = (v: string) => v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
const put = (obj: Record<string, unknown>, key: string, value: unknown) => {
  if (value !== undefined) obj[key] = value;
};

export type BuildResult = { data: Data; localErrors: Partial<Record<ProfileFieldKey, string>> };

export function buildProfileData(f: ProfileForm): BuildResult {
  const localErrors: Partial<Record<ProfileFieldKey, string>> = {};
  const num = (key: ProfileFieldKey): number | undefined => {
    const raw = (f[key] as string).trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      localErrors[key] = 'Enter a number.';
      return undefined;
    }
    return n;
  };
  const text = (v: string) => (v.trim() ? v.trim() : undefined);

  const script: Record<string, unknown> = {};
  put(script, 'guide', text(f.guide));
  put(script, 'targetSeconds', num('targetSeconds'));
  put(script, 'bannedOpeners', lines(f.bannedOpeners).length ? lines(f.bannedOpeners) : undefined);
  put(script, 'bannedEndings', lines(f.bannedEndings).length ? lines(f.bannedEndings) : undefined);
  put(script, 'factPolicy', f.factPolicy || undefined);

  const visual: Record<string, unknown> = {};
  put(visual, 'defaultSource', f.defaultSource || undefined);
  put(visual, 'stylePrompt', text(f.stylePrompt));
  put(visual, 'negativePrompt', text(f.negativePrompt));
  put(visual, 'secondsPerStill', num('secondsPerStill'));

  const audio: Record<string, unknown> = {};
  put(audio, 'defaultVoice', f.defaultVoice || undefined);
  put(audio, 'defaultMoodTag', f.defaultMoodTag || undefined);

  const packaging: Record<string, unknown> = {};
  put(packaging, 'titleGuidance', text(f.titleGuidance));
  put(packaging, 'descriptionTemplate', text(f.descriptionTemplate));
  put(packaging, 'hashtagsBase', tokens(f.hashtagsBase).length ? tokens(f.hashtagsBase) : undefined);
  put(packaging, 'editorCredit', f.editorCredit ? f.editorCredit === 'yes' : undefined);
  put(packaging, 'selfDeclaredMadeForKids', f.selfDeclaredMadeForKids ? f.selfDeclaredMadeForKids === 'yes' : undefined);
  put(packaging, 'categoryId', text(f.categoryId));
  put(packaging, 'defaultLanguage', text(f.defaultLanguage));

  const data: Data = {};
  // Absent and [] both mean "none offered"; the field is only written when something is picked.
  if (f.offeredFormatKeys.length) data.offeredFormatKeys = [...f.offeredFormatKeys];
  if (Object.keys(script).length) data.script = script;
  if (Object.keys(visual).length) data.visual = visual;
  if (Object.keys(audio).length) data.audio = audio;
  if (Object.keys(packaging).length) data.packaging = packaging;
  return { data, localErrors };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const numStr = (v: unknown) => (typeof v === 'number' ? String(v) : '');
const strList = (v: unknown, sep: string) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(sep) : '');
const tri = (v: unknown): '' | 'yes' | 'no' => (v === true ? 'yes' : v === false ? 'no' : '');

export function profileToForm(raw: unknown): ProfileForm {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const offered = (raw as { offeredFormatKeys?: unknown } | null)?.offeredFormatKeys;
  const s = d.script ?? {};
  const v = d.visual ?? {};
  const a = d.audio ?? {};
  const p = d.packaging ?? {};
  return {
    offeredFormatKeys: Array.isArray(offered) ? offered.filter((x): x is string => typeof x === 'string') : [],
    guide: str(s.guide),
    targetSeconds: numStr(s.targetSeconds),
    bannedOpeners: strList(s.bannedOpeners, '\n'),
    bannedEndings: strList(s.bannedEndings, '\n'),
    factPolicy: str(s.factPolicy),
    defaultSource: str(v.defaultSource),
    stylePrompt: str(v.stylePrompt),
    negativePrompt: str(v.negativePrompt),
    secondsPerStill: numStr(v.secondsPerStill),
    defaultVoice: str(a.defaultVoice),
    defaultMoodTag: str(a.defaultMoodTag),
    titleGuidance: str(p.titleGuidance),
    descriptionTemplate: str(p.descriptionTemplate),
    hashtagsBase: strList(p.hashtagsBase, ' '),
    editorCredit: tri(p.editorCredit),
    selfDeclaredMadeForKids: tri(p.selfDeclaredMadeForKids),
    categoryId: str(p.categoryId),
    defaultLanguage: str(p.defaultLanguage),
  };
}

const PATH_TO_FIELD: Record<string, ProfileFieldKey> = {
  'script.guide': 'guide',
  'script.targetSeconds': 'targetSeconds',
  'script.bannedOpeners': 'bannedOpeners',
  'script.bannedEndings': 'bannedEndings',
  'script.factPolicy': 'factPolicy',
  'visual.defaultSource': 'defaultSource',
  'visual.stylePrompt': 'stylePrompt',
  'visual.negativePrompt': 'negativePrompt',
  'visual.secondsPerStill': 'secondsPerStill',
  'audio.defaultVoice': 'defaultVoice',
  'audio.defaultMoodTag': 'defaultMoodTag',
  'packaging.titleGuidance': 'titleGuidance',
  'packaging.descriptionTemplate': 'descriptionTemplate',
  'packaging.hashtagsBase': 'hashtagsBase',
  'packaging.editorCredit': 'editorCredit',
  'packaging.selfDeclaredMadeForKids': 'selfDeclaredMadeForKids',
  'packaging.categoryId': 'categoryId',
  'packaging.defaultLanguage': 'defaultLanguage',
};

// The server rejects bad data as "Invalid channel profile: script.targetSeconds: <zod message>; ...".
// Returns the per-field messages it can place, plus anything it could not (shown above the save bar).
export function parseServerProfileError(message: string): {
  fields: Partial<Record<ProfileFieldKey, string>>;
  general: string | null;
} {
  const prefix = 'Invalid channel profile: ';
  if (!message.startsWith(prefix)) return { fields: {}, general: message };
  const fields: Partial<Record<ProfileFieldKey, string>> = {};
  const unplaced: string[] = [];
  for (const part of message.slice(prefix.length).split('; ')) {
    const at = part.indexOf(': ');
    const path = at >= 0 ? part.slice(0, at) : part;
    const msg = at >= 0 ? part.slice(at + 2) : part;
    const key = path.startsWith('offeredFormatKeys')
      ? 'offeredFormatKeys'
      : PATH_TO_FIELD[path.split('.').slice(0, 2).join('.')];
    if (key && !fields[key]) fields[key] = msg;
    else if (!key) unplaced.push(part);
  }
  return { fields, general: unplaced.length ? unplaced.join('; ') : null };
}

export function formsEqual(a: ProfileForm, b: ProfileForm): boolean {
  return (Object.keys(EMPTY_FORM) as ProfileFieldKey[]).every((k) => {
    const x = a[k];
    const y = b[k];
    return Array.isArray(x) && Array.isArray(y) ? x.length === y.length && x.every((v, i) => v === y[i]) : x === y;
  });
}

// "v3 · script, visuals, audio, packaging" — only sections that hold something.
export function profileSummary(version: number, raw: unknown): string {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const parts = (
    [
      ['script', 'script'],
      ['visual', 'visuals'],
      ['audio', 'audio'],
      ['packaging', 'packaging'],
    ] as const
  )
    .filter(([key]) => {
      const section = d[key];
      return section && typeof section === 'object' && Object.keys(section as object).length > 0;
    })
    .map(([, label]) => label);
  return parts.length ? `v${version} · ${parts.join(', ')}` : `v${version}`;
}

export type ProfileSection = 'script' | 'visual' | 'audio' | 'packaging';

const SECTION_FIELDS: Record<ProfileSection, ProfileFieldKey[]> = {
  script: ['guide', 'targetSeconds', 'bannedOpeners', 'bannedEndings', 'factPolicy'],
  visual: ['defaultSource', 'stylePrompt', 'negativePrompt', 'secondsPerStill'],
  audio: ['defaultVoice', 'defaultMoodTag'],
  packaging: [
    'titleGuidance',
    'descriptionTemplate',
    'hashtagsBase',
    'editorCredit',
    'selfDeclaredMadeForKids',
    'categoryId',
    'defaultLanguage',
  ],
};

// The folded section a field lives in; null for the always-open Formats section.
export function sectionOfField(key: ProfileFieldKey): ProfileSection | null {
  return (Object.keys(SECTION_FIELDS) as ProfileSection[]).find((s) => SECTION_FIELDS[s].includes(key)) ?? null;
}

// Folded summary: "4 of 5 set", or "uses defaults" when nothing in the section is set.
export function sectionSummary(f: ProfileForm, section: ProfileSection): string {
  const fields = SECTION_FIELDS[section];
  const set = fields.filter((k) => (f[k] as string).trim() !== '').length;
  return set === 0 ? 'uses defaults' : `${set} of ${fields.length} set`;
}

// The note under the Formats checkbox list.
export function formatsNote(count: number): { text: string; warn: boolean } {
  if (count === 0) return { text: 'None selected: New brief shows only Freeform for this channel.', warn: false };
  if (count > 4) {
    return { text: `${count} selected. More than 4 makes the New brief picker crowded; allowed, but consider fewer.`, warn: true };
  }
  return { text: `${count} selected. New brief shows these (for the chosen Type) plus Freeform.`, warn: false };
}

// Screen order, top to bottom: where an error should be revealed first.
export const FIELD_ORDER: ProfileFieldKey[] = [
  'offeredFormatKeys',
  ...(Object.keys(SECTION_FIELDS) as ProfileSection[]).flatMap((s) => SECTION_FIELDS[s]),
];

export function firstErrorField(errors: Partial<Record<ProfileFieldKey, string>>): ProfileFieldKey | null {
  return FIELD_ORDER.find((k) => errors[k]) ?? null;
}
