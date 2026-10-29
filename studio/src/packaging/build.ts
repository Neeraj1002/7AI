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
import { feedbackFromDrops, MAX_EXTRA_ROUNDS } from './rounds';
import {
  compareHeadToHead as realCompare,
  criticFailures,
  criticRead as realCriticRead,
  defectCheck as realDefectCheck,
  defectWarnings,
  lettersCover,
  payoffCheck as realPayoffCheck,
  payoffFailures,
  type CriticRead,
  type DefectCheck,
  type PayoffCheck,
} from './vision';
import { faceModeFor, renderScript, thumbnailPrompt, type ChannelLook, type FaceMode, type ScriptChapterText } from './prompts';
import type { Concept, CuriosityBrief } from './schemas';

// R1 to R4 and R10 as one function, with every outside effect (LLM calls, the image model, drawing, booking spend,
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
  // R10: 2 when this package came from the second round. Absent (round one) on every older record.
  round?: 1 | 2;
};

// 'building' is a checkpoint of an attempt that has not finished (a restart resumes it); the rest are final.
export type PackagingStatus = 'building' | 'ready' | 'weak_gap' | 'none_passed' | 'failed' | 'skipped';

// One round of concepts and what became of each. Written after every paid step, so a restart picks up where it stopped
// and never pays a step twice (R10 rule 3; also makes round one restart-safe past the concepts).
export type RoundState = {
  round: 1 | 2;
  concepts: Concept[];
  // The concepts that passed the code checks and the cold reader; null until that selection is done.
  keptIds: string[] | null;
  reads: Record<string, { curiosity: number; wouldClick: 'yes' | 'maybe' | 'no'; guessedAbout: string }>;
  // Ids already rendered and checked, kept or dropped.
  processed: string[];
  packages: PackageRecord[];
  dropped: Dropped[];
  compared: boolean;
  finished: boolean;
  // The run's spend limit left no room for the pictures of this round.
  skippedForSpend?: boolean;
};

// R10: the one extra round.
export type RoundTwo = {
  state: 'not_needed' | 'started' | 'finished' | 'skipped';
  reason: string | null;
  // Rule names and fixed advice only (never dropped text); what the second concepts call was told.
  feedback: string[];
};

export type PackagingOutput = {
  version: typeof PACKAGING_OUTPUT_VERSION;
  status: PackagingStatus;
  reason: string | null;
  scriptHash: string;
  brief: CuriosityBrief | null;
  faceMode: FaceMode | null;
  typeface: TypefaceMood | null;
  titleLimit: number;
  // All concepts the model wrote, both rounds (what was offered, for the record).
  concepts: Concept[];
  // Every concept that is not a package, and why (both rounds).
  dropped: Dropped[];
  packages: PackageRecord[];
  textCostUsd: number;
  imageCostUsd: number;
  // R10. Absent on records made before it.
  rounds?: RoundState[];
  roundTwo?: RoundTwo;
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

export type TextLabel = 'brief' | 'concepts' | 'cold-reader' | 'defect-check' | 'payoff' | 'critic' | 'compare';

export type BuildHooks = {
  // Every billed text call, booked by the caller as its own usage rows. `round` is 2 inside the second round.
  onText: (label: TextLabel, calls: LLMResponse[], meta?: { round: 1 | 2 }) => Promise<void>;
  // Each image, right after it is paid for.
  onImage: (info: { packageId: string; costUsd: number; model: string; round?: 1 | 2 }) => Promise<void>;
  // Durable progress, so a restart does not pay for finished steps twice.
  checkpoint: (partial: Partial<PackagingOutput>) => Promise<void>;
  // R10 rule 2: asked once, just before the second round would spend anything. Counts the run's limit, the channel
  // budget and the retry allowance. Absent means there is room for a full round.
  roundTwoRoom?: () => Promise<{ ok: boolean; imagesAllowed: number; reason: string | null }>;
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

const newRound = (round: 1 | 2, concepts: Concept[]): RoundState => ({
  round, concepts, keptIds: null, reads: {}, processed: [], packages: [], dropped: [], compared: false, finished: false,
});

export async function buildPackaging(params: {
  runId: string;
  scriptText: string;
  briefText?: string | null;
  chapters?: ScriptChapterText[];
  chapterTimings?: ChapterTiming[];
  look: ChannelLook;
  // How many images the run's spend limit allows (0 to RENDER_MAX) for round one; fewer than RENDER_MIN means no render.
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
  const dir = thumbnailsDir(params.runId);
  let textCostUsd = params.resume?.textCostUsd ?? 0;
  let imageCostUsd = params.resume?.imageCostUsd ?? 0;
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

  // Rounds resume from what an interrupted attempt wrote. A record from before R10 has concepts and no rounds.
  const rounds: RoundState[] = (params.resume?.rounds ?? []).map((r) => ({ ...r }));
  if (rounds.length === 0 && params.resume?.concepts && params.resume.concepts.length > 0) rounds.push(newRound(1, params.resume.concepts));
  let roundTwo: RoundTwo = params.resume?.roundTwo ?? { state: 'not_needed', reason: null, feedback: [] };

  const snapshot = (): Partial<PackagingOutput> => ({
    brief, textCostUsd, imageCostUsd, rounds, roundTwo,
    concepts: rounds.flatMap((r) => r.concepts),
    dropped: rounds.flatMap((r) => r.dropped),
    packages: rounds.find((r) => r.packages.length > 0 && r.finished)?.packages ?? [],
  });
  const checkpoint = () => params.hooks.checkpoint(snapshot());
  const finish = (status: PackagingStatus, reason: string | null): PackagingOutput => ({
    version: PACKAGING_OUTPUT_VERSION, scriptHash, titleLimit, faceMode, typeface, status, reason,
    brief, textCostUsd, imageCostUsd, rounds, roundTwo,
    concepts: rounds.flatMap((r) => r.concepts),
    dropped: rounds.flatMap((r) => r.dropped),
    packages: rounds.find((r) => r.packages.length > 0 && r.finished)?.packages ?? [],
  });

  if (brief.weakGap) return finish('weak_gap', brief.weakGap);

  // One round: concepts (written here unless resumed), code checks, cold reader, render, picture checks, head to head.
  const runRound = async (state: RoundState, feedback: string[] | undefined, imagesAllowed: number): Promise<RoundState> => {
    const meta = { round: state.round };
    const idOf = (i: number) => (state.round === 1 ? `c${i + 1}` : `r2-c${i + 1}`);
    const conceptOf = (id: string) => state.concepts[state.concepts.findIndex((_, i) => idOf(i) === id)];
    const tag = <T extends Dropped>(d: T): T => ({ ...d, round: state.round });

    if (state.concepts.length === 0) {
      const made = await deps.generateConcepts({ renderedScript: rendered, brief: brief!, look: params.look, titleLimit, faceMode, feedback, retryGuard: params.retryGuard });
      await params.hooks.onText('concepts', [made.llm], meta);
      textCostUsd += spent([made.llm]);
      state.concepts = made.value;
      await checkpoint();
    }

    // R2: the code checks, then the cheap cold reader.
    if (state.keptIds === null) {
      const survivors: Array<{ id: string; concept: Concept }> = [];
      state.concepts.forEach((concept, i) => {
        const issues: ConceptIssue[] = validateConcept({ concept, scriptText: params.scriptText, briefText: params.briefText, brief: brief!, titleLimit });
        if (issues.length > 0) {
          state.dropped.push(tag({ id: idOf(i), title: concept.title, device: concept.device, stage: 'code-check', reasons: issues.map((x) => x.message), rules: [...new Set(issues.map((x) => x.code))] }));
        } else survivors.push({ id: idOf(i), concept });
      });
      if (survivors.length === 0) {
        state.keptIds = [];
      } else {
        const reader = await deps.coldRead({
          items: survivors.map((s, index) => ({ index, title: s.concept.title, lettering: [s.concept.thumbnail.lettering.words, s.concept.thumbnail.lettering.subline].filter(Boolean).join(' / ') })),
          retryGuard: params.retryGuard,
        });
        await params.hooks.onText('cold-reader', [reader.llm], meta);
        textCostUsd += spent([reader.llm]);
        const selection = coldReadSelection(survivors.map((s) => ({ id: s.id, title: s.concept.title, device: s.concept.device })), reader.value);
        state.dropped.push(...selection.dropped.map(tag));
        state.keptIds = selection.kept.map((k) => k.id);
        for (const k of selection.kept) {
          const read = reader.value.reads.find((r) => r.index === survivors.findIndex((s) => s.id === k.id));
          if (read) state.reads[k.id] = { curiosity: read.curiosity, wouldClick: read.wouldClick, guessedAbout: read.guessedAbout };
        }
      }
      await checkpoint();
    }

    // R3 and R4: render two or three, then check each picture.
    const kept = state.keptIds ?? [];
    const count = Math.min(RENDER_MAX, kept.length, imagesAllowed);
    if (kept.length > 0 && count < Math.min(RENDER_MIN, kept.length)) {
      state.skippedForSpend = true;
      state.finished = true;
      await checkpoint();
      return state;
    }
    const bookCalls = async (label: TextLabel, called: Array<{ llm: LLMResponse }>) => {
      await params.hooks.onText(label, called.map((c) => c.llm), meta);
      textCostUsd += spent(called.map((c) => c.llm));
    };
    for (const id of kept.slice(0, count)) {
      if (state.processed.includes(id)) continue;
      const concept = conceptOf(id);
      const drop = (stage: Dropped['stage'], failures: Array<{ rule: string; message: string }>) =>
        state.dropped.push(tag({ id, title: concept.title, device: concept.device, stage, reasons: failures.map((f) => f.message), rules: [...new Set(failures.map((f) => f.rule))] }));
      const prompt = thumbnailPrompt(concept, params.look, faceMode);
      const stills = await deps.generateStills({
        scenePrompts: [prompt],
        size: STILL_SIZE_LANDSCAPE,
        cacheDir: path.join(dir, 'cache'),
        onStillGenerated: (info) => params.hooks.onImage({ packageId: id, costUsd: info.costUsd, model: info.model, round: state.round }),
      }).catch((error: unknown) => {
        if (error instanceof Error && /every one of the 1 scene prompts was blocked/.test(error.message)) return null;
        throw error;
      });
      if (!stills || stills.imagePaths.length === 0) {
        drop('render', [{ rule: 'image_refused', message: 'The image provider refused the picture.' }]);
        state.processed.push(id);
        await checkpoint();
        continue;
      }
      imageCostUsd += Number(stills.costUsd);
      const lettered = await deps.composeThumbnail({
        rawImagePath: stills.imagePaths[0], outDir: dir, baseName: id, words: concept.thumbnail.lettering.words,
        subline: concept.thumbnail.lettering.subline, zone: concept.thumbnail.lettering.zone, typeface,
      });
      if (!lettered.readableAtSidebar) {
        drop('render', [{ rule: 'lettering_unreadable', message: `The lettering is only ${lettered.mainPxSidebar}px tall at the sidebar size.` }]);
        state.processed.push(id);
        await checkpoint();
        continue;
      }

      // PR B (R4): the picture-reading checks. Hard results drop the package with the reason; nothing here picks.
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
          rawImagePath: stills.imagePaths[0], outDir: dir, baseName: id, words: concept.thumbnail.lettering.words,
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
        drop('picture-check', [{ rule: 'lettering_covers_subject', message: `The lettering covers ${cover.what} wherever it is placed.` }]);
        state.processed.push(id);
        await checkpoint();
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
      const payoffFails = payoffFailures(payoff.value, params.scriptText);
      if (payoffFails.length > 0) {
        drop('payoff', payoffFails);
        state.processed.push(id);
        await checkpoint();
        continue;
      }
      const critic = await deps.criticRead(pictureFiles, concept.title.trim(), params.retryGuard);
      await bookCalls('critic', [critic]);
      const criticFails = criticFailures(critic.value);
      if (criticFails.length > 0) {
        drop('picture-check', criticFails);
        state.processed.push(id);
        await checkpoint();
        continue;
      }

      const { files: drawnFiles, plain, ...letteringInfo } = drawn;
      state.packages.push({
        id,
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
        coldReader: state.reads[id] ?? null,
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
        round: state.round,
      });
      state.processed.push(id);
      await checkpoint();
    }

    // Head to head between the survivors, both orders each; advisory, it only orders the cards.
    if (!state.compared && state.packages.length >= 2) {
      const pkgs = state.packages;
      for (let i = 0; i < pkgs.length; i += 1) {
        for (let j = i + 1; j < pkgs.length; j += 1) {
          const a = pkgs[i];
          const b = pkgs[j];
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
      pkgs.sort((x, y) => (y.checks!.headToHead.wins - x.checks!.headToHead.wins) || ((y.coldReader?.curiosity ?? 0) - (x.coldReader?.curiosity ?? 0)));
    }
    state.compared = true;
    state.finished = true;
    await checkpoint();
    return state;
  };

  // ---- round one ----
  let one = rounds.find((r) => r.round === 1);
  if (!one) {
    one = newRound(1, []);
    rounds.push(one);
  }
  if (!one.finished) await runRound(one, undefined, params.imagesAllowed);
  if (one.packages.length > 0) return finish('ready', null);
  if (one.skippedForSpend) return finish('skipped', "The run's spend limit does not leave room for the thumbnail pictures.");

  // ---- R10: one more round when every package of round one was dropped ----
  const explain = (r: RoundState[]) =>
    r.flatMap((x) => x.dropped).filter((d) => d.stage !== 'cold-reader' || !d.rules?.includes('ranked_below_kept')).map((d) => `"${d.title}": ${d.reasons.join(' ')}`).join(' ');
  if (roundTwo.state === 'skipped') return finish('none_passed', `Nothing passed, and a second try was not made: ${roundTwo.reason ?? 'no room'}. ${explain(rounds)}`);
  let two = rounds.find((r) => r.round === 2);
  if (!two) {
    // A second round happens at most MAX_EXTRA_ROUNDS times per packaging run, however often Gate 2 is reopened: the
    // state below is saved before anything is spent, so a restart finds it.
    if (rounds.length - 1 >= MAX_EXTRA_ROUNDS) return finish('none_passed', `Nothing passed. ${explain(rounds)}`);
    const room = params.hooks.roundTwoRoom ? await params.hooks.roundTwoRoom() : { ok: true, imagesAllowed: RENDER_MAX, reason: null };
    if (!room.ok) {
      roundTwo = { state: 'skipped', reason: room.reason ?? 'the budget does not allow it', feedback: [] };
      await checkpoint();
      return finish('none_passed', `Nothing passed, and a second try was not made: ${roundTwo.reason}. ${explain(rounds)}`);
    }
    const feedback = feedbackFromDrops(one.dropped);
    roundTwo = { state: 'started', reason: null, feedback };
    two = newRound(2, []);
    rounds.push(two);
    await checkpoint();
    await runRound(two, feedback, room.imagesAllowed);
  } else if (!two.finished) {
    const room = params.hooks.roundTwoRoom ? await params.hooks.roundTwoRoom() : { ok: true, imagesAllowed: RENDER_MAX, reason: null };
    await runRound(two, roundTwo.feedback, room.imagesAllowed);
  }
  roundTwo = { ...roundTwo, state: 'finished' };
  await checkpoint();
  if (two.packages.length > 0) return finish('ready', null);
  if (two.skippedForSpend) return finish('skipped', "The run's spend limit does not leave room for the thumbnail pictures.");
  return finish('none_passed', `Nothing passed, even after a second try. ${explain(rounds)}`);
}
