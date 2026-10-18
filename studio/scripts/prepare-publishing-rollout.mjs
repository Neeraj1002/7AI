// Operator-only preparation. Does not import application startup or call providers.
// Run from the existing studio checkout as root; source may be supplied on stdin.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const studio = '/var/www/7AI/studio';
const report = { kind: 'pr92-rollout-preparation-v1', checkedAt: new Date().toISOString(), errors: [] };
let prisma;
function command(file, args, label, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024, windowsHide: true, ...options });
  if (result.status !== 0 || result.error) throw new Error(label);
  return result.stdout ?? '';
}
function stage(label, fn) {
  return Promise.resolve().then(fn).catch(() => { report.errors.push(label); return null; });
}
function decrypt(encoded, key) {
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length < 28) throw new Error('CIPHERTEXT_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
}
async function snapshot() {
  const counts = await prisma.$queryRawUnsafe(`SELECT status, count(*)::int AS count
    FROM pipeline_runs GROUP BY status ORDER BY status`);
  const publishing = await prisma.$queryRawUnsafe(`SELECT s.id AS "stageId", s."pipelineRunId" AS "runId",
    s."attemptNumber", s.status AS "stageStatus", r.status AS "runStatus", s."startedAt",
    (NULLIF(s.output->>'youtubeVideoId','') IS NOT NULL) AS "knownIdPresent"
    FROM pipeline_stages s JOIN pipeline_runs r ON r.id=s."pipelineRunId"
    WHERE s."stageName"='publishing' AND s.status='running' ORDER BY s."startedAt" LIMIT 201`);
  const running = await prisma.$queryRawUnsafe(`SELECT id AS "runId", "currentStage" FROM pipeline_runs
    WHERE status='running' ORDER BY id LIMIT 201`);
  const legacy = await prisma.$queryRawUnsafe(`SELECT s."pipelineRunId" AS "runId",
    count(DISTINCT NULLIF(s.output->>'youtubeVideoId',''))::int AS "distinctKnownIds",
    bool_or(s.status<>'pending' AND NULLIF(s.output->>'youtubeVideoId','') IS NULL
      AND (s.output->>'uploadNotStarted') IS DISTINCT FROM 'true') AS "unresolvedAttemptPresent"
    FROM pipeline_stages s WHERE s."stageName"='publishing' GROUP BY s."pipelineRunId" ORDER BY s."pipelineRunId" LIMIT 201`);
  return { at: new Date().toISOString(), counts, possibleActivePublishing: publishing.slice(0, 200),
    runningRuns: running.slice(0, 200), legacyPublishing: legacy.slice(0, 200),
    truncated: [publishing, running, legacy].some(rows => rows.length > 200) };
}
async function main() {
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || process.cwd() !== studio)
    throw new Error('RUN_AS_ROOT_FROM_EXISTING_STUDIO');
  process.umask(0o077);
  const require = createRequire(path.join(studio, 'package.json'));
  const dotenv = require('dotenv');
  const fileEnv = dotenv.parse(fs.readFileSync(path.join(studio, '.env')));
  const passwd = command('getent', ['passwd', 'deploy'], 'DEPLOY_ACCOUNT_UNAVAILABLE').trim().split(':');
  const deployHome = passwd[5];
  if (!deployHome?.startsWith('/')) throw new Error('DEPLOY_HOME_UNAVAILABLE');
  // Do not invoke PM2 if it would start a new daemon instead of inspecting one.
  const daemonPid = Number(fs.readFileSync(path.join(deployHome, '.pm2/pm2.pid'), 'utf8').trim());
  if (!Number.isSafeInteger(daemonPid) || daemonPid <= 1) throw new Error('PM2_DAEMON_UNAVAILABLE');
  process.kill(daemonPid, 0); // Existence check only; no signal is sent.
  // A noninteractive login need not load the deploy user's nvm/PATH setup.
  // Invoke an existing PM2 CLI with an explicit Node binary and PM2 home;
  // never source profiles or start a daemon to make the inspection work.
  const daemonNode = fs.readlinkSync(`/proc/${daemonPid}/exe`);
  const pm2Cli = [path.join(path.dirname(daemonNode), 'pm2'), path.join(path.dirname(process.execPath), 'pm2'),
    '/usr/bin/pm2', '/usr/local/bin/pm2'].find(candidate => fs.existsSync(candidate));
  if (!pm2Cli) throw new Error('EXISTING_PM2_CLI_UNAVAILABLE');
  const processes = JSON.parse(command('runuser', ['-u', 'deploy', '--', process.execPath, pm2Cli, 'jlist'],
    'PM2_INSPECTION_FAILED', { env: { ...process.env, PM2_HOME: path.join(deployHome, '.pm2') } }));
  const app = processes.filter(p => p.name === 'sevenai');
  report.workers = { pm2: app.map(p => ({ name: p.name, pid: p.pid, status: p.pm2_env?.status,
    mode: p.pm2_env?.exec_mode, instances: p.pm2_env?.instances, cwd: p.pm2_env?.pm_cwd,
    script: p.pm2_env?.pm_exec_path })), singleFork: app.length === 1 && app[0].pm2_env?.exec_mode === 'fork_mode',
    otherAppPids: [] };
  for (const pid of fs.readdirSync('/proc').filter(s => /^\d+$/.test(s))) {
    if (Number(pid) === process.pid || app.some(p => p.pid === Number(pid))) continue;
    try {
      const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
      const args = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if ((cwd === studio || args.includes('/var/www/7AI/')) && /(?:dist\/index\.js|src\/index\.ts)/.test(args))
        report.workers.otherAppPids.push(Number(pid));
    } catch { /* A process can finish during inventory. */ }
  }
  const runtimeEnv = app.length === 1 ? app[0].pm2_env : {};
  const effective = name => typeof runtimeEnv?.[name] === 'string' ? runtimeEnv[name]
    : typeof runtimeEnv?.env?.[name] === 'string' ? runtimeEnv.env[name] : fileEnv[name];
  const db = new URL(effective('DATABASE_URL'));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(db.hostname) || db.pathname !== '/sevenai_preview')
    throw new Error('EXPECTED_LOCAL_PREVIEW_DATABASE_REQUIRED');
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient({ datasources: { db: { url: db.toString() } }, log: [] });
  report.database = { name: 'sevenai_preview', local: true,
    serverVersion: (await prisma.$queryRawUnsafe('SHOW server_version'))[0].server_version,
    migrations: await prisma.$queryRawUnsafe(`SELECT migration_name AS name, finished_at IS NOT NULL AS finished,
      rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations ORDER BY started_at`),
    receiptColumn: (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema='public' AND table_name='pipeline_runs' AND column_name='publishingRecovery'`))[0].n === 1 };
  report.before = await snapshot();
  await stage('EXISTING_ENCRYPTION_KEY_VERIFICATION_FAILED', async () => {
    const key = Buffer.from(effective('CREDENTIAL_ENCRYPTION_KEY') ?? '', 'base64');
    report.encryption = { existingKeyPresent: key.length > 0, valid32Bytes: key.length === 32,
      fileMatchesEffective: fileEnv.CREDENTIAL_ENCRYPTION_KEY === effective('CREDENTIAL_ENCRYPTION_KEY'),
      selfCheck: false, credentialRowsChecked: 0, existingCredentialsDecrypt: false };
    if (key.length !== 32 || !report.encryption.fileMatchesEffective) throw new Error('KEY_UNAVAILABLE_OR_MISMATCH');
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const sample = Buffer.from('pr92-local-encryption-check');
    const encrypted = Buffer.concat([cipher.update(sample), cipher.final()]);
    report.encryption.selfCheck = decrypt(Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64'), key).equals(sample);
    const rows = await prisma.agentCredential.findMany({ select: { refreshTokenEncrypted: true, encryptionKeyVersion: true } });
    for (const row of rows) {
      if (row.encryptionKeyVersion !== 1 || !decrypt(row.refreshTokenEncrypted, key).length) throw new Error('EXISTING_CREDENTIAL_UNREADABLE');
    }
    report.encryption.credentialRowsChecked = rows.length;
    report.encryption.existingCredentialsDecrypt = true;
  });
  await stage('DATABASE_BACKUP_OR_RESTORE_VERIFICATION_FAILED', async () => {
    const stamp = new Date().toISOString().replace(/[-:.]/g, '').toLowerCase();
    const directory = `/var/lib/7ai/backups/pr92-${stamp}-${process.pid}`;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const archive = path.join(directory, 'sevenai_preview.dump');
    report.backup = { directory, archive, restoreVerified: false, step: 'dump' };
    const pgEnv = { ...process.env, PGHOST: db.hostname === '[::1]' ? '::1' : db.hostname,
      PGPORT: db.port || '5432', PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password),
      PGDATABASE: 'sevenai_preview', PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'pr92-backup-check',
      PGOPTIONS: '-c lock_timeout=5000' };
    report.backup.pgDumpVersion = command('pg_dump', ['--version'], 'PG_DUMP_UNAVAILABLE').trim();
    command('pg_dump', ['--format=custom', '--no-password', '--lock-wait-timeout=5s', '--file', archive],
      'BACKUP_FAILED', { env: pgEnv, timeout: 30 * 60_000 });
    fs.chmodSync(archive, 0o600);
    const bytes = fs.statSync(archive).size;
    report.backup.step = 'archive-list-and-checksum';
    const toc = command('pg_restore', ['--list', archive], 'ARCHIVE_READ_FAILED');
    if (bytes === 0 || !['pipeline_runs', 'pipeline_stages', '_prisma_migrations', 'agent_credentials'].every(t => toc.includes(t)))
      throw new Error('ARCHIVE_INCOMPLETE');
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
    const sha256 = hash.digest('hex');
    fs.writeFileSync(path.join(directory, 'SHA256SUMS'), `${sha256}  sevenai_preview.dump\n`, { mode: 0o600, flag: 'wx' });
    Object.assign(report.backup, { bytes, sha256, tocVerified: true, directoryMode: (fs.statSync(directory).mode & 0o777).toString(8),
      archiveMode: (fs.statSync(archive).mode & 0o777).toString(8) });
    const verificationDb = `sevenai_pr92_verify_${stamp}_${process.pid}_test`;
    if (!/^sevenai_pr92_verify_[0-9t]+z_\d+_test$/.test(verificationDb) || verificationDb === 'sevenai_preview')
      throw new Error('VERIFICATION_DATABASE_GUARD');
    const adminEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('PG')));
    adminEnv.PGHOST = '/var/run/postgresql';
    adminEnv.PGUSER = 'postgres';
    adminEnv.PGCONNECT_TIMEOUT = '10';
    const admin = (args, label, options = {}) => command('runuser', ['-u', 'postgres', '--', ...args], label,
      { env: adminEnv, ...options });
    report.backup.step = 'create-isolated-verification-database';
    admin(['createdb', '--template=template0', '--maintenance-db=postgres', verificationDb], 'SCRATCH_DATABASE_CREATE_FAILED');
    report.backup.retainedVerificationDatabase = verificationDb;
    report.backup.step = 'restore-only-into-verification-database';
    const fd = fs.openSync(archive, 'r');
    try {
      admin(['pg_restore', '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction', '--dbname', verificationDb],
        'SCRATCH_RESTORE_FAILED', { stdio: [fd, 'pipe', 'pipe'], timeout: 30 * 60_000 });
    } finally { fs.closeSync(fd); }
    const countsSql = `SELECT json_build_object('runs',(SELECT count(*) FROM pipeline_runs),
      'stages',(SELECT count(*) FROM pipeline_stages),'credentials',(SELECT count(*) FROM agent_credentials),
      'migrations',(SELECT count(*) FROM _prisma_migrations))`;
    report.backup.restoredCounts = JSON.parse(admin(['psql', '-XAt', '--set=ON_ERROR_STOP=1', '--dbname', verificationDb,
      '--command', countsSql], 'SCRATCH_READBACK_FAILED').trim());
    report.backup.restoreVerified = true;
    report.backup.step = 'verified';
    // Retain the isolated verification DB and archive. Do not drop any database.
    fs.writeFileSync(path.join(directory, 'RESTORE_VERIFIED.json'), JSON.stringify(report.backup, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  });
  await stage('DEPLOYMENT_INVENTORY_FAILED', async () => {
    const text = fs.readFileSync('/var/www/7AI/deploy.sh', 'utf8');
    const patterns = [['git-fast-forward', /git\s+pull[^\n]*--ff-only/], ['dependencies', /npm\s+ci/],
      ['generate-client', /prisma:generate|prisma\s+generate/], ['migrate', /prisma:migrate:deploy|prisma\s+migrate\s+deploy/],
      ['build', /npm\s+run\s+build/], ['pm2-restart', /pm2\s+restart/], ['pm2-reload', /pm2\s+reload/],
      ['pm2-stop', /pm2\s+stop/], ['drain-or-maintenance-reference', /drain|maintenance/]];
    report.deployment = { scriptSha256: createHash('sha256').update(text).digest('hex'),
      operations: text.split('\n').flatMap((line, i) => line.trim().startsWith('#') ? []
        : patterns.filter(([, re]) => re.test(line)).map(([operation]) => ({ line: i + 1, operation }))) };
    report.deployment.cron = ['root', 'deploy'].map(user => {
      const cron = spawnSync('crontab', ['-l', '-u', user], { encoding: 'utf8', timeout: 10_000 });
      return { user, available: [0, 1].includes(cron.status), appRelatedLines: (cron.stdout ?? '').split('\n')
        .filter(l => !l.trim().startsWith('#') && /7ai|sevenai|deploy\.sh|pm2/i.test(l)).length };
    });
    const units = command('systemctl', ['list-units', '--all', '--type=service,timer', '--plain', '--no-legend'], 'SERVICE_INVENTORY_FAILED');
    report.deployment.appRelatedUnits = units.split('\n').map(l => l.trim().split(/\s+/)[0]).filter(name => /7ai|sevenai|pm2/i.test(name));
    // Configuration is inspected, never printed in full or changed/reloaded.
    const nginx = spawnSync('nginx', ['-T'], { encoding: 'utf8', timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
    report.deployment.nginxConfigValid = nginx.status === 0;
    report.deployment.vhosts = (nginx.stdout ?? '').split('# configuration file ').slice(1)
      .filter(section => /server_name[^;]*7aistudio\.tech/.test(section)).map(section => ({
        file: section.slice(0, section.indexOf(':\n')), maintenanceReturn503Observed: /return\s+503\s*;/.test(section),
        upstream1995Observed: /proxy_pass\s+http:\/\/(?:127\.0\.0\.1|localhost):1995/.test(section) }));
  });
  report.after = await snapshot();
  report.preparationChecksPassed = report.errors.length === 0 && report.backup?.restoreVerified === true
    && report.encryption?.valid32Bytes === true && report.encryption?.selfCheck === true;
  report.workerHandoff = 'NOT_EXECUTED: gate new requests, allow existing work to finish, prove old workers idle and stopped before new code starts; a plain PM2 restart is not a drain';
}
main().catch(error => { report.errors.push(/^[A-Z_]+$/.test(error?.message ?? '')
  ? error.message : 'PREPARATION_STOPPED_SEE_COMPLETED_SECTIONS'); })
  .finally(async () => {
    if (prisma) await prisma.$disconnect().catch(() => {});
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.preparationChecksPassed) process.exitCode = 2;
  });
