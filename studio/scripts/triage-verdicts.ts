// Sprint 3 closure: record the founder's 2026-10-11 verdicts on the open bug reports.
//
// Run on the preview server, by the deploy user, inside the repo checkout (it reads that server's .env, so
// it never needs an admin token and nobody connects to preview from outside). It calls the same service
// function bugs.updateTriage calls (triageBugReportWithAudit), so the validation and the admin_audit_log
// row are identical; actor kind 'script'. No SQL.
//
// Usage:
//   npx tsx scripts/triage-verdicts.ts                      # DRY RUN: prints what it would do, writes nothing
//   npx tsx scripts/triage-verdicts.ts --override 3f9a=area-only --override c01b=endms
//   npx tsx scripts/triage-verdicts.ts --apply [--override ...] [--default-priority annoying]
//
// --override <idprefix>=<group> forces a report into a group (use it for the "needs a decision" list after
// the mapping is confirmed). Groups: budget, identical-clips, stutter, audio, dashboard, inbox,
// failed-label, wrong-status-after-approval, quality-line, endms, area-only.
// --default-priority sets a priority only on reports that have none (a bug must have one).
// Reports that are not 'open' are not touched. A report's current triage note is REPLACED by the verdict note
// (that is what bugs.updateTriage does); the dry run prints the current note so nothing is lost by surprise.

import { prisma } from '../src/models/prisma-client';
import {
  BUG_REPORT_PRIORITIES,
  listBugReportsFiltered,
  triageBugReportWithAudit,
  type BugReportPriority,
} from '../src/models/repositories/bug-report.repository';
import { VERDICTS, classifyReport, type VerdictGroupKey } from '../src/models/bug-triage-verdicts';

function flagValues(args: string[], flag: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => {
    if (a === flag && args[i + 1]) out.push(args[i + 1]);
  });
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');

  const overrides: Record<string, VerdictGroupKey> = {};
  for (const o of flagValues(args, '--override')) {
    const [prefix, group] = o.split('=');
    if (!prefix || !(group in VERDICTS)) throw new Error(`bad --override "${o}" (groups: ${Object.keys(VERDICTS).join(', ')})`);
    overrides[prefix] = group as VerdictGroupKey;
  }
  const defaultPriority = flagValues(args, '--default-priority')[0] as BugReportPriority | undefined;
  if (defaultPriority && !BUG_REPORT_PRIORITIES.includes(defaultPriority)) {
    throw new Error(`--default-priority must be one of ${BUG_REPORT_PRIORITIES.join(', ')}`);
  }

  // Oldest first; "#" is only the position in this list (the reports carry no number of their own).
  const reports = (await listBugReportsFiltered({ status: 'open' })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${reports.length} open report(s)\n`);

  const undecided: string[] = [];
  let planned = 0;
  let missingPriority = 0;

  reports.forEach((report, index) => {
    const label = `#${index + 1} ${report.id.slice(0, 8)} [${report.reportType}]`;
    const head = `${label}  ${report.description.replace(/\s+/g, ' ').slice(0, 110)}`;
    const c = classifyReport(report, overrides);
    if (c.kind === 'needs-decision') {
      console.log(`${head}\n    -> NEEDS A DECISION (${c.reason}${c.candidates.length ? `: ${c.candidates.join(' / ')}` : ''}); unchanged\n`);
      undecided.push(head);
      return;
    }
    planned += 1;
    const v = VERDICTS[c.group];
    const priorityFix = !report.priority && defaultPriority ? defaultPriority : undefined;
    if (!report.priority) missingPriority += 1;
    console.log(head);
    console.log(
      `    -> group ${c.group} (${c.via}); status ${report.status} -> ${v.status ?? report.status}; area ${report.area ?? '-'} -> ${v.area ?? report.area ?? '-'}; priority ${report.priority ?? '-'}${priorityFix ? ` -> ${priorityFix}` : ''}`,
    );
    console.log(`       note: "${v.note}"${report.triageNote ? `   (replaces: "${report.triageNote}")` : ''}\n`);
  });

  console.log(`Would change ${planned}; ${undecided.length} need a decision (left unchanged).`);
  if (missingPriority > 0 && !defaultPriority) console.log(`${missingPriority} planned report(s) have no priority; pass --default-priority to set one.`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply once the mapping is confirmed.');
    return;
  }

  let done = 0;
  for (const report of reports) {
    const c = classifyReport(report, overrides);
    if (c.kind !== 'group') continue;
    const v = VERDICTS[c.group];
    const updated = await triageBugReportWithAudit({ kind: 'script', userId: null }, report.id, {
      ...(v.status && { status: v.status }),
      ...(v.area && { area: v.area }),
      ...(!report.priority && defaultPriority && { priority: defaultPriority }),
      note: v.note,
    });
    if (updated) done += 1;
  }
  console.log(`\nApplied to ${done} report(s). Audit rows written (actor: script).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
