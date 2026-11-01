import { DEFAULT_READER_PERSONA } from './constants';

// Sprint 6 Task 3, Part A prompts. They name no channel and no niche. The pair reader's prompt carries the reader
// persona and nothing about the video's subject beyond the angle lines it is shown (the reader is blind).

export const ANGLES_SYSTEM = `You propose angles for one short video. An angle is the specific way into a subject, the thing that makes a stranger want to watch.
You are given the subject and any constraints from the brief.
Propose four or five distinct angles. Each angle has:
- "title": a working title, at most 100 characters.
- "promise": one line, at most 220 characters, saying what the viewer will get or learn by the end. Make the promise specific and honest: do not state a figure or a fact the subject text does not give you.
The angles must differ from each other in what they promise, not only in wording. Do not write a script or an outline.
Respond with ONLY a JSON object: {"angles": [{"title": string, "promise": string}]}`;

export function anglesUser(topic: string, constraints: string[]): string {
  const lines = [`Subject: ${topic}`];
  if (constraints.length > 0) lines.push('Constraints from the brief:', ...constraints.map((c) => `- ${c}`));
  return lines.join('\n');
}

export function pairReaderSystem(persona: string | null): string {
  const who = persona && persona.trim() ? persona.trim() : DEFAULT_READER_PERSONA;
  return `You are ${who}.
You will see a list of videos, each shown as an id, a title and a one-line promise. Choose the one you would click and the one you would skip.
Use only the ids shown. Give one short line of why for each choice. The click and the skip must be different videos.
Respond with ONLY a JSON object: {"click": {"id": string, "why": string}, "skip": {"id": string, "why": string}}`;
}

export function pairReaderUser(items: Array<{ id: string; title: string; promise: string }>): string {
  return items.map((i) => `${i.id}. ${i.title}\n   ${i.promise}`).join('\n\n');
}
