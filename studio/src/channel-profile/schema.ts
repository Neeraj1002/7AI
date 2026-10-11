import { z } from 'zod';
import { TTS_VOICE_KEYS } from '../media';
import { VISUAL_SOURCES, AUDIO_LAYERS } from '../agents/video-generation/plan';
import { findFormat } from '../formats/manifest';

// Sprint 4 Task 1 (R1): the data a ChannelProfileVersion row holds. Only what
// Sprint 4 Tasks 2-6 read; later sprints extend these same objects rather than
// adding parallel columns. Every field and every object is optional (an empty
// `{}` is a valid profile that falls through to legacy/platform defaults), and
// every object is .strict() so a typo'd field name fails loudly at write time.

export const ChannelProfileScriptSchema = z
  .object({
    guide: z.string().optional(),
    targetSeconds: z.number().int().min(15).max(60).optional(),
    bannedOpeners: z.array(z.string()).optional(),
    bannedEndings: z.array(z.string()).optional(),
    factPolicy: z.enum(['brief-only', 'brief-plus-common']).optional(),
  })
  .strict();

export const ChannelProfileVisualSchema = z
  .object({
    defaultSource: z.enum(VISUAL_SOURCES).optional(),
    stylePrompt: z.string().optional(),
    negativePrompt: z.string().optional(),
    secondsPerStill: z.number().min(1).max(10).optional(),
  })
  .strict();

export const ChannelProfileAudioSchema = z
  .object({
    defaultVoice: z.enum(TTS_VOICE_KEYS).optional(),
    defaultMoodTag: z.enum(AUDIO_LAYERS).optional(),
  })
  .strict();

export const ChannelProfilePackagingSchema = z
  .object({
    titleGuidance: z.string().optional(),
    descriptionTemplate: z.string().optional(), // supports {summary} {sources} {editor} {hashtags}
    hashtagsBase: z.array(z.string()).optional(),
    editorCredit: z.boolean().optional(),
    // R18 (Task 5): sent explicitly on upload (YouTube status.selfDeclaredMadeForKids,
    // snippet.categoryId, snippet.defaultLanguage), never left to Studio defaults.
    selfDeclaredMadeForKids: z.boolean().optional(),
    categoryId: z.string().optional(), // YouTube numeric category id as a string, e.g. "27"
    defaultLanguage: z.string().optional(), // BCP-47, e.g. "en"
  })
  .strict();

// Sprint 4 Task 9 (R1b): the formats this channel offers, in display order. Each key must
// exist in the format manifest and appear once; any mix of short and long. An absent field
// (every profile version written before this) means "none offered". The UI recommends 2-4;
// the server enforces no count.
export const OfferedFormatKeysSchema = z
  .array(z.string().refine((key) => findFormat(key) !== undefined, { message: 'unknown format key' }))
  .refine((keys) => new Set(keys).size === keys.length, { message: 'duplicate format key' });

export const ChannelProfileDataSchema = z
  .object({
    offeredFormatKeys: OfferedFormatKeysSchema.optional(),
    script: ChannelProfileScriptSchema.optional(),
    visual: ChannelProfileVisualSchema.optional(),
    audio: ChannelProfileAudioSchema.optional(),
    packaging: ChannelProfilePackagingSchema.optional(),
  })
  .strict();
export type ChannelProfileData = z.infer<typeof ChannelProfileDataSchema>;
