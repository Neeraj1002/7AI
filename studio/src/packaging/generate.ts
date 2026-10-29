import type { z } from 'zod';
import { callLLM, describeJsonError, extractJsonText, type LLMResponse, type Purpose, type RetryGuard } from '../llm';
import type { LLMAttachment } from '../llm/types';
import { NonTransientStageError } from '../run-pipeline/retry-with-backoff';
import { llmUsageContext } from '../run-pipeline/stage-failure';
import { quoteInScript } from './check';
import {
  BRIEF_SYSTEM,
  COLD_READER_SYSTEM,
  CONCEPTS_SYSTEM,
  briefUser,
  coldReaderUser,
  conceptsUser,
  type ChannelLook,
  type FaceMode,
} from './prompts';
import {
  ColdReaderSchema,
  ConceptsReplySchema,
  CuriosityBriefSchema,
  type ColdReaderReply,
  type Concept,
  type CuriosityBrief,
} from './schemas';

// The three packaging text calls (R1, R2). Each goes through the LLM Registry's callLLM, so the output limit,
// the one automatic retry and the evidence are the registry's. Every reply is validated against its schema; a reply
// that does not parse is a stage error that still carries the spend for booking.

export type Called<T> = { value: T; llm: LLMResponse };

export async function callJson<S extends z.ZodType>(params: {
  purpose: Purpose;
  system: string;
  user: string;
  schema: S;
  retryGuard?: RetryGuard;
  // Pictures the model reads with the text (PR B).
  attachments?: LLMAttachment[];
}): Promise<Called<z.infer<S>>> {
  const llm = await callLLM({
    purpose: params.purpose,
    system: params.system,
    messages: [{ role: 'user', content: params.user, ...(params.attachments ? { attachments: params.attachments } : {}) }],
    outputSchema: params.schema,
    retryGuard: params.retryGuard,
  });
  let json: unknown;
  try {
    json = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    throw new NonTransientStageError(`${params.purpose} did not return valid JSON (${describeJsonError(error)})`, error, llmUsageContext(llm));
  }
  const parsed = params.schema.safeParse(json);
  if (!parsed.success) {
    throw new NonTransientStageError(`${params.purpose} reply failed validation: ${parsed.error.message}`, undefined, llmUsageContext(llm));
  }
  return { value: parsed.data, llm };
}

// R1. The brief quotes where the script answers the question; a quote that is not in the script is not accepted.
// One more try with the problem named; a second miss turns the brief into a plain "weak gap" rather than a guess.
export async function generateBrief(params: {
  renderedScript: string;
  scriptText: string;
  look: ChannelLook;
  retryGuard?: RetryGuard;
}): Promise<{ brief: CuriosityBrief; calls: LLMResponse[] }> {
  const calls: LLMResponse[] = [];
  let user = briefUser(params.renderedScript, params.look);
  for (let attempt = 1; ; attempt += 1) {
    const { value, llm } = await callJson({ purpose: 'packaging-brief', system: BRIEF_SYSTEM, user, schema: CuriosityBriefSchema, retryGuard: params.retryGuard });
    calls.push(llm);
    if (value.weakGap) return { brief: value, calls };
    const problems: string[] = [];
    if (!quoteInScript(params.scriptText, value.answeredIn.quote)) problems.push('answeredIn.quote is not copied exactly from the script');
    if (value.correction && !quoteInScript(params.scriptText, value.correction.quote)) problems.push('correction.quote is not copied exactly from the script');
    if (problems.length === 0) return { brief: value, calls };
    if (attempt >= 2) {
      return {
        brief: { ...value, weakGap: `The brief could not quote where the script answers its question (${problems.join('; ')}).` },
        calls,
      };
    }
    user = `${briefUser(params.renderedScript, params.look)}\n\nYour previous reply was rejected: ${problems.join('; ')}. Copy the quotes character for character from the script, or set correction to null.`;
  }
}

// R2. Six concepts in one call; the caller validates them in code.
export async function generateConcepts(params: {
  renderedScript: string;
  brief: CuriosityBrief;
  look: ChannelLook;
  titleLimit: number;
  faceMode: FaceMode;
  // Round two (R10): rule names and fixed advice from the first round's drops.
  feedback?: string[];
  retryGuard?: RetryGuard;
}): Promise<Called<Concept[]>> {
  const { value, llm } = await callJson({
    purpose: 'packaging-concepts',
    system: CONCEPTS_SYSTEM,
    user: conceptsUser(params.renderedScript, params.brief, params.look, params.titleLimit, params.faceMode, params.feedback),
    schema: ConceptsReplySchema,
    retryGuard: params.retryGuard,
  });
  return { value: value.concepts, llm };
}

// R2. A cheap text-only cold reader, run on the concepts that passed code validation.
export async function coldRead(params: {
  items: Array<{ index: number; title: string; lettering: string }>;
  retryGuard?: RetryGuard;
}): Promise<Called<ColdReaderReply>> {
  return callJson({ purpose: 'packaging-cold-reader', system: COLD_READER_SYSTEM, user: coldReaderUser(params.items), schema: ColdReaderSchema, retryGuard: params.retryGuard });
}
