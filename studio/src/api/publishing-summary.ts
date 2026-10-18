import { z } from 'zod';
import { PublishingReceiptSchema, summarizePublishingRecovery } from '../run-pipeline/publishing-recovery';

export type PublishingSummary = ReturnType<typeof summarizePublishingRecovery>;

// Reuse Task 2's phase/follow-up vocabulary, but keep a closed Admin/CLI surface.
const SummarySchema = z.object({
  phase: PublishingReceiptSchema.shape.phase.nullable(),
  knownIdPresent: z.boolean(), ambiguous: z.boolean(),
  fingerprintMatches: z.boolean().nullable(), ownershipActive: z.boolean(),
  followups: PublishingReceiptSchema.shape.followups.nullable(),
});

export function sanitizePublishingSummary(value: unknown): PublishingSummary | null {
  const parsed = SummarySchema.safeParse(value);
  if (!parsed.success) return null;
  const s = parsed.data;
  const flags = { knownIdPresent: s.knownIdPresent, ambiguous: s.ambiguous, ownershipActive: s.ownershipActive };
  if (s.phase === null) {
    if (s.followups !== null || s.fingerprintMatches !== null || s.knownIdPresent || s.ambiguous || s.ownershipActive) return null;
    return { ...flags, phase: null, fingerprintMatches: null, followups: null };
  }
  if (s.followups === null) return null;
  return {
    ...flags, phase: s.phase, fingerprintMatches: s.fingerprintMatches,
    followups: {
      finalArtifact: s.followups.finalArtifact, thumbnail: s.followups.thumbnail, captions: s.followups.captions,
    },
  };
}

export function projectPublishingSummary(receipt: unknown): PublishingSummary | null {
  if (receipt == null) return sanitizePublishingSummary(summarizePublishingRecovery(null));
  const parsed = PublishingReceiptSchema.safeParse(receipt);
  if (!parsed.success) return null; // Unavailable, never provider/Zod text or fabricated safety.
  // No current approved-file identity is verified here: fingerprintMatches stays null.
  return sanitizePublishingSummary(summarizePublishingRecovery(parsed.data));
}
