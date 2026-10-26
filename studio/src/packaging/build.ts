import crypto from 'node:crypto';
import path from 'node:path';
import type { LLMResponse, RetryGuard } from '../llm';
import { generateStills as realGenerateStills } from '../ai-visuals';
import { STILL_SIZE_LANDSCAPE } from '../ai-visuals/sizes';
import { DATA_DIR } from '../config/paths';
import { formatTimestamp, type ChapterTiming } from '../long-form/chapters';
import { coldReadSelection, type Dropped } from './select';
import { parseTitleLimit, validateConcept, type ConceptIssue } from './check';
import { RENDER_MAX, RENDER_MIN, TYPEFACES, type CuriosityDevice, type TypefaceMood } from './constants';
import { coldRead as realColdRead, generateBrief as realGenerateBrief, generateConcepts as realGenerateConcepts } from './generate';
import { composeThumbnail as realComposeThumbnail, type LetteredThumbnail } from './lettering';
import { faceModeFor, renderScript, thumbnailPrompt, type ChannelLook, type FaceMode, type ScriptChapterText } from './prompts';
import type { Concept, CuriosityBrief } from './schemas';

// R1 to R3 as one function, with every outside effect (LLM calls, the image model, drawing, booking spend,
// checkpoints) passed in, so the logic is tested offline and the stage can book each paid call as it happens.

export const PACKAGING_OUTPUT_VERSION = 1 as const;

export function thumbnailsDir(runId: string): string {
  return path.resolve(DATA_DIR, 'thumbnails', runId);
}

export type AnsweredAt = { chapter: number | null; chapterTitle: string | null; startSec: number | null; label: string; quote: string };

export type PackageRecord = {
  id: string;
  device: CuriosityDevice;
  supportingDevice: CuriosityDevice | null;
  title: string;
  question: string;
  answeredAt: AnsweredAt;
  // The recipe: everything needed to see how this thumbnail was made.
  recipe: {
    concept: Concept['thumbnail'];
    faceMode: FaceMode;
    typeface: TypefaceMood;
    typefaceFamily: string;
    prompt: string;
    imageModel: string;
  };
  lettering: Omit<LetteredThumbnail, 'files'>;
  // File names inside thumbnailsDir(runId).
  files: { full: string; feed: string; sidebar: string };
  coldReader: { curiosity: number; wouldClick: 'yes' | 'maybe' | 'no'; guessedAbout: string } | null;
  imageCostUsd: number;
};

export type PackagingStatus = 'ready' | 'weak_gap' | 'none_passed' | 'failed' | 'skipped';

export type PackagingOutput = {
  version: typeof PACKAGING_OUTPUT_VERSION;
  status: PackagingStatus;
  reason: string | null;
  scriptHash: string;
  brief: CuriosityBrief | null;
  faceMode: FaceMode | null;
  typeface: TypefaceMood | null;
  titleLimit: number;
  // All six concepts as the model wrote them (what was offered, for the record).
  concepts: Concept[];
  // Every concept the model wrote, and why each one that is not a package was dropped.
  dropped: Dropped[];
  packages: PackageRecord[];
  textCostUsd: number;
  imageCostUsd: number;
  // Set by runs.choosePackage before Gate 2 is approved.
  choice?: PackagingChoice;
};

export type PackagingChoice = {
  // A package id, or 'youtube-suggested'.
  packageId: string;
  title: string | null;
  titleEdited: boolean;
  chosenAt: string;
  chosenByUserId: string | null;
};

export function scriptHashOf(scriptText: string, look: ChannelLook): string {
  return crypto.createHash('sha256').update([scriptText, look.stylePrompt ?? '', look.titleGuidance ?? ''].join('\u0000')).digest('hex').slice(0, 24);
}

export type BuildDeps = {
  generateBrief: typeof realGenerateBrief;
  generateConcepts: typeof realGenerateConcepts;
  coldRead: typeof realColdRead;
  generateStills: typeof realGenerateStills;
  composeThumbnail: typeof realComposeThumbnail;
};
export const REAL_DEPS: BuildDeps = {
  generateBrief: realGenerateBrief,
  generateConcepts: realGenerateConcepts,
  coldRead: realColdRead,
  generateStills: realGenerateStills,
  composeThumbnail: realComposeThumbnail,
};

export type BuildHooks = {
  // Every billed text call, booked by the caller as its own usage rows.
  onText: (label: 'brief' | 'concepts' | 'cold-reader', calls: LLMResponse[]) => Promise<void>;
  // Each image, right after it is paid for.
  onImage: (info: { packageId: string; costUsd: number; model: string }) => Promise<void>;
  // Durable progress, so a restart does not pay for finished steps twice.
  checkpoint: (partial: Partial<PackagingOutput> & { keptConceptIds?: string[] }) => Promise<void>;
};

function answeredAt(concept: Concept, chapters: ScriptChapterText[] | undefined, timings: ChapterTiming[] | undefined): AnsweredAt {
  const n = concept.answeredIn.chapter;
  const chapterTitle = n && chapters?.[n - 1] ? chapters[n - 1].title : null;
  const timing = chapterTitle ? timings?.find((t) => t.title === chapterTitle) : undefined;
  const startSec = timing ? Math.round(timing.startSec) : null;
  const label = n
    ? `Chapter ${n}${chapterTitle ? `, ${chapterTitle}` : ''}${startSec !== null ? `, about ${formatTimestamp(startSec)}` : ''}`
    : 'In the script';
  return { chapter: n, chapterTitle, startSec, label, quote: concept.answeredIn.quote };
}

export async function buildPackaging(params: {
  runId: string;
  scriptText: string;
  briefText?: string | null;
  chapters?: ScriptChapterText[];
  chapterTimings?: ChapterTiming[];
  look: ChannelLook;
  // How many images the run's spend limit allows (0 to RENDER_MAX); fewer than RENDER_MIN means no render.
  imagesAllowed: number;
  retryGuard?: RetryGuard;
  hooks: BuildHooks;
  deps?: BuildDeps;
  // From an earlier, interrupted attempt for the same script and look.
  resume?: Partial<PackagingOutput>;
}): Promise<PackagingOutput> {
  const deps = params.deps ?? REAL_DEPS;
  const scriptHash = scriptHashOf(params.scriptText, params.look);
  const titleLimit = parseTitleLimit(params.look.titleGuidance);
  const rendered = renderScript(params.scriptText, params.chapters);
  const base = { version: PACKAGING_OUTPUT_VERSION, scriptHash, titleLimit, dropped: [] as Dropped[], packages: [] as PackageRecord[], concepts: [] as Concept[] };
  let textCostUsd = params.resume?.textCostUsd ?? 0;
  const spent = (calls: LLMResponse[]) => calls.reduce((s, c) => s + Number(c.costUsd) + (c.priorAttempts ?? []).reduce((a, p) => a + Number(p.costUsd), 0), 0);

  // R1. The brief.
  let brief = params.resume?.brief ?? null;
  if (!brief) {
    const made = await deps.generateBrief({ renderedScript: rendered, scriptText: params.scriptText, look: params.look, retryGuard: params.retryGuard });
    await params.hooks.onText('brief', made.calls);
    textCostUsd += spent(made.calls);
    brief = made.brief;
    await params.hooks.checkpoint({ brief, textCostUsd });
  }
  const faceMode = faceModeFor(brief.subjectKind);
  const typeface = brief.typefaceMood;
  const common = { ...base, brief, faceMode, typeface, textCostUsd, imageCostUsd: 0 };
  if (brief.weakGap) {
    return { ...common, status: 'weak_gap', reason: brief.weakGap };
  }

  // R2. Six concepts, validated in code.
  let concepts = params.resume?.concepts ?? null;
  if (!concepts) {
    const made = await deps.generateConcepts({ renderedScript: rendered, brief, look: params.look, titleLimit, faceMode, retryGuard: params.retryGuard });
    await params.hooks.onText('concepts', [made.llm]);
    textCostUsd += spent([made.llm]);
    concepts = made.value;
    await params.hooks.checkpoint({ textCostUsd, concepts });
  }
  const survivors: Array<{ id: string; concept: Concept }> = [];
  const dropped: Dropped[] = [];
  concepts.forEach((concept, i) => {
    const id = `c${i + 1}`;
    const issues: ConceptIssue[] = validateConcept({ concept, scriptText: params.scriptText, briefText: params.briefText, brief: brief!, titleLimit });
    if (issues.length > 0) dropped.push({ id, title: concept.title, device: concept.device, stage: 'code-check', reasons: issues.map((x) => x.message) });
    else survivors.push({ id, concept });
  });
  if (survivors.length === 0) {
    return { ...common, concepts, textCostUsd, dropped, status: 'none_passed', reason: 'Every concept broke a rule the code checks (limits, figures, hedges, wording or sources).' };
  }

  // The cheap text-only cold reader keeps up to three, preferring different devices.
  const reader = await deps.coldRead({
    items: survivors.map((s, index) => ({ index, title: s.concept.title, lettering: [s.concept.thumbnail.lettering.words, s.concept.thumbnail.lettering.subline].filter(Boolean).join(' / ') })),
    retryGuard: params.retryGuard,
  });
  await params.hooks.onText('cold-reader', [reader.llm]);
  textCostUsd += spent([reader.llm]);
  const selection = coldReadSelection(survivors.map((s) => ({ id: s.id, title: s.concept.title, device: s.concept.device })), reader.value);
  dropped.push(...selection.dropped);
  await params.hooks.checkpoint({ textCostUsd, dropped, keptConceptIds: selection.kept.map((k) => k.id) });

  // R3. Render two or three.
  const count = Math.min(RENDER_MAX, selection.kept.length, params.imagesAllowed);
  if (count < Math.min(RENDER_MIN, selection.kept.length)) {
    return { ...common, concepts, textCostUsd, dropped, status: 'skipped', reason: 'The run\'s spend limit does not leave room for the thumbnail pictures.' };
  }
  const dir = thumbnailsDir(params.runId);
  const packages: PackageRecord[] = [];
  let imageCostUsd = 0;
  for (const keep of selection.kept.slice(0, count)) {
    const concept = survivors.find((s) => s.id === keep.id)!.concept;
    const prompt = thumbnailPrompt(concept, params.look, faceMode);
    const read = reader.value.reads.find((r) => r.index === survivors.findIndex((s) => s.id === keep.id)) ?? null;
    const stills = await deps.generateStills({
      scenePrompts: [prompt],
      size: STILL_SIZE_LANDSCAPE,
      cacheDir: path.join(dir, 'cache'),
      onStillGenerated: (info) => params.hooks.onImage({ packageId: keep.id, costUsd: info.costUsd, model: info.model }),
    }).catch((error: unknown) => {
      if (error instanceof Error && /every one of the 1 scene prompts was blocked/.test(error.message)) return null;
      throw error;
    });
    if (!stills || stills.imagePaths.length === 0) {
      dropped.push({ id: keep.id, title: concept.title, device: concept.device, stage: 'render', reasons: ['The image provider refused the picture.'] });
      continue;
    }
    imageCostUsd += Number(stills.costUsd);
    const lettered = await deps.composeThumbnail({
      rawImagePath: stills.imagePaths[0],
      outDir: dir,
      baseName: keep.id,
      words: concept.thumbnail.lettering.words,
      subline: concept.thumbnail.lettering.subline,
      zone: concept.thumbnail.lettering.zone,
      typeface,
    });
    if (!lettered.readableAtSidebar) {
      dropped.push({ id: keep.id, title: concept.title, device: concept.device, stage: 'render', reasons: [`The lettering is only ${lettered.mainPxSidebar}px tall at the sidebar size.`] });
      continue;
    }
    const { files, ...letteringInfo } = lettered;
    packages.push({
      id: keep.id,
      device: concept.device,
      supportingDevice: concept.supportingDevice,
      title: concept.title.trim(),
      question: concept.question,
      answeredAt: answeredAt(concept, params.chapters, params.chapterTimings),
      recipe: { concept: concept.thumbnail, faceMode, typeface, typefaceFamily: TYPEFACES[typeface].family, prompt, imageModel: stills.model },
      lettering: letteringInfo,
      files: { full: path.basename(files.full), feed: path.basename(files.feed), sidebar: path.basename(files.sidebar) },
      coldReader: read ? { curiosity: read.curiosity, wouldClick: read.wouldClick, guessedAbout: read.guessedAbout } : null,
      imageCostUsd: Number(stills.costUsd),
    });
  }
  if (packages.length === 0) {
    return { ...common, concepts, textCostUsd, dropped, imageCostUsd, status: 'none_passed', reason: 'No picture came back usable.' };
  }
  return { ...common, concepts, textCostUsd, imageCostUsd, dropped, packages, status: 'ready', reason: null };
}
