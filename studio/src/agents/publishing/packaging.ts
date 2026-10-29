// Sprint 4 Task 5 (R17): pure helpers that turn a channel's resolved packaging
// preferences into Metadata Generation's user message. {editor} and {sources} are
// filled here, deterministically, before the model ever sees the template, so a
// real name or source list never depends on the model copying it; {summary} and
// {hashtags} are left for the model, as the spec says.

export const FALLBACK_EDITOR = 'the team';

// The one place that decides what name goes into a public credit. Only a real display name is ever published:
// a blank name, or one that looks like an email address (contains '@'), counts as no name (Bugs Acceptance run 1, R1).
export function publicEditorName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed && !trimmed.includes('@') ? trimmed : FALLBACK_EDITOR;
}

export type PackagingParams = {
  titleGuidance?: string | null;
  descriptionTemplate?: string | null;
  hashtagsBase?: string[];
  editorCredit?: boolean;
  editorName?: string | null; // real approver display name, or null for the ops path (never an email)
  sources?: string[];
};

export function formatSources(sources: string[] | undefined): string {
  const list = (sources ?? []).map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? `Sources: ${list.join(', ')}` : '';
}

// Script hashtags first, then the channel's base set, de-duplicated
// case-insensitively and without any leading '#'.
export function unionHashtags(scriptHashtags: string[], base: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...scriptHashtags, ...(base ?? [])]) {
    const tag = raw.trim().replace(/^#+/, '');
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

// Fills {editor} and {sources}. An empty {sources} removes the placeholder and
// tidies the blank line it leaves behind; it is never left as literal text.
export function fillCreditPlaceholders(template: string, editor: string, sources: string): string {
  return template
    .split('{editor}')
    .join(editor)
    .split('{sources}')
    .join(sources)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildMetadataUserMessage(params: { scriptText: string; hashtags: string[] } & PackagingParams): string {
  const hashtags = unionHashtags(params.hashtags, params.hashtagsBase);
  const lines = [`Script: ${params.scriptText}`, `Hashtags: ${hashtags.join(', ')}`];
  const editor = publicEditorName(params.editorName);
  const sources = formatSources(params.sources);

  if (params.titleGuidance) {
    lines.push(`Title guidance: ${params.titleGuidance}`);
  }
  if (params.descriptionTemplate) {
    lines.push(
      `Use this description template, filling in the remaining {summary} and {hashtags} placeholders with real content and keeping every other word exactly as written: ${fillCreditPlaceholders(params.descriptionTemplate, editor, sources)}`,
    );
  } else if (params.editorCredit) {
    lines.push(`End the description with this exact credit line: Edited by ${editor}.`);
  }
  if (params.descriptionTemplate && params.editorCredit && !params.descriptionTemplate.includes('{editor}')) {
    lines.push(`Also end the description with this exact credit line: Edited by ${editor}.`);
  }
  return lines.join('\n');
}

// Safety net after the model replies. A live check showed the model can rewrite the
// description and drop the credit lines, so the credits are enforced here, not left
// to prompt-following: (1) no placeholder text ever reaches YouTube, (2) the real
// editor credit is appended when it was asked for but is missing, (3) likewise the
// sources line when the template used {sources} and there are sources.
export function scrubDescription(description: string, params: PackagingParams): string {
  const editor = publicEditorName(params.editorName);
  const sources = formatSources(params.sources);
  let out = fillCreditPlaceholders(description, editor, sources);
  const template = params.descriptionTemplate ?? '';
  const wantsEditor = template.includes('{editor}') || Boolean(params.editorCredit);
  if (wantsEditor && !out.includes(editor)) {
    out = `${out}\n\nEdited by ${editor}.`;
  }
  if (template.includes('{sources}') && sources && !out.includes(sources)) {
    out = `${out}\n${sources}`;
  }
  return out;
}
