import { createHash } from 'node:crypto';

// Sprint 6 Task 2 (P5): the one in-video disclaimer sentence, shared by every channel and owned by none.
// The card text, the clip's recorded text and the tests all read this constant; nothing else holds the words.
// Founder-chosen 2026-10-28. Changing it gives a new asset version and needs a new clip.
export const DISCLAIMER_SENTENCE = 'Some visuals in this video are AI-generated or imagined.';

export const DISCLAIMER_SENTENCE_SHA256 = createHash('sha256').update(DISCLAIMER_SENTENCE).digest('hex');
