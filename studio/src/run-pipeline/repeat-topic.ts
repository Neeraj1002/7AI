// Sprint 4 Task 5 (R20): a deliberately unsophisticated repeat-topic check. No
// dependency, no embeddings: both topics are lowercased, split into words, stripped
// of stopwords and a light plural/"s" suffix, and compared as word sets.
//
// A match needs BOTH:
//   - at least MIN_SHARED_WORDS shared content words, and
//   - overlap coefficient |A and B| / min(|A|, |B|) >= OVERLAP_THRESHOLD.
// The overlap coefficient (not Jaccard) is used because a short topic restated
// inside a longer one is the typical repeat ("the fall of the Roman Empire" vs
// "why the Roman Empire fell": shared {roman, empire}, min set size 3 -> 0.67).
// 0.6 sits between that clear repeat (0.67) and a same-subject-different-angle
// pair such as "Roman Empire" vs "Roman roads" (1 shared word, 0.5), and the
// two-shared-words floor stops a single common word from ever matching.

export const OVERLAP_THRESHOLD = 0.6;
export const MIN_SHARED_WORDS = 2;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but', 'with', 'by', 'from', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'why', 'how',
  'what', 'when', 'who', 'which', 'did', 'does', 'do', 'about', 'into', 'than', 'then', 'so', 'not',
]);

export type RecentTopic = { runId: string; topic: string; createdAt: Date };

function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    out.add(raw.length > 3 && raw.endsWith('s') ? raw.slice(0, -1) : raw);
  }
  return out;
}

export function topicOverlap(a: string, b: string): { shared: number; coefficient: number } {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return { shared: 0, coefficient: 0 };
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return { shared, coefficient: shared / Math.min(wa.size, wb.size) };
}

// The best-matching recent topic (highest overlap, newest on a tie), or null.
export function findLikelyRepeatTopic(newTopic: string, recentTopics: RecentTopic[]): RecentTopic | null {
  let best: { topic: RecentTopic; coefficient: number } | null = null;
  for (const recent of recentTopics) {
    const { shared, coefficient } = topicOverlap(newTopic, recent.topic);
    if (shared < MIN_SHARED_WORDS || coefficient < OVERLAP_THRESHOLD) continue;
    if (
      !best ||
      coefficient > best.coefficient ||
      (coefficient === best.coefficient && recent.createdAt.getTime() > best.topic.createdAt.getTime())
    ) {
      best = { topic: recent, coefficient };
    }
  }
  return best?.topic ?? null;
}
