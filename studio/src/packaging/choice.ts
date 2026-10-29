import { titleIssues } from './gate2-contract';
import { YOUTUBE_SUGGESTED } from './constants';
import type { PackagingChoice, PackagingOutput } from './build';

// R5: the founder picks a package, edits its title, or keeps YouTube's suggested thumbnail. An edited title goes
// through the same title checks a concept does and is refused, with the reasons, when the script does not support it.

export type ChoiceResult = { ok: true; choice: PackagingChoice } | { ok: false; message: string };

export function resolveChoice(params: {
  packaging: PackagingOutput | null;
  packageId: string;
  editedTitle?: string;
  scriptText: string;
  briefText?: string | null;
  userId: string | null;
  now?: Date;
}): ChoiceResult {
  const { packaging } = params;
  const chosenAt = (params.now ?? new Date()).toISOString();
  if (params.packageId === YOUTUBE_SUGGESTED) {
    return { ok: true, choice: { packageId: YOUTUBE_SUGGESTED, title: null, titleEdited: false, chosenAt, chosenByUserId: params.userId } };
  }
  if (!packaging || packaging.status !== 'ready') return { ok: false, message: 'There are no thumbnail options to choose from for this video.' };
  const pkg = packaging.packages.find((p) => p.id === params.packageId);
  if (!pkg) return { ok: false, message: `That option is not one of this video's options.` };

  // An edit that is explicitly empty is refused (not silently turned back into the package's own title).
  if (params.editedTitle !== undefined && params.editedTitle.trim() === '') return { ok: false, message: 'That title cannot be used: The title is empty.' };
  const edited = params.editedTitle?.trim();
  const title = edited && edited !== pkg.title ? edited : pkg.title;
  const titleEdited = title !== pkg.title;
  if (titleEdited) {
    const issues = titleIssues({ title, packaging, pkg, scriptText: params.scriptText, briefText: params.briefText });
    if (issues.length > 0) return { ok: false, message: `That title cannot be used: ${issues.map((i) => i.message).join(' ')}` };
  }
  return { ok: true, choice: { packageId: pkg.id, title, titleEdited, chosenAt, chosenByUserId: params.userId } };
}
