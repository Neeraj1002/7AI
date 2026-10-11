// Sprint 4 FE E1 — turns `runs.get().qualityMetrics` into the rows of the Gate 2 "Quality checks" card.
// The server decides every warning: `qualityMetrics.rows.<row> = { warn, message }`. A row that is absent
// means "not applicable" and is hidden. This file never compares a measurement to a threshold and never
// reads text to decide a colour. The only two things it shows without a `rows` entry are the resolution/fps
// line (hard-gated server-side, so a run at Gate 2 already passed it) and "No audio" (red).

export type QualityRowStatus = 'ok' | 'warn' | 'fail';

export type QualityRow = {
  key: 'loudness' | 'truePeak' | 'format' | 'longestShot' | 'captions';
  label: string;
  value: string;
  status: QualityRowStatus;
  /** The server's own explanation, set only on a warned row. */
  message: string | null;
};

export type QualityChecks = { rows: QualityRow[] };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function trim(n: number, digits: number): string {
  // True minus sign, as on the board (−14.2 LUFS).
  return String(Number(n.toFixed(digits))).replace('-', '−');
}

type ServerRow = { warn: boolean; message: string | null };

function serverRow(rows: unknown, key: string): ServerRow | null {
  if (!rows || typeof rows !== 'object') return null;
  const r = (rows as Record<string, unknown>)[key];
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  return { warn: o.warn === true, message: typeof o.message === 'string' && o.message.trim() ? o.message : null };
}

export function parseQualityMetrics(metrics: unknown): QualityChecks | null {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
  const m = metrics as Record<string, unknown>;

  const lufs = num(m.integratedLufs);
  const peak = num(m.truePeakDb);
  const width = num(m.width);
  const height = num(m.height);
  const fps = num(m.fps);
  const longest = num(m.longestShotSeconds);
  const hasAudio = m.hasAudio !== false;

  const out: QualityRow[] = [];
  const flagged = (key: string): Pick<QualityRow, 'status' | 'message'> => {
    const r = serverRow(m.rows, key);
    return r?.warn ? { status: 'warn', message: r.message } : { status: 'ok', message: null };
  };

  const loudnessRow = serverRow(m.rows, 'loudness');
  if (!hasAudio) {
    out.push({ key: 'loudness', label: 'Loudness', value: 'No audio', status: 'fail', message: null });
  } else if (loudnessRow) {
    out.push({ key: 'loudness', label: 'Loudness', value: lufs !== null ? `${trim(lufs, 1)} LUFS` : '—', ...flagged('loudness') });
  }

  if (hasAudio && serverRow(m.rows, 'truePeak')) {
    out.push({ key: 'truePeak', label: 'True peak', value: peak !== null ? `${trim(peak, 1)} dBTP` : '—', ...flagged('truePeak') });
  }

  const formatParts: string[] = [];
  if (width !== null && height !== null) formatParts.push(`${trim(width, 0)}×${trim(height, 0)}`);
  if (fps !== null) formatParts.push(`${trim(fps, 2)} fps`);
  if (formatParts.length) {
    out.push({ key: 'format', label: 'Resolution · frame rate', value: formatParts.join(' · '), status: 'ok', message: null });
  }

  if (serverRow(m.rows, 'longestShot')) {
    out.push({
      key: 'longestShot',
      label: 'Longest single shot',
      value: longest !== null ? `${trim(longest, 1)} s` : '—',
      ...flagged('longestShot'),
    });
  }

  if (serverRow(m.rows, 'captions')) {
    const detected = typeof m.captionsDetected === 'boolean' ? m.captionsDetected : null;
    out.push({
      key: 'captions',
      label: 'Captions',
      value: detected === true ? 'Present' : detected === false ? 'Not detected' : 'Not checked',
      ...flagged('captions'),
    });
  }

  return out.length ? { rows: out } : null;
}
