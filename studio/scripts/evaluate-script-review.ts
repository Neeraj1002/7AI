/** Explicit, fixture-only paid evaluation. Never imports a runner, database or media producer. */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';

type Entry = { caseId: string; repeat: number; reservedUsd: number; costUsd?: string; status: 'started' | 'completed' | 'failed'; output?: unknown; hints?: number; confirmedHints?: number; error?: string };
async function main() {
  if (!process.argv.includes('--run-paid-fixtures')) throw new Error('Explicit --run-paid-fixtures is required; ceiling $3 total.');
  const keyFile = process.argv[process.argv.indexOf('--key-env-file') + 1];
  if (process.argv.includes('--key-env-file')) process.env.ANTHROPIC_API_KEY = dotenv.parse(readFileSync(keyFile)).ANTHROPIC_API_KEY;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Existing Anthropic credential unavailable.');
  // The fixture runner has no DB dependency. Never import a local/server database URL.
  process.env.DATABASE_URL = 'postgresql://fixtures:unused@127.0.0.1:1/task6_fixtures';
  process.env.NODE_ENV = 'test';
  const { reviewScript, buildUserMessage, SYSTEM_PROMPT, LONG_FORM_SYSTEM_PROMPT } = await import('../src/agents/script-review');
  const { reviewRules } = await import('../src/agents/script-review/rules');
  const { checkBrief } = await import('../src/agents/script-review/brief-checks');
  const { buildEvidencePacket } = await import('../src/content-evidence/packet');
  const { resolvePurpose, resolvePricing } = await import('../src/llm');
  const fixtureFile = path.resolve('src/content-evidence/fixtures/sr-pre-gate.json');
  const fixtureBytes = readFileSync(fixtureFile);
  const fixture = JSON.parse(fixtureBytes.toString()) as { evaluationCases: { caseId: string; briefText: string; scriptText: string; videoKind: 'short' | 'long'; targetSeconds: number; chapterTitles?: string[]; factPolicy: 'brief-only' | 'brief-plus-common' }[] };
  const directory = path.resolve('data/task6-evaluation');
  mkdirSync(directory, { recursive: true });
  const ledgerFile = path.join(directory, 'results.json');
  const model = resolvePurpose('script-review');
  const pricing = resolvePricing(model.model);
  const hash = createHash('sha256').update(fixtureBytes).update(readFileSync('src/agents/script-review/index.ts')).update(readFileSync('src/agents/script-review/rules.ts')).update(readFileSync('src/agents/script-review/brief-checks.ts')).digest('hex');
  type Batch = { hash: string; entries: Entry[] };
  let ledger: Batch & { previousRuns: Batch[] } = existsSync(ledgerFile) ? { previousRuns: [], ...JSON.parse(readFileSync(ledgerFile, 'utf8')) } : { hash, entries: [], previousRuns: [] };
  // Never erase an earlier paid run or its reserved/unknown spend.
  if (ledger.hash !== hash) ledger = { hash, entries: [], previousRuns: [...ledger.previousRuns, { hash: ledger.hash, entries: ledger.entries }] };
  const save = () => writeFileSync(ledgerFile, JSON.stringify({ ...ledger, model, ceilingUsd: 3 }, null, 2) + '\n');
  const spent = () => [...ledger.previousRuns.flatMap(b => b.entries), ...ledger.entries].reduce((sum, e) => sum + (e.costUsd !== undefined ? Number(e.costUsd) : e.reservedUsd), 0);
  for (const c of fixture.evaluationCases) for (let repeat = 1; repeat <= 3; repeat++) {
    if (ledger.entries.some(e => e.caseId === c.caseId && e.repeat === repeat)) continue;
    const evidence = buildEvidencePacket({ briefText: c.briefText, factPolicy: c.factPolicy });
    const params = { scriptText: c.scriptText, captions: '', nicheDescription: 'Historical stories', videoKind: c.videoKind, targetSeconds: c.targetSeconds, chapterTitles: c.chapterTitles, evidence };
    const isLong = c.videoKind === 'long';
    // UTF-8 bytes upper-bound input tokens; extra 4096 covers provider framing/instruction suffix.
    const maxInput = Buffer.byteLength((isLong ? LONG_FORM_SYSTEM_PROMPT : SYSTEM_PROMPT) + reviewRules(isLong) + buildUserMessage(params)) + 4096;
    const reservedUsd = maxInput / 1e6 * pricing.inputPerMillionUsd + (isLong ? 2048 : 1024) / 1e6 * pricing.outputPerMillionUsd;
    if (spent() + reservedUsd > 3) throw new Error('Stopped BEFORE next call: $3 ceiling would be exceeded.');
    const entry: Entry = { caseId: c.caseId, repeat, reservedUsd, status: 'started' };
    ledger.entries.push(entry); save();
    try {
      const result = await reviewScript(params);
      entry.status = 'completed'; entry.costUsd = result.llm.costUsd; entry.output = result.output;
      const checks = checkBrief(c.briefText, c.scriptText);
      entry.hints = checks.hints.length;
      const findingText = [result.output.notes, ...result.output.factualConcerns, ...result.output.styleGuideViolations].join('\n');
      entry.confirmedHints = checks.hints.filter(h => new RegExp('\\b' + h.id + '\\b').test(findingText)).length;
      save();
      console.log(c.caseId + ' ' + repeat + '/3: score ' + result.output.score + ', cost $' + result.llm.costUsd);
    } catch (error) {
      entry.status = 'failed'; entry.error = error instanceof Error ? error.name : 'UnknownError';
      const { getStageErrorContext } = await import('../src/run-pipeline/retry-with-backoff');
      const context = getStageErrorContext(error);
      if (typeof context?.costUsd === 'string') entry.costUsd = context.costUsd;
      if (error instanceof Error && error.message.startsWith('Script Review')) entry.error += ': ' + error.message.slice(0, 500);
      save();
      // Unknown spend remains fully reserved. No automatic retry, no raw provider error/credentials.
      throw new Error('Fixture call failed (' + entry.error + '); stopped. Reserved spend retained.', { cause: error });
    }
  }
  const completed = ledger.entries.filter(e => e.status === 'completed').length;
  const failed = ledger.entries.filter(e => e.status === 'failed').length;
  console.log('Fixture attempts ' + ledger.entries.length + ': ' + completed + ' valid, ' + failed + ' failed. Accounted campaign cost USD ' + spent().toFixed(6));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Evaluation stopped'); process.exitCode = 1; });
