import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute, basename } from 'node:path';
import { loadInspectCredential, sanitizeContentView, inspectRun } from './inspect-run-client';
import superjson from 'superjson';
const runId = '11111111-1111-4111-8111-111111111111', token = 'tok_existing_admin_123456';
async function removeTestDirectory(dir: string) {
  const target = relative(tmpdir(), dir);
  if (target.startsWith('..') || isAbsolute(target) || !basename(dir).startsWith('inspect-run-test-')) throw new Error('Refusing unsafe test cleanup path');
  await rm(dir, { recursive: true, force: true });
}
describe('local credential and stored-plan summary bounds', () => {
  it('reads a named existing token file without dotenv or command-line credential values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'inspect-run-test-'));
    try {
      const file = join(dir, 'token'); await writeFile(file, token + '\n', { mode: 0o600 });
      expect(await loadInspectCredential({ INSPECT_RUN_TOKEN_FILE: file })).toBe(token);
      await writeFile(file, 'x'.repeat(8193));
      await expect(loadInspectCredential({ INSPECT_RUN_TOKEN_FILE: file })).rejects.toMatchObject({ code: 'CREDENTIAL_FILE_TOO_LARGE' });
    } finally { await removeTestDirectory(dir); }
  });
  it('returns stored plan/checkpoint/progress summary without prompts, narration or path values', () => {
    const result = sanitizeContentView({ kind: 'stage_output', stageName: 'video_generation', attemptNumber: 6, content: { plan: { longScenes: [{ prompt: 'SECRET', words: 'SECRET' }] }, longPlanningCheckpoint: { inputHash: 'a'.repeat(64), contractVersion: 3, scenes: { '0:0': { prompt: 'SECRET', words: 'SECRET' } } }, stillsProgress: { done: 96, total: 96 }, videoPath: 'SECRET' } }, 'production_plan', token);
    expect(result).toMatchObject({ available: true, attemptNumber: 6, planSceneCount: 1, acceptedSceneCount: 1, sceneIds: ['0:0'], stillsDone: 96, stillsTotal: 96 }); expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('uses only the fixed audited video_generation content view when explicitly selected', async () => {
    const seen: unknown[] = [];
    const transport: typeof fetch = async (_url, init) => {
      if (init?.method === 'POST') seen.push(superjson.deserialize(JSON.parse(String(init.body))));
      return new Response('', { status: 400 });
    };
    await inspectRun({ baseUrl: 'https://7aistudio.tech', runId, attemptNumber: 6, contentView: 'production_plan' }, token, transport);
    expect(seen).toEqual([{ runId, kind: 'planner_diagnostics', attemptNumber: 6 }, { runId, kind: 'stage_output', stageName: 'video_generation', attemptNumber: 6 }]);
  });
});
