import { PACKAGES_KEPT, type CuriosityDevice } from './constants';
import type { ColdReaderReply } from './schemas';

export type Dropped = {
  id: string;
  title: string;
  device: CuriosityDevice;
  stage: 'code-check' | 'cold-reader' | 'render' | 'picture-check' | 'payoff';
  reasons: string[];
};

type Candidate = { id: string; title: string; device: CuriosityDevice };

// R2: keep the best PACKAGES_KEPT of the concepts that passed the code checks. A title that gives its answer away
// is dropped. The cold reader's ranking decides the order; among equals a device not yet kept goes first, so the
// founder is not shown three versions of the same idea. Candidates the reader left out of its ranking go last.
export function coldReadSelection(candidates: Candidate[], reply: ColdReaderReply): { kept: Candidate[]; dropped: Dropped[] } {
  const dropped: Dropped[] = [];
  const gaveAway = new Set(reply.reads.filter((r) => r.answerGivenAway).map((r) => r.index));
  const order: number[] = [];
  for (const i of reply.ranking) if (i < candidates.length && !order.includes(i)) order.push(i);
  for (let i = 0; i < candidates.length; i += 1) if (!order.includes(i)) order.push(i);

  const eligible = order.filter((i) => !gaveAway.has(i));
  for (const i of gaveAway) {
    const c = candidates[i];
    if (c) dropped.push({ id: c.id, title: c.title, device: c.device, stage: 'cold-reader', reasons: ['The title already gives its answer away.'] });
  }

  const kept: number[] = [];
  const seen = new Set<CuriosityDevice>();
  for (const i of eligible) {
    if (kept.length >= PACKAGES_KEPT) break;
    if (!seen.has(candidates[i].device)) {
      kept.push(i);
      seen.add(candidates[i].device);
    }
  }
  for (const i of eligible) {
    if (kept.length >= PACKAGES_KEPT) break;
    if (!kept.includes(i)) kept.push(i);
  }
  for (const i of eligible) {
    if (!kept.includes(i)) {
      const c = candidates[i];
      dropped.push({ id: c.id, title: c.title, device: c.device, stage: 'cold-reader', reasons: ['Ranked below the three kept.'] });
    }
  }
  kept.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { kept: kept.map((i) => candidates[i]), dropped };
}
