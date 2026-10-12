import type { PublishingMetadata } from '../agents/publishing/types';
import { appendChapterList, buildChapterList, stripShortsFromTags, stripShortsTag, type ChapterTiming } from './chapters';

// Sprint 4 Task 10 (R4): the one place the long-form upload text is assembled, used by the
// publishing stage and unit tests. Description = generated text + chapter list (only when
// YouTube's three rules hold) + credit lines. No #shorts anywhere.
export function assembleLongFormMetadata(params: {
  generated: PublishingMetadata;
  chapterTimings: ChapterTiming[] | undefined;
  creditLines: string[];
}): { metadata: PublishingMetadata; chapterListIncluded: boolean; chapterWarning?: string } {
  let description = stripShortsTag(params.generated.description);
  const list = buildChapterList(params.chapterTimings);
  if (list.ok) description = appendChapterList(description, list.text);
  for (const line of params.creditLines) {
    if (!description.includes(line)) description = `${description}\n${line}`;
  }
  return {
    metadata: {
      ...params.generated,
      title: stripShortsTag(params.generated.title) || params.generated.title,
      description,
      tags: stripShortsFromTags(params.generated.tags),
    },
    chapterListIncluded: list.ok,
    ...(list.ok ? {} : { chapterWarning: list.warning }),
  };
}
