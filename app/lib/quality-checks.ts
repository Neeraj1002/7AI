// Sprint 4 FE E1 — turns the `video_review` stage's `qualityMetrics` into the rows of the Gate 2
// "Quality checks" card. Pass/fail against the quality spec is decided server-side (hard failures
// already block the run before Gate 2), so this file never compares a measurement to a threshold:
// it shows measured values, flags only "no audio" (red) and "captions expected but missing" (amber),
// and passes the server's own `softWarnings` strings through verbatim.

export type QualityRowStatus = 'ok' | 'warn' | 'fail';

export type QualityRow = {
  key: 'loudness' | 'truePeak' | 'format' | 'longestShot' | 'captions';
  label: string;
  value: string;
  status: QualityRowStatus;
};

export type QualityChecks = {
  rows: QualityRow[];
  softWarnings: string[];
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function trim(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)));
}

export function parseQualityMetrics(output: Record<string, unknown> | null | undefined): QualityChecks | null {
  const raw = output?.qualityMetrics;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;

  const lufs = num(m.integratedLufs);
  const peak = num(m.truePeakDb);
  const width = num(m.width);
  const height = num(m.height);
  const fps = num(m.fps);
  const longest = num(m.longestShotSeconds);
  const hasAudio = m.hasAudio !== false;
  const captionsExpected = m.captionsExpected === true;
  const captionsDetected = typeof m.captionsDetected === 'boolean' ? m.captionsDetected : null;

  const formatParts: string[] = [];
  if (width !== null && height !== null) formatParts.push(`${trim(width, 0)}×${trim(height, 0)}`);
  if (fps !== null) formatParts.push(`${trim(fps, 2)} fps`);

  let captionsValue = 'Not expected';
  let captionsStatus: QualityRowStatus = 'ok';
  if (captionsExpected) {
    if (captionsDetected === true) captionsValue = 'Present';
    else if (captionsDetected === false) {
      captionsValue = 'Not detected';
      captionsStatus = 'warn';
    } else captionsValue = 'Not checked';
  }

  const rows: QualityRow[] = [
    {
      key: 'loudness',
      label: 'Loudness',
      value: !hasAudio ? 'No audio' : lufs !== null ? `${trim(lufs, 1)} LUFS` : '—',
      status: hasAudio ? 'ok' : 'fail',
    },
    {
      key: 'truePeak',
      label: 'True peak',
      value: hasAudio && peak !== null ? `${trim(peak, 1)} dBTP` : '—',
      status: 'ok',
    },
    { key: 'format', label: 'Resolution', value: formatParts.length ? formatParts.join(' · ') : '—', status: 'ok' },
    {
      key: 'longestShot',
      label: 'Longest shot',
      value: longest !== null ? `${trim(longest, 1)} s` : '—',
      status: 'ok',
    },
    { key: 'captions', label: 'Captions', value: captionsValue, status: captionsStatus },
  ];

  const softWarnings = Array.isArray(m.softWarnings)
    ? m.softWarnings.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
    : [];

  return { rows, softWarnings };
}
