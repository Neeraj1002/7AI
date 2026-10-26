import { z } from 'zod';
import { CONCEPTS_MADE, CURIOSITY_DEVICES, TYPEFACE_MOODS } from './constants';

// What the packaging model calls return. Written for the provider's structured-output mode: plain objects,
// strings, numbers, nullables; no transforms. Code validates everything that can be checked (check.ts).

const AnswerSchema = z.object({
  // 1-based chapter number for a long video, null when the script has no chapters.
  chapter: z.number().int().min(1).nullable(),
  // Words copied exactly from the approved script that answer the question. Checked in code against the script.
  quote: z.string(),
});

// What the picture is about decides whether a face helps (derived from the script, never configured).
export const SUBJECT_KINDS = ['iconic-thing', 'named-person', 'anonymous-person', 'no-focal-subject'] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

// R1. The curiosity brief.
export const CuriosityBriefSchema = z.object({
  // null when the script has an honest gap; otherwise a plain sentence saying why there is none.
  weakGap: z.string().nullable(),
  whatPeopleBelieve: z.string(),
  whatTheRecordSays: z.string(),
  // The gap between them, as the question a stranger will have. Empty when weakGap is set.
  question: z.string(),
  stake: z.string(),
  // The one thing a viewer should look at in the picture.
  lookAt: z.string(),
  primaryDevice: z.enum(CURIOSITY_DEVICES),
  answeredIn: AnswerSchema,
  subjectKind: z.enum(SUBJECT_KINDS),
  typefaceMood: z.enum(TYPEFACE_MOODS),
  // One sentence promising what the first 5 to 10 seconds deliver.
  promise: z.string(),
  // Set only when the script itself states the popular version and then the documented record.
  correction: z.object({ popularVersion: z.string(), record: z.string(), quote: z.string() }).nullable(),
});
export type CuriosityBrief = z.infer<typeof CuriosityBriefSchema>;

// R2. One concept: a title, a thumbnail concept, the question, where it is answered.
export const ThumbnailConceptSchema = z.object({
  subject: z.string(),
  gazeOrGesture: z.string(),
  scale: z.string(),
  threatOrMystery: z.string(),
  light: z.string(),
  composition: z.string(),
  lettering: z.object({
    words: z.string(),
    subline: z.string().nullable(),
    zone: z.enum(['top', 'bottom', 'left', 'right']),
  }),
});
export type ThumbnailConcept = z.infer<typeof ThumbnailConceptSchema>;

export const ConceptSchema = z.object({
  device: z.enum(CURIOSITY_DEVICES),
  // The grammar allows one primary and at most one supporting device.
  supportingDevice: z.enum(CURIOSITY_DEVICES).nullable(),
  title: z.string(),
  question: z.string(),
  answeredIn: AnswerSchema,
  // A short phrase of the script that supports the scene the picture shows.
  supportQuote: z.string(),
  // Said plainly when the script does not really support this device.
  deviceNote: z.string().nullable(),
  thumbnail: ThumbnailConceptSchema,
  // Every real person named in the title, the lettering or the picture, and whether they may be alive.
  namedPeople: z.array(z.object({ name: z.string(), livingOrUnknown: z.boolean() })),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const ConceptsReplySchema = z.object({ concepts: z.array(ConceptSchema).length(CONCEPTS_MADE) });

// R2's cheap text-only cold reader: sees title and lettering only, never the script, never a picture.
export const ColdReaderSchema = z.object({
  reads: z
    .array(
      z.object({
        index: z.number().int().min(0).max(CONCEPTS_MADE - 1),
        guessedAbout: z.string(),
        // 1 (not at all) to 5 (I have to know).
        curiosity: z.number().min(1).max(5),
        wouldClick: z.enum(['yes', 'maybe', 'no']),
        // True when the title already states the answer to the question it raises.
        answerGivenAway: z.boolean(),
      }),
    ),
  // Candidate indexes from most to least likely to be clicked by a stranger.
  ranking: z.array(z.number().int().min(0).max(CONCEPTS_MADE - 1)),
});
export type ColdReaderReply = z.infer<typeof ColdReaderSchema>;
