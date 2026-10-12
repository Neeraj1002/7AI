// Sprint 4 Task 10 (R4.5): music credit lines for the description. The manifest's `license`
// text states whether attribution is required (Task 9 R6.4 makes that mandatory per entry), so
// the rule reads that text rather than a second flag that could drift from it.

type BedLike = { label: string; filePath?: string; moodTag?: string; license?: string; attribution?: string };

const NO_ATTRIBUTION = /no attribution( is)? (needed|required)|attribution (is )?not (needed|required)|without attribution/i;

export function licenseRequiresAttribution(license: string | undefined): boolean {
  if (!license) return false;
  if (NO_ATTRIBUTION.test(license)) return false;
  return /attribution|credit/i.test(license);
}

// The beds a long render used. Task 9 chains every track of the plan's mood (pickAudioBedTracks) and
// does not record which were reached, so this is every manifest track of that mood: it can over-credit
// when the video ended before the last track, but never leaves a required credit out. A `audioBeds`
// list (labels or file paths) on the output, if a later change records one, narrows it.
export function bedsUsed(videoGenOutput: unknown, manifest: BedLike[]): BedLike[] {
  const out = videoGenOutput as { audioBeds?: unknown; plan?: { audioLayer?: string } } | null | undefined;
  const recorded = Array.isArray(out?.audioBeds)
    ? (out!.audioBeds as unknown[]).map((b) => (typeof b === 'string' ? b : (b as { label?: string; filePath?: string })?.label ?? (b as { filePath?: string })?.filePath ?? ''))
    : [];
  if (recorded.length > 0) {
    return manifest.filter((t) => recorded.some((r) => r === t.label || r === t.filePath));
  }
  const mood = out?.plan?.audioLayer;
  return mood && mood !== 'none' ? manifest.filter((t) => t.moodTag === mood) : [];
}

export function creditLinesForBeds(beds: BedLike[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const b of beds) {
    if (!licenseRequiresAttribution(b.license) || seen.has(b.label)) continue;
    seen.add(b.label);
    lines.push(b.attribution?.trim() || `Music: ${b.label}`);
  }
  return lines;
}
