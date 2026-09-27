import path from 'path';

// Bugs Task 9 (R1) — every data/ and .env.local path used to resolve against
// process.cwd(), so starting the server from the repo root (VS Code's "Debug
// Studio" launch config) read/wrote D:/…/7AI/data instead of studio/data —
// no audio-beds there, so every video_generation attempt died in ffmpeg on a
// missing bed file ("Stage attempt failed after 3 retries"). Anchored to this
// file instead: src/config/ and dist/config/ both sit two levels below studio/.
export const STUDIO_ROOT = path.resolve(__dirname, '..', '..');
export const DATA_DIR = path.join(STUDIO_ROOT, 'data');
