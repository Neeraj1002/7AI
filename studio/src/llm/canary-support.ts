// LLM Registry task, Part B (R8): the parts of `npm run llm:canary` that need no provider and no database, kept
// apart from canary.ts so they are unit-tested: argument rules, the dev-only rule, the table, the near-miss list.

export const DEFAULT_CEILING_USD = 1;

export type CanaryArgs = { yes: boolean; ceilingUsd: number; out?: string };

export function parseCanaryArgs(argv: string[]): CanaryArgs {
  const index = argv.indexOf('--ceiling');
  const ceilingUsd = index > -1 ? Number(argv[index + 1]) : DEFAULT_CEILING_USD;
  if (!Number.isFinite(ceilingUsd) || ceilingUsd <= 0) throw new Error(`--ceiling needs a positive dollar amount (got "${argv[index + 1]}").`);
  const outIndex = argv.indexOf('--out');
  return { yes: argv.includes('--yes'), ceilingUsd, ...(outIndex > -1 ? { out: argv[outIndex + 1] } : {}) };
}

// The canary spends real money on real provider calls, so it runs only where a developer is: never with
// NODE_ENV=production, never when the configured database is the preview database or is not on this machine.
export function assertDevEnvironment(env: { NODE_ENV?: string; DATABASE_URL?: string }): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('llm:canary runs against the dev environment only; NODE_ENV is production.');
  }
  const url = env.DATABASE_URL;
  if (!url) return;
  if (/sevenai_preview/i.test(url)) {
    throw new Error('llm:canary runs against the dev environment only; DATABASE_URL points at sevenai_preview.');
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('llm:canary could not read DATABASE_URL to check that it is a local dev database.');
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`llm:canary runs against the dev environment only; DATABASE_URL host "${host}" is not this machine.`);
  }
}

// Refuses to start without --yes: this spends real money.
export function assertConfirmed(args: CanaryArgs): void {
  if (!args.yes) {
    throw new Error(
      `llm:canary makes real provider calls and spends real money (stops at $${args.ceilingUsd.toFixed(2)}). Run it again with --yes to go ahead:\n  npm run llm:canary -- --yes [--ceiling 1] [--out file.md]`,
    );
  }
}

export type CanaryRow = {
  purpose: string;
  fixture: string;
  model: string;
  limit: number;
  outputTokens: number;
  reasoningTokens: number | null;
  percentUsed: number;
  stopReason: string;
  costUsd: number;
  ms: number;
  nearMiss: boolean;
};

// A limit that leaves a near-miss call at about a third of it, rounded up to 1,000 with the 4,000 floor the task
// uses (the architect tightens limits later from a week of data; this is a proposal, never applied).
export function proposeLimit(outputTokens: number): number {
  return Math.max(4_000, Math.ceil((outputTokens * 3) / 1_000) * 1_000);
}

const fmtUsd = (n: number) => `$${n.toFixed(4)}`;

export function formatTable(rows: CanaryRow[]): string {
  const header = ['purpose', 'fixture', 'model', 'limit', 'outputTokens', 'reasoningTokens', '% used', 'stopReason', 'cost', 'ms'];
  const body = rows.map((r) => [
    r.purpose,
    r.fixture,
    r.model,
    String(r.limit),
    String(r.outputTokens),
    r.reasoningTokens === null ? 'n/a' : String(r.reasoningTokens),
    `${r.percentUsed.toFixed(1)}%`,
    r.stopReason,
    fmtUsd(r.costUsd),
    String(r.ms),
  ]);
  const total = rows.reduce((sum, r) => sum + r.costUsd, 0);
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [
    line(header),
    line(header.map(() => '---')),
    ...body.map(line),
    line(['**total**', `${rows.length} calls`, '', '', '', '', '', '', `**${fmtUsd(total)}**`, '']),
  ].join('\n');
}

export function formatNearMisses(rows: CanaryRow[]): string {
  const near = rows.filter((r) => r.nearMiss);
  if (near.length === 0) return 'near-miss (60% of the limit or more): none';
  return [
    'near-miss (60% of the limit or more):',
    ...near.map((r) => `- ${r.purpose} (${r.fixture}): ${r.outputTokens} of ${r.limit} (${r.percentUsed.toFixed(1)}%), proposed limit ${proposeLimit(r.outputTokens)}`),
  ].join('\n');
}

// A solid-colour PNG, built here so the Video Intelligence row needs no stored image: the purpose only needs a
// frame to attach, and the canary measures the reply's size, not the picture's content.
export function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require('node:zlib') as typeof import('node:zlib');
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
