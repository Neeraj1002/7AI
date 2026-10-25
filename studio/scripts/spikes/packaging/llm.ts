// The only way the spike makes a text call: the LLM Registry's callLLM (cost and evidence come back with the
// reply). Stub mode never reaches it.
import { z } from 'zod';
import { callLLM, extractJsonText, type Purpose, type LLMResponse } from '../../../src/llm';
import type { LLMAttachment } from '../../../src/llm/types';
import { LIVE, OUT, cached, ledger, sha, readJson, writeJson } from './common';
import fs from 'node:fs';
import path from 'node:path';

export function replyCostUsd(res: LLMResponse): number {
  return Number(res.costUsd) + (res.priorAttempts ?? []).reduce((s, p) => s + Number(p.costUsd), 0);
}

const CALL_LOG = path.join(OUT, 'llm-calls.json');
export type CallLogEntry = { label: string; purpose: string; model: string; inputTokens: number; outputTokens: number; costUsd: number; stopReason: string };
export function logCall(entry: CallLogEntry): void {
  const log = fs.existsSync(CALL_LOG) ? readJson<CallLogEntry[]>(CALL_LOG) : [];
  log.push(entry);
  writeJson(CALL_LOG, log);
}

export async function askJson<S extends z.ZodType>(opts: {
  label: string;
  purpose: Purpose;
  system: string;
  user: string;
  schema: S;
  attachments?: LLMAttachment[];
  estimateUsd: number;
  stub: () => z.infer<S>;
}): Promise<z.infer<S>> {
  if (!LIVE) return opts.schema.parse(opts.stub());
  const key = JSON.stringify([opts.purpose, opts.system, opts.user, (opts.attachments ?? []).map((a) => sha(a.dataBase64))]);
  return cached<z.infer<S>>(key, async () => {
    ledger.assertRoom(opts.estimateUsd, opts.label);
    const res = await callLLM({
      purpose: opts.purpose,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user, ...(opts.attachments ? { attachments: opts.attachments } : {}) }],
      outputSchema: opts.schema,
    });
    const costUsd = replyCostUsd(res);
    logCall({ label: opts.label, purpose: opts.purpose, model: res.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, costUsd, stopReason: res.stopReason });
    return { value: opts.schema.parse(JSON.parse(extractJsonText(res.text))), costUsd, label: opts.label };
  });
}
