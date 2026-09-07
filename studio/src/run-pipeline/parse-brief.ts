import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { IntakeParsedSchema, type IntakeParsed } from '../types';
import { NonTransientStageError, TransientStageError } from './retry-with-backoff';

// Intake parsing — BUSINESS_LOGIC.md Section 2. Owned directly by the
// Orchestrator, not a separate agent. A single LLM call: extraction only, no
// niche-matching, no auto-discovery (explicitly out of scope).

const MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `You extract structured information from a short video-content brief.
Given the human's brief text, respond with ONLY a JSON object of the shape:
{"topic": string, "constraints": string[]}

"topic" is the core subject of the video, in a short phrase.
"constraints" is a list of any explicit constraints the brief mentions (length limits,
tone, things to avoid, a specific angle) — an empty array if none are mentioned.

If the brief is too vague or short to identify a topic at all, respond with ONLY:
{"error": "unparseable"}

Respond with raw JSON only — no markdown code fences, no commentary.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

export async function parseBrief(briefText: string): Promise<IntakeParsed> {
  let raw: string;
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: briefText }],
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    raw = textBlock && 'text' in textBlock ? textBlock.text : '';
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
      throw new TransientStageError('Anthropic API connection/server error', error);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new TransientStageError('Anthropic API rate limited', error);
    }
    throw new NonTransientStageError('Anthropic API call failed', error);
  }

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
// Deliberately minimal, not a realistic extractor: the plan is to replace this
// module's direct Anthropic SDK call with a provider-agnostic, per-capability
// LLM abstraction layer, so polishing this stub further isn't worth it — it
// will be replaced along with the real call. A brief containing the word
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
