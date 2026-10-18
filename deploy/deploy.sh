#!/bin/bash
# Reference copy of /var/www/7AI/deploy.sh (the server runs its own file; keep both in sync by hand, see deploy/README.md).
# Single-run lock, optional nginx maintenance gate, idle gate (wait for running runs/publishing), health check, code rollback.
set -Eeuo pipefail

APP_DIR=/var/www/7AI
STUDIO=$APP_DIR/studio
PM2_NAME=sevenai
DRAIN_WAIT_SEC=${DRAIN_WAIT_SEC:-600}   # how long to wait for active work before giving up
FORCE=${FORCE:-0}                        # FORCE=1 skips the idle gate (emergencies only)
GATE_FILE=/var/lib/7ai/publishing-maintenance   # nginx returns 503 while this file exists (see deploy/README.md)

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24.21.0

# One deploy at a time, even if started by hand while a workflow run is active.
exec 9>/tmp/7ai-deploy.lock
flock -n 9 || { echo "Another deploy is running"; exit 75; }

cd "$STUDIO"

# Maintenance gate: only used when the directory exists and is writable. Closing it stops NEW
# requests at nginx (the rule must be installed, see deploy/README.md); work already running continues.
GATE_ENABLED=0; KEEP_GATE_CLOSED=0
if [ -d "$(dirname "$GATE_FILE")" ] && [ -w "$(dirname "$GATE_FILE")" ]; then GATE_ENABLED=1; fi
close_gate() { [ "$GATE_ENABLED" = 1 ] && touch "$GATE_FILE" && echo "Maintenance gate closed"; return 0; }
open_gate()  { [ "$GATE_ENABLED" = 1 ] && rm -f "$GATE_FILE" && echo "Maintenance gate reopened"; return 0; }
on_exit() { if [ "$KEEP_GATE_CLOSED" = 0 ]; then open_gate; else echo "Gate left CLOSED on purpose: fix, verify, then rm $GATE_FILE"; fi; }
trap on_exit EXIT

# Prints "<runningRuns> <runningPublishing> <migrationCount>" using the app's own Prisma client.
db_state() {
  node -e '
    require("dotenv").config({ path: ".env", quiet: true });
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    (async () => {
      const r = await p.$queryRawUnsafe("SELECT count(*)::int AS n FROM pipeline_runs WHERE status = $1", "running");
      const u = await p.$queryRawUnsafe("SELECT count(*)::int AS n FROM pipeline_stages WHERE \"stageName\" = $1 AND status = $2", "publishing", "running");
      const m = await p.$queryRawUnsafe("SELECT count(*)::int AS n FROM _prisma_migrations");
      console.log(r[0].n + " " + u[0].n + " " + m[0].n);
    })().catch(e => { console.error("db_state failed:", e.message); process.exit(1); }).finally(() => p.$disconnect());
  ' | tail -n 1
}

health() {
  local port
  port=$(grep -E '^[[:space:]]*API_PORT[[:space:]]*=' "$STUDIO/.env" 2>/dev/null | tail -n 1 | cut -d= -f2 | tr -dc '0-9' || true)
  port=${port:-4000}
  for _ in $(seq 1 20); do
    curl -fs --max-time 5 "http://127.0.0.1:$port/health" >/dev/null && return 0
    sleep 3
  done
  return 1
}

echo "=== Starting 7AI deployment ==="
close_gate

# Idle gate: do not restart over an active render or upload.
if [ "$FORCE" != "1" ]; then
  waited=0
  while true; do
    state=$(db_state) || { echo "Cannot read run state from the database; aborting before any change."; exit 1; }
    read -r running publishing _ <<<"$state"
    if [ "$running" = "0" ] && [ "$publishing" = "0" ]; then break; fi
    if [ "$waited" -ge "$DRAIN_WAIT_SEC" ]; then
      echo "Deploy NOT performed: $running run(s) running, $publishing publishing stage(s) active after ${DRAIN_WAIT_SEC}s. Re-run when idle, or FORCE=1."
      exit 75
    fi
    echo "Waiting for active work to finish: $running run(s), $publishing publishing (waited ${waited}s)"
    sleep 15; waited=$((waited + 15))
  done
fi

cd "$APP_DIR"
PREV_SHA=$(git rev-parse HEAD)
state=$(cd "$STUDIO" && db_state) || { echo "Cannot read migration count; aborting before any change."; exit 1; }
read -r _ _ MIGRATIONS_BEFORE <<<"$state"
echo "Previous revision: $PREV_SHA"

echo "=== Pulling latest code ==="
git pull --ff-only origin main

rollback() {
  KEEP_GATE_CLOSED=1   # stays closed unless the rollback below completes
  echo "!!! Deployment failed; restoring code at $PREV_SHA"
  cd "$APP_DIR" && git reset --hard "$PREV_SHA"
  cd "$STUDIO" && npm ci && npm run prisma:generate && npm run build
  pm2 restart "$PM2_NAME"
  KEEP_GATE_CLOSED=0
  echo "Code rolled back. Database migrations are NOT reverted."
}

# Anything failing from here on triggers a code rollback unless migrations were applied.
build_and_restart() {
  # Explicit `|| return 1`: set -e does not apply inside an `if !` context.
  cd "$STUDIO" || return 1
  echo "=== Installing dependencies ==="; npm ci || return 1
  echo "=== Generating Prisma client ==="; npm run prisma:generate || return 1
  echo "=== Applying database migrations ==="; npm run prisma:migrate:deploy || return 1
  echo "=== Building application ==="; npm run build || return 1
  echo "=== Restarting application ==="; pm2 restart "$PM2_NAME" || return 1
  echo "=== Health check ==="; health || return 1
}

if ! (build_and_restart); then
  state=$(cd "$STUDIO" && db_state || echo "0 0 -1")
  read -r _ _ MIGRATIONS_AFTER <<<"$state"
  if [ "$MIGRATIONS_AFTER" = "$MIGRATIONS_BEFORE" ]; then
    rollback
  else
    KEEP_GATE_CLOSED=1
    echo "!!! Failed after migrations were applied ($MIGRATIONS_BEFORE -> $MIGRATIONS_AFTER); NOT rolling back automatically. Fix forward or restore the backup."
  fi
  exit 1
fi

open_gate
echo "=== Deployment completed ($(git -C "$APP_DIR" rev-parse --short HEAD)) ==="
