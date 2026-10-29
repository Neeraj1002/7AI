import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { RetryGuard } from '../llm';
import type { LLMAttachment } from '../llm/types';
import { callJson, type Called } from './generate';
import { quoteInScript } from './check';
import {
  COMPARE_SYSTEM,
  CRITIC_SYSTEM,
  DEFECT_SYSTEM,
  PAYOFF_SYSTEM,
  compareUser,
  criticUser,
  defectUser,
  payoffUser,
} from './prompts-vision';

// PR B (R4): the picture-reading checks on a rendered package. Every one is a registered call (limit, retry and
// evidence from the registry) that reads the feed-size and sidebar-size files the app shows. Hard results (a scene
// the script lacks, an unanswered question, a picture that contradicts its words or does not connect to its title,
// lettering over the face or the subject) drop a package in build.ts; the critic and the head-to-head only order
// and annotate, and never pick for the founder.

const BoxSchema = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });
export const DefectSchema = z.object({
  faceVisible: z.boolean(),
  uncannyAtFeed: z.boolean(),
  uncannyAtSidebar: z.boolean(),
  defects: z.array(z.string()),
  handsOk: z.boolean(),
  // Fractions of the picture (0 to 1). The lettering's own rectangle is known exactly, so whether it covers a face
  // or the subject is worked out in code (lettersCover), not asked of the model.
  faceBoxes: z.array(BoxSchema),
  subjectBox: BoxSchema.nullable(),
});
export type DefectCheck = z.infer<typeof DefectSchema>;
export type Box = z.infer<typeof BoxSchema>;

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
function overlapShare(of: Box, by: Box): number {
  const w = Math.min(of.x1, by.x1) - Math.max(of.x0, by.x0);
  const h = Math.min(of.y1, by.y1) - Math.max(of.y0, by.y0);
  const a = area(of);
  return w > 0 && h > 0 && a > 0 ? (w * h) / a : 0;
}
// A face is covered when the lettering overlaps this much of it (the eyes and forehead are the top of the box); the
// main subject is covered when the lettering lies over more than half of it. A big subject behind a side line of
// lettering is normal and stays below the line.
export const FACE_COVER_SHARE = 0.12;
export const SUBJECT_COVER_SHARE = 0.5;
export function lettersCover(textBox: Box, check: DefectCheck): { covers: boolean; what: string } {
  for (const face of check.faceBoxes) {
    if (overlapShare(face, textBox) >= FACE_COVER_SHARE) return { covers: true, what: 'a face' };
  }
  if (check.subjectBox && overlapShare(check.subjectBox, textBox) >= SUBJECT_COVER_SHARE) return { covers: true, what: 'the main subject' };
  return { covers: false, what: '' };
}

export const CriticSchema = z.object({
  about: z.string(),
  expectsToSee: z.string(),
  wantsToKnow: z.string(),
  wouldClick: z.enum(['yes', 'maybe', 'no']),
  whyNot: z.string(),
  wouldDisappoint: z.string(),
  // Do the picture and the title, read with no script, give one idea?
  connects: z.boolean(),
  connectsWhy: z.string(),
});
export type CriticRead = z.infer<typeof CriticSchema>;

export const PayoffSchema = z.object({
  // Every distinct scene, person, object or piece of text a viewer can see in the picture or on its lettering.
  visibleThings: z.array(z.object({ what: z.string(), supportedByScript: z.boolean() })),
  // The picture shows something that contradicts its own title or lettering, or the script.
  contradicts: z.boolean(),
  contradictsWhy: z.string(),
  // The script answers the question the package raises, at the quote given (copied exactly from the script).
  questionAnswered: z.boolean(),
  answerQuote: z.string(),
  // The answer is a real payoff for the curiosity (not a cheat, a dodge or a different question).
  arrives: z.boolean(),
  arrivesWhy: z.string(),
  // A fake badge ("4K", "Official"...) or an "untold / really / secret" word the script does not earn.
  fakeLabelOrUnearnedWord: z.boolean(),
  labelWhy: z.string(),
});
export type PayoffCheck = z.infer<typeof PayoffSchema>;

export const CompareSchema = z.object({ winner: z.enum(['A', 'B']), reason: z.string() });

async function asAttachment(file: string): Promise<LLMAttachment> {
  return { mediaType: 'image/jpeg', dataBase64: (await fs.readFile(file)).toString('base64') };
}
export type PictureFiles = { dir: string; full: string; feed: string; sidebar: string };
const pic = (p: PictureFiles, size: 'feed' | 'sidebar') => asAttachment(path.join(p.dir, p[size]));
// The defect check reads the picture before any lettering was drawn on it.
export type PlainFiles = { dir: string; feed: string; sidebar: string };

export async function defectCheck(p: PlainFiles, retryGuard?: RetryGuard): Promise<Called<DefectCheck>> {
  return callJson({
    purpose: 'packaging-defect-check',
    system: DEFECT_SYSTEM,
    user: defectUser(),
    schema: DefectSchema,
    attachments: [await asAttachment(path.join(p.dir, p.feed)), await asAttachment(path.join(p.dir, p.sidebar))],
    retryGuard,
  });
}

export async function criticRead(p: PictureFiles, title: string, retryGuard?: RetryGuard): Promise<Called<CriticRead>> {
  return callJson({
    purpose: 'packaging-critic',
    system: CRITIC_SYSTEM,
    user: criticUser(title),
    schema: CriticSchema,
    attachments: [await pic(p, 'feed'), await pic(p, 'sidebar')],
    retryGuard,
  });
}

export async function payoffCheck(params: {
  files: PictureFiles;
  scriptText: string;
  renderedScript: string;
  title: string;
  lettering: string;
  question: string;
  answeredAtQuote: string;
  // Objects the concept listed that the script never names (a hint, not a verdict).
  unnamedProps?: string[];
  retryGuard?: RetryGuard;
}): Promise<Called<PayoffCheck>> {
  return callJson({
    purpose: 'packaging-payoff',
    system: PAYOFF_SYSTEM,
    user: payoffUser({ renderedScript: params.renderedScript, title: params.title, lettering: params.lettering, question: params.question, answeredAtQuote: params.answeredAtQuote, unnamedProps: params.unnamedProps }),
    schema: PayoffSchema,
    attachments: [await pic(params.files, 'feed')],
    retryGuard: params.retryGuard,
  });
}

// What drops a package after the picture checks, as a rule name plus the sentence the founder reads. The rule names are
// what R10's second round is told (never the dropped text); the messages are for Gate 2. Pure, so it is tested without a model.
export type Failure = { rule: string; message: string };

export function payoffFailures(check: PayoffCheck, scriptText: string): Failure[] {
  const out: Failure[] = [];
  const unsupported = check.visibleThings.filter((t) => !t.supportedByScript).map((t) => t.what);
  if (unsupported.length > 0) out.push({ rule: 'scene_not_in_script', message: `The picture shows ${unsupported.join('; ')}, which the video does not contain.` });
  if (check.contradicts) out.push({ rule: 'picture_contradicts_words', message: `The picture contradicts its words or the script: ${check.contradictsWhy}` });
  if (!check.questionAnswered) out.push({ rule: 'question_unanswered', message: 'The script never answers the question this package raises.' });
  else if (!quoteInScript(scriptText, check.answerQuote)) out.push({ rule: 'answer_quote_not_in_script', message: 'The place the script is said to answer the question is not a quotation from the script.' });
  if (!check.arrives) out.push({ rule: 'answer_does_not_pay_off', message: `The answer does not pay off the curiosity: ${check.arrivesWhy}` });
  if (check.fakeLabelOrUnearnedWord) out.push({ rule: 'fake_label_or_unearned_word', message: `A label or word is not earned: ${check.labelWhy}` });
  return out;
}
export const payoffReasons = (check: PayoffCheck, scriptText: string): string[] => payoffFailures(check, scriptText).map((f) => f.message);

export function criticFailures(read: CriticRead): Failure[] {
  return read.connects ? [] : [{ rule: 'picture_title_mismatch', message: `The picture and the title do not read as one idea without the script: ${read.connectsWhy}` }];
}
export const criticReasons = (read: CriticRead): string[] => criticFailures(read).map((f) => f.message);

// A face that looks uncanny is reported, not hidden (the task: "an uncanny face is reported, not hidden").
export function defectWarnings(check: DefectCheck): string[] {
  const warnings: string[] = [];
  if (check.faceVisible && (check.uncannyAtFeed || check.uncannyAtSidebar)) {
    warnings.push(`A face may look uncanny at ${check.uncannyAtFeed ? 'feed' : 'sidebar'} size${check.defects.length ? `: ${check.defects.join('; ')}` : ''}.`);
  }
  if (check.faceVisible && !check.handsOk) warnings.push('Hands in the picture may look wrong.');
  return warnings;
}

// Head to head, both orders, so position cannot decide: a package wins a pair only when it wins both ways.
export async function compareHeadToHead(params: {
  a: { files: PictureFiles; title: string };
  b: { files: PictureFiles; title: string };
  retryGuard?: RetryGuard;
}): Promise<{ winner: 'a' | 'b' | 'tie'; reasons: string[]; calls: Array<Called<z.infer<typeof CompareSchema>>> }> {
  const ask = async (first: typeof params.a, second: typeof params.b) =>
    callJson({
      purpose: 'packaging-compare',
      system: COMPARE_SYSTEM,
      user: compareUser(first.title, second.title),
      schema: CompareSchema,
      attachments: [await pic(first.files, 'feed'), await pic(second.files, 'feed')],
      retryGuard: params.retryGuard,
    });
  const ab = await ask(params.a, params.b);
  const ba = await ask(params.b, params.a);
  const aWinsFirst = ab.value.winner === 'A';
  const aWinsSecond = ba.value.winner === 'B';
  const winner = aWinsFirst && aWinsSecond ? 'a' : !aWinsFirst && !aWinsSecond ? 'b' : 'tie';
  return { winner, reasons: [ab.value.reason, ba.value.reason], calls: [ab, ba] };
}
