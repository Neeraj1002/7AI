import { callLLM, extractJsonText } from '../llm';
import { IntakeParsedSchema, type IntakeParsed } from '../types';
import { NonTransientStageError } from './retry-with-backoff';

// Intake parsing — BUSINESS_LOGIC.md Section 2. Owned directly by the
// Orchestrator, not a separate agent. A single LLM call: extraction only, no
// niche-matching, no auto-discovery (explicitly out of scope).
//
// Calls through studio/src/llm/ (Week 2 Task 1) rather than a provider SDK
// directly — see docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md.
// callLLM already normalizes provider failures to TransientStageError/
// NonTransientStageError at the client.ts boundary, so there's no
// provider-specific error handling left to do here.

const SYSTEM_PROMPT = `You extract structured information from a short video-content brief.
Given the human's brief text, respond with ONLY a JSON object of the shape:
{"topic": string, "constraints": string[]}

"topic" is the core subject of the video, in a short phrase.
"constraints" is a list of any explicit constraints the brief mentions (length limits,
tone, things to avoid, a specific angle) — an empty array if none are mentioned.

If the brief is too vague or short to identify a topic at all, respond with ONLY:
{"error": "unparseable"}

Respond with raw JSON only — no markdown code fences, no commentary.`;

export async function parseBrief(briefText: string): Promise<IntakeParsed> {
  const response = await callLLM({
    purpose: 'intake-parsing',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: briefText }],
    maxTokens: 512,
  });
  const raw = response.text;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(raw));
  } catch (error) {
    throw new NonTransientStageError(
      `Brief too vague/unparseable — model did not return valid JSON: ${raw.slice(0, 200)}`,
      error,
    );
  }

  if (
    typeof parsedJson === 'object' &&
    parsedJson !== null &&
    'error' in parsedJson &&
    (parsedJson as { error: unknown }).error === 'unparseable'
  ) {
    throw new NonTransientStageError('Brief too vague to extract a topic from');
  }

  const result = IntakeParsedSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new NonTransientStageError(`Intake output failed schema validation: ${result.error.message}`);
  }

  return result.data;
}

// Fake stand-in for parseBrief with the same contract, used only by
// scripts/dry-run.ts (via INTAKE_STAGE_STUB=1) to exercise the state machine's
// resumability mechanics and error-path plumbing without a live API key.
//
// Deliberately minimal, not a realistic extractor — kept around for fast,
// zero-cost dry runs even now that a real key is configured (see
// scripts/dry-run.ts's INTAKE_STAGE_STUB flag). A brief containing the word
// "unparseable" exercises the needs_attention failure path; everything else
// resolves after an artificial delay long enough to kill-and-resume mid-flight.
export async function stubParseBrief(briefText: string): Promise<IntakeParsed> {
  await new Promise((resolve) => setTimeout(resolve, 8000));

  if (briefText.toLowerCase().includes('unparseable')) {
    throw new NonTransientStageError('Brief too vague to extract a topic from (stub)');
  }

  return IntakeParsedSchema.parse({
    topic: briefText.slice(0, 60).trim() || 'untitled',
    constraints: [],
  });
}
