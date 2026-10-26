import crypto from 'node:crypto';
import path from 'node:path';
import type { LLMResponse, RetryGuard } from '../llm';
import { generateStills as realGenerateStills } from '../ai-visuals';
import { STILL_SIZE_LANDSCAPE } from '../ai-visuals/sizes';
import { DATA_DIR } from '../config/paths';
import { formatTimestamp, type ChapterTiming } from '../long-form/chapters';
import { coldReadSelection, type Dropped } from './select';
import { parseTitleLimit, unsupportedProps, validateConcept, type ConceptIssue } from './check';
import { RENDER_MAX, RENDER_MIN, TYPEFACES, type CuriosityDevice, type TypefaceMood } from './constants';
import { coldRead as realColdRead, generateBrief as realGenerateBrief, generateConcepts as realGenerateConcepts } from './generate';
import { composeThumbnail as realComposeThumbnail, type LetteredThumbnail } from './lettering';
import {
  compareHeadToHead as realCompare,
  criticReasons,
  criticRead as realCriticRead,
  defectCheck as realDefectCheck,
  defectWarnings,
  lettersCover,
  payoffCheck as realPayoffCheck,
  payoffReasons,
  type CriticRead,
  type DefectCheck,
  type PayoffCheck,
} from './vision';
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
  lettering: Omit<LetteredThumbnail, 'files' | 'plain'>;
  // File names inside thumbnailsDir(runId). `plain` is the picture before lettering (the defect check reads it).
  files: { full: string; feed: string; sidebar: string; plainFeed?: string; plainSidebar?: string };
  coldReader: { curiosity: number; wouldClick: 'yes' | 'maybe' | 'no'; guessedAbout: string } | null;
  imageCostUsd: number;
  // PR B (R4). Absent on packages made before it.
  checks?: {
    // A stranger who sees only the picture and the title. Advisory: it orders and annotates, never picks.
    critic: CriticRead;
    // The script against the picture and the words. The package is only here because every part passed.
    payoff: PayoffCheck;
    defects: Pick<DefectCheck, 'faceVisible' | 'uncannyAtFeed' | 'uncannyAtSidebar' | 'defects' | 'handsOk'>;
    // Head to head against the other survivors, both orders each.
    headToHead: { wins: number; losses: number; ties: number; reasons: string[] };
  };
  // Things the founder should know and that did not drop the package (an uncanny face, lettering moved off a face).
  warnings?: string[];
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
  // PR B
  defectCheck: typeof realDefectCheck;
  payoffCheck: typeof realPayoffCheck;
  criticRead: typeof realCriticRead;
  compareHeadToHead: typeof realCompare;
};
export const REAL_DEPS: BuildDeps = {
  generateBrief: realGenerateBrief,
  generateConcepts: realGenerateConcepts,
  coldRead: realColdRead,
  generateStills: realGenerateStills,
  composeThumbnail: realComposeThumbnail,
  defectCheck: realDefectCheck,
  payoffCheck: realPayoffCheck,
  criticRead: realCriticRead,
  compareHeadToHead: realCompare,
};

export type BuildHooks = {
  // Every billed text call, booked by the caller as its own usage rows.
  onText: (label: 'brief' | 'concepts' | 'cold-reader' | 'defect-check' | 'payoff' | 'critic' | 'compare', calls: LLMResponse[]) => Promise<void>;
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
  const bookCalls = async (label: Parameters<BuildHooks['onText']>[0], called: Array<{ llm: LLMResponse }>) => {
    await params.hooks.onText(label, called.map((c) => c.llm));
    textCostUsd += spent(called.map((c) => c.llm));
  };
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

    // ---- PR B (R4): the picture-reading checks. Hard results drop the package with the reason; nothing here picks.
    const warnings: string[] = [];
    const defect = await deps.defectCheck({ dir, feed: path.basename(lettered.plain.feed), sidebar: path.basename(lettered.plain.sidebar) }, params.retryGuard);
    await bookCalls('defect-check', [defect]);
    warnings.push(...defectWarnings(defect.value));
    // Lettering over a face or the subject: the box is the lettering's own, the face and subject boxes are the model's.
    // Try the picture's other zones, calmest first, with no new model call (the picture has not changed).
    let drawn = lettered;
    let cover = lettersCover(drawn.textBox, defect.value);
    const tried = new Set([drawn.zone]);
    const coveredWhat = cover.what;
    for (const zone of drawn.zonesByCalm) {
      if (!cover.covers) break;
      if (tried.has(zone)) continue;
      tried.add(zone);
      const again = await deps.composeThumbnail({
        rawImagePath: stills.imagePaths[0], outDir: dir, baseName: keep.id, words: concept.thumbnail.lettering.words,
        subline: concept.thumbnail.lettering.subline, zone, exactZone: true, typeface,
      });
      const next = lettersCover(again.textBox, defect.value);
      if (!next.covers && again.readableAtSidebar) {
        warnings.push(`The lettering was moved to the ${zone} so it does not cover ${coveredWhat}.`);
        // The record keeps the zone the concept asked for, not the one of the last try.
        drawn = { ...again, requestedZone: lettered.requestedZone };
        cover = next;
      }
    }
    if (cover.covers) {
      dropped.push({ id: keep.id, title: concept.title, device: concept.device, stage: 'picture-check', reasons: [`The lettering covers ${cover.what} wherever it is placed.`] });
      continue;
    }
    const files = drawn.files;
    const pictureFiles = { dir, full: path.basename(files.full), feed: path.basename(files.feed), sidebar: path.basename(files.sidebar) };
    const letteringText = [concept.thumbnail.lettering.words, drawn.subline].filter(Boolean).join('. ');

    const payoff = await deps.payoffCheck({
      files: pictureFiles, scriptText: params.scriptText, renderedScript: rendered, title: concept.title.trim(), lettering: letteringText,
      question: concept.question, answeredAtQuote: concept.answeredIn.quote, unnamedProps: unsupportedProps(concept.props, params.scriptText), retryGuard: params.retryGuard,
    });
    await bookCalls('payoff', [payoff]);
    const payoffFails = payoffReasons(payoff.value, params.scriptText);
    if (payoffFails.length > 0) {
      dropped.push({ id: keep.id, title: concept.title, device: concept.device, stage: 'payoff', reasons: payoffFails });
      continue;
    }
    const critic = await deps.criticRead(pictureFiles, concept.title.trim(), params.retryGuard);
    await bookCalls('critic', [critic]);
    const criticFails = criticReasons(critic.value);
    if (criticFails.length > 0) {
      dropped.push({ id: keep.id, title: concept.title, device: concept.device, stage: 'picture-check', reasons: criticFails });
      continue;
    }

    const { files: drawnFiles, plain, ...letteringInfo } = drawn;
    packages.push({
      id: keep.id,
      device: concept.device,
      supportingDevice: concept.supportingDevice,
      title: concept.title.trim(),
      question: concept.question,
      answeredAt: answeredAt(concept, params.chapters, params.chapterTimings),
      recipe: { concept: concept.thumbnail, faceMode, typeface, typefaceFamily: TYPEFACES[typeface].family, prompt, imageModel: stills.model },
      lettering: letteringInfo,
      files: {
        full: path.basename(drawnFiles.full), feed: path.basename(drawnFiles.feed), sidebar: path.basename(drawnFiles.sidebar),
        plainFeed: path.basename(plain.feed), plainSidebar: path.basename(plain.sidebar),
      },
      coldReader: read ? { curiosity: read.curiosity, wouldClick: read.wouldClick, guessedAbout: read.guessedAbout } : null,
      imageCostUsd: Number(stills.costUsd),
      checks: {
        critic: critic.value,
        payoff: payoff.value,
        defects: {
          faceVisible: defect.value.faceVisible, uncannyAtFeed: defect.value.uncannyAtFeed, uncannyAtSidebar: defect.value.uncannyAtSidebar,
          defects: defect.value.defects, handsOk: defect.value.handsOk,
        },
        headToHead: { wins: 0, losses: 0, ties: 0, reasons: [] },
      },
      ...(warnings.length > 0 && { warnings }),
    });
  }

  // Head to head between the survivors, both orders each; advisory, it only orders the cards.
  if (packages.length >= 2) {
    for (let i = 0; i < packages.length; i += 1) {
      for (let j = i + 1; j < packages.length; j += 1) {
        const a = packages[i];
        const b = packages[j];
        const verdict = await deps.compareHeadToHead({
          a: { files: { dir, full: a.files.full, feed: a.files.feed, sidebar: a.files.sidebar }, title: a.title },
          b: { files: { dir, full: b.files.full, feed: b.files.feed, sidebar: b.files.sidebar }, title: b.title },
          retryGuard: params.retryGuard,
        });
        await bookCalls('compare', verdict.calls);
        const ha = a.checks!.headToHead;
        const hb = b.checks!.headToHead;
        if (verdict.winner === 'a') { ha.wins += 1; hb.losses += 1; }
        else if (verdict.winner === 'b') { hb.wins += 1; ha.losses += 1; }
        else { ha.ties += 1; hb.ties += 1; }
        ha.reasons.push(...verdict.reasons);
        hb.reasons.push(...verdict.reasons);
      }
    }
    packages.sort((x, y) => (y.checks!.headToHead.wins - x.checks!.headToHead.wins) || ((y.coldReader?.curiosity ?? 0) - (x.coldReader?.curiosity ?? 0)));
  }
  if (packages.length === 0) {
    const why = dropped.filter((d) => d.stage === 'render' || d.stage === 'picture-check' || d.stage === 'payoff').map((d) => `"${d.title}": ${d.reasons.join(' ')}`);
    return { ...common, concepts, textCostUsd, dropped, imageCostUsd, status: 'none_passed', reason: why.length > 0 ? `Every picture failed a check. ${why.join(' ')}` : 'No picture came back usable.' };
  }
  return { ...common, concepts, textCostUsd, imageCostUsd, dropped, packages, status: 'ready', reason: null };
}
