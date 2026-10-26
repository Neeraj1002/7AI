import fs from 'node:fs';
import path from 'node:path';
import type { Concept, CuriosityBrief } from './schemas';

// Test data for the packaging tests. The script is a Gate-1-approved script of a dry-run test channel (the Task 1
// spike's fixture). No channel name belongs in any packaging prompt, fixture or test.
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'eiffel-script.json'), 'utf8')) as {
  scriptText: string;
  chapters: Array<{ title: string; text: string }>;
};
export const EIFFEL_SCRIPT = fixture.scriptText;
export const EIFFEL_CHAPTERS = fixture.chapters;

export const ANSWER_QUOTE = "Eiffel turned his tower into a scientific tool the city couldn't afford to lose";
export const SUPPORT_QUOTE = 'It was assembled from 18,038 pieces of wrought iron';

export function makeBrief(over: Partial<CuriosityBrief> = {}): CuriosityBrief {
  return {
    weakGap: null,
    whatPeopleBelieve: 'The tower was built to last and always loved.',
    whatTheRecordSays: 'It had a 20-year permit and was nearly torn down.',
    question: 'Why was the tower nearly torn down?',
    stake: 'The tower could have been scrapped.',
    lookAt: 'The tower with a crane and hook at its top',
    primaryDevice: 'stake',
    answeredIn: { chapter: 4, quote: ANSWER_QUOTE },
    subjectKind: 'iconic-thing',
    typefaceMood: 'stakes',
    promise: 'In ten seconds we learn the tower had only a twenty year permit.',
    correction: null,
    ...over,
  };
}

export function makeConcept(over: Partial<Concept> = {}): Concept {
  return {
    device: 'stake',
    supportingDevice: 'scale',
    title: 'Why was it nearly torn down after 20 years?',
    question: 'Why was the tower nearly torn down?',
    answeredIn: { chapter: 3, quote: 'Its construction permit was only for 20 years' },
    supportQuote: SUPPORT_QUOTE,
    deviceNote: null,
    props: ['rivets'],
    thumbnail: {
      subject: 'a huge iron tower under construction',
      gazeOrGesture: 'a worker looks up at it',
      scale: 'the worker is tiny beside the tower',
      threatOrMystery: 'a crane and hook hang at the top',
      light: 'low golden light from the left',
      composition: 'tower centre, workers foreground, calm sky at the top',
      lettering: { words: 'SOLD FOR SCRAP?', subline: null, zone: 'top' },
    },
    namedPeople: [],
    ...over,
  };
}
