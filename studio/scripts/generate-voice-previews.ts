// Sprint 5 Task 8 (R10 Part B): makes the two fixed preview sentences (one sad, one hopeful) for every enabled voice
// of the catalog, through the same speech path a video uses (catalog model, provider voice and direction).
//   npx tsx scripts/generate-voice-previews.ts                 files only, in studio/data/voice-previews/
//   npx tsx scripts/generate-voice-previews.ts --upload        also upload to R2 under voice-previews/<id>/
//   npx tsx scripts/generate-voice-previews.ts --only coral,marin-documentary
// Prints the `previews` block to paste into each entry of src/media/voice-catalog.config.ts. Cost: about
// $0.002 per voice (two short sentences). Uploading writes to the configured R2 bucket: run it deliberately.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../src/config/paths';
import { synthesizeSpeech, TTS_VOICES } from '../src/media';
import { VOICE_PREVIEW_SENTENCES } from '../src/media/voice-catalog.config';
import { isR2Configured, uploadToR2 } from '../src/storage/r2-client';

async function main() {
  const upload = process.argv.includes('--upload');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)
    ?? (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined);
  const only = onlyArg ? new Set(onlyArg.split(',')) : null;
  if (upload && !isR2Configured()) throw new Error('R2 is not configured; cannot upload');
  const outDir = path.join(DATA_DIR, 'voice-previews');
  let totalUsd = 0;
  const blocks: string[] = [];
  for (const [id, voice] of Object.entries(TTS_VOICES)) {
    if (only && !only.has(id)) continue;
    const keys: Record<string, string> = {};
    for (const [name, sentence] of Object.entries(VOICE_PREVIEW_SENTENCES)) {
      const result = await synthesizeSpeech(sentence, { voice: id });
      totalUsd += Number(result.costUsd);
      const file = path.join(outDir, id, `${name}.mp3`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.copyFile(result.audioPath, file);
      const key = `voice-previews/${id}/${name}.mp3`;
      if (upload) await uploadToR2({ key, filePath: file, contentType: 'audio/mpeg' });
      keys[name] = key;
    }
    console.log(`${id} (${voice.model}${voice.defaultDirection ? ', with direction' : ''}): ${upload ? 'uploaded' : 'saved'}`);
    blocks.push(`  // ${id}\n  previews: { sad: '${keys.sad}', hopeful: '${keys.hopeful}' },`);
  }
  console.log(`\nPaste into voice-catalog.config.ts:\n${blocks.join('\n')}`);
  console.log(`\nspend about $${totalUsd.toFixed(4)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
