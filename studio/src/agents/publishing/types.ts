import { z } from 'zod';

// This project's own Publishing request/response types — never the
// underlying provider's. Mirrors studio/src/media/types.ts's shape.

export const PublishingMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  tags: z.array(z.string()).min(1),
});
export type PublishingMetadata = z.infer<typeof PublishingMetadataSchema>;

// Hardcoded per docs/execution/week4/BUSINESS_LOGIC.md Section 2 ("Privacy
// status — hardcoded default, not a config UI") — MVP_ROADMAP_OCT15.md
// Section 12's explicit "publish as unlisted/private first, not public."
// Flip to 'public' is a one-line change here when the founder is ready for
// the real public test window; not a per-channel config this week.
export const PRIVACY_STATUS = 'private' as const;

export type UploadParams = {
  videoPath: string;
  metadata: PublishingMetadata;
};

export type UploadResult = {
  youtubeVideoId: string;
  privacyStatus: typeof PRIVACY_STATUS;
};
