// Sprint 4 FE E1 — turns `runs.get().qualityMetrics` into the rows of the Gate 2 "Quality checks" card.
// The server decides every warning: `qualityMetrics.rows.<row> = { warn, message }`. A row that is absent
// means "not applicable" and is hidden. This file never compares a measurement to a threshold and never
// reads text to decide a colour. The only two things it shows without a `rows` entry are the resolution/fps
// line (hard-gated server-side, so a run at Gate 2 already passed it) and "No audio" (red).
//
// Targets come only from `qualityMetrics.spec` (the numbers the server used for this run); absent spec = no target.
// Sprint 4 FE Task 2 (R6): plain labels (no LUFS / dBTP), and the rows with no plain label go under one collapsed
// 'Technical details' link. Targets come from `qualityMetrics.spec` (Task 12 R6, on main); the app keeps no second copy
// of the thresholds. A warned row still carries the server's own message.

export type QualityRowStatus = 'ok' | 'warn' | 'fail';

export type QualityRow = {
  key:
    | 'loudness'
    | 'truePeak'
    | 'format'
    | 'longestShot'
    | 'captions'
    | 'videoCodec'
    | 'videoProfile'
    | 'pixelFormat'
    | 'audioSampleRate'
    | 'audioBitrate'
    | 'shotCount';
  label: string;
  value: string;
  status: QualityRowStatus;
  /** Target text printed from `qualityMetrics.spec`; null when the response has no spec. */
  target?: string | null;
  /** The server's own explanation, set only on a warned row. */
  message: string | null;
};

export type QualityChecks = {
  rows: QualityRow[];
  /** Rows with no plain label, shown behind "Technical details". Only those the server reports as applicable. */
  technical: QualityRow[];
  /** True when any technical row has `warn: true` (amber dot on the link). */
  technicalWarn: boolean;
};

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

  const spec = (m.spec && typeof m.spec === 'object' ? m.spec : null) as Record<string, unknown> | null;
  const specNum = (v: unknown) => num(v);
  const loud = spec?.loudnessLufs as { target?: unknown } | undefined;
  const res = spec?.resolution as { width?: unknown; height?: unknown } | undefined;
  const targets = {
    loudness: specNum(loud?.target) !== null ? `target ${trim(loud!.target as number, 0)}` : null,
    truePeak: specNum(spec?.truePeakMaxDb) !== null ? `${trim(spec!.truePeakMaxDb as number, 1)} or lower` : null,
    format:
      specNum(res?.width) !== null && specNum(res?.height) !== null && specNum(spec?.fps) !== null
        ? `${trim(res!.width as number, 0)}×${trim(res!.height as number, 0)} · ${trim(spec!.fps as number, 0)} fps`
        : null,
    longestShot: specNum(spec?.longestShotMaxSec) !== null ? `${trim(spec!.longestShotMaxSec as number, 0)} s or less` : null,
    captions: m.captionsExpected === true ? 'on' : null,
  };
  const out: QualityRow[] = [];
  const flagged = (key: string): Pick<QualityRow, 'status' | 'message'> => {
    const r = serverRow(m.rows, key);
    return r?.warn ? { status: 'warn', message: r.message } : { status: 'ok', message: null };
  };

  const loudnessRow = serverRow(m.rows, 'loudness');
  if (!hasAudio) {
    out.push({ key: 'loudness', label: 'Volume', value: 'No audio', status: 'fail', message: null });
  } else if (loudnessRow) {
    out.push({ key: 'loudness', label: 'Volume', value: lufs !== null ? trim(lufs, 1) : '—', ...flagged('loudness') });
  }

  if (hasAudio && serverRow(m.rows, 'truePeak')) {
    out.push({ key: 'truePeak', label: 'Loudest moment', value: peak !== null ? trim(peak, 1) : '—', ...flagged('truePeak') });
  }

  const formatParts: string[] = [];
  if (width !== null && height !== null) formatParts.push(`${trim(width, 0)}×${trim(height, 0)}`);
  if (fps !== null) formatParts.push(`${trim(fps, 2)} fps`);
  if (formatParts.length) {
    out.push({ key: 'format', label: 'Picture', value: formatParts.join(' · '), status: 'ok', message: null });
  }

  if (serverRow(m.rows, 'longestShot')) {
    out.push({
      key: 'longestShot',
      label: 'Longest shot',
      value: longest !== null ? `${trim(longest, 1)} s` : '—',
      ...flagged('longestShot'),
    });
  }

  if (serverRow(m.rows, 'captions')) {
    const detected = typeof m.captionsDetected === 'boolean' ? m.captionsDetected : null;
    out.push({
      key: 'captions',
      label: 'Captions',
      value: detected === true ? 'On' : detected === false ? 'Not detected' : 'Not checked',
      ...flagged('captions'),
    });
  }

  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const technical: QualityRow[] = [];
  const tech = (key: QualityRow['key'], label: string, value: string | null) => {
    if (!serverRow(m.rows, key)) return;
    technical.push({ key, label, value: value ?? '—', ...flagged(key) });
  };
  const sampleRate = num(m.audioSampleRate);
  const bitrate = num(m.audioBitrateKbps);
  const shots = num(m.shotCount);
  tech('videoCodec', 'Video codec', text(m.videoCodec));
  tech('videoProfile', 'Video profile', text(m.videoProfile));
  tech('pixelFormat', 'Pixel format', text(m.pixFmt));
  tech('audioSampleRate', 'Audio sample rate', sampleRate !== null ? `${trim(sampleRate / 1000, 1)} kHz` : null);
  tech('audioBitrate', 'Audio bitrate', bitrate !== null ? `${trim(bitrate, 0)} kbps` : null);
  tech('shotCount', 'Shot count', shots !== null ? trim(shots, 0) : null);

  for (const r of out) r.target = (targets as Record<string, string | null>)[r.key] ?? null;
  return out.length || technical.length ? { rows: out, technical, technicalWarn: technical.some((r) => r.status === 'warn') } : null;
}
