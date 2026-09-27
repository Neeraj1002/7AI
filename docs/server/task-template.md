7AI Server Debug Task Template

For code agents debugging the 7AI preview server. Read this in full before touching anything. It gives you the server's shape, what you may and may not do, and how to report back. The founder fills in the Task section at the bottom for each issue.

This doc contains no secrets. If you need a secret value to proceed, stop and ask the founder — never go looking for it.

1. Server context
   Item Value
   Environment Preview
   Host Hostinger VPS (Linux)
   Public URL https://7aistudio.tech (and www.)
   Deploy user deploy — run app commands as this user (su - deploy)
   Repo checkout /var/www/7AI
   App directory /var/www/7AI/studio
   Runtime Node.js, NODE_ENV=production
   Process manager PM2, process name sevenai (owned by deploy)
   API port 1995 (localhost, behind Nginx)
   Reverse proxy Nginx on 80/443, proxies to 127.0.0.1:1995
   TLS Let's Encrypt via Certbot, cert at /etc/letsencrypt/live/7aistudio.tech/
   Database PostgreSQL, localhost:5432, DB sevenai_preview, user sevenai
   ORM Prisma (npm run prisma:migrate:deploy, npm run prisma:generate)
   Media tools /usr/bin/ffmpeg, /usr/bin/ffprobe (via FFMPEG_PATH / FFPROBE_PATH)
   Runtime storage /var/lib/7ai/{videos,media-tmp,stock-footage-tmp} — outside the repo
   Repo assets /var/www/7AI/studio/data/audio-beds/ (checked in)
   YouTube OAuth redirect https://7aistudio.tech/oauth2callback

Request path: Browser → DNS → Nginx (TLS) → 127.0.0.1:1995 (PM2 sevenai) → Postgres / FFmpeg / /var/lib/7ai.

Deploy path: PR → merge to main → GitHub Actions → SSH → /var/www/7AI/deploy.sh → pm2 restart sevenai. Full detail: 7AI/docs/server/deployment/preview/detail.md.

2. Rules (hard — no exceptions)
   Diagnose read-only first. Logs, status, config reads. No state change until you can state the root cause and the founder approves the fix.
   Never print secrets. Don't cat the env file or echo DATABASE*URL/tokens. To check a key exists, print key names only, e.g. grep -o '^[A-Z*]\*=' <envfile>. Redact any secret that appears in log output before reporting.
   Never delete deploy or runtime data. No git clean, no rm -rf /var/www/7AI, nothing destructive under /var/lib/7ai/.
   Never reset the database. No prisma migrate reset, db push --force-reset, DROP, TRUNCATE, or ad-hoc DELETE/UPDATE without explicit founder approval.
   No code edits on the server. Code fixes go through the normal repo flow: branch → PR → founder merges → auto-deploy. Follow 7AI/docs/execution/templates/TASK_TEMPLATE.md Git rules (never push to main).
   Config changes need approval. Nginx, PM2, systemd, Certbot, firewall — propose the exact diff first. For Nginx, always sudo nginx -t before reload.
   Restarts are allowed only when stated in the task or approved. Prefer pm2 restart sevenai / systemctl reload nginx over anything heavier. Never reboot the VPS.
   Record what you ran. Every command that changed state goes in the report.
3. Standard diagnostic sequence

Work top-down; stop when you find the fault.

# Check Command Healthy result

1 Public reachability curl -I https://7aistudio.tech 200/3xx
2 DNS dig +short 7aistudio.tech VPS IP
3 Nginx up + config valid sudo systemctl status nginx · sudo nginx -t active · syntax ok
4 App process pm2 status (as deploy) sevenai online, restart count stable
5 App answers directly curl -I http://127.0.0.1:1995 responds
6 Port binding sudo ss -lntp | grep 1995 Node listening
7 App logs pm2 logs sevenai --lines 200 --nostream no stack traces
8 Nginx logs sudo tail -n 100 /var/log/nginx/error.log no upstream errors
9 Database pg_isready -h localhost -p 5432 · npx prisma migrate status accepting · up to date
10 Resources df -h · free -h · du -sh /var/lib/7ai/\* disk & memory headroom
11 Media tools ffmpeg -version · pgrep -a ffmpeg installed · no stuck renders
12 TLS sudo certbot certificates valid, not near expiry
13 Deployed version git -C /var/www/7AI log -1 --oneline · git -C /var/www/7AI status expected commit · clean tree

Symptom → first place to look

Symptom Likely layer Start at
502 Bad Gateway App down / not on 1995 #4, #5, #7
504 Gateway Timeout Slow request (render, DB) or Nginx proxy timeout #7, #8, #11
SSL / cert warning Certbot / Nginx TLS #12
Site unreachable, no Nginx logs DNS / firewall #2
Crash loop (restarts climbing) App startup error, missing env, bad migration #7, #9
Deploy "succeeded" but old behaviour Build/restart didn't happen, or PM2 cwd wrong #13, pm2 describe sevenai
Video generation fails FFmpeg, disk, temp dirs, permissions #10, #11, ls -ld /var/lib/7ai/\*
YouTube connect fails (redirect_uri_mismatch) OAuth redirect URI vs Google Console env key YOUTUBE_REDIRECT_URI
DB errors (P1001, connection refused) Postgres down / wrong DATABASE_URL #9
Migration error on deploy Failed / out-of-order migration npx prisma migrate status 4. Task (founder fills this in)
markdown

# Server Task [ID]: [Short title]

**Read `7AI/docs/server/task-template.md` in full before starting.**

**Symptom**: [What's broken, as observed — URL, error text, screenshot ref]
**Since**: [When it started / last known good — e.g. after PR #__ merged]
**Impact**: [Down entirely | Feature broken | Degraded | Cosmetic]
**Access given**: [SSH as deploy | Founder runs commands and pastes output | Logs only]
**Allowed actions**: [Read-only | May restart sevenai | May reload nginx | Other: __]
**Out of scope**: [Anything the agent must not touch this time]

## Evidence so far

[Pasted logs / command output — secrets redacted] 5. Report template

Save as 7AI/docs/server/reports/task[ID].md (only when the founder asks for the report to be written).

markdown

# Server Task [ID]: [Short title] — Report

**Date**: YYYY-MM-DD
**Status**: Resolved | Root cause found — fix pending approval | Blocked
**Layer**: DNS | Nginx | TLS | App/PM2 | Database | FFmpeg/Storage | CI/Deploy

## Root cause

[One paragraph. What failed and why.]

## Evidence

[Key log lines / command output that prove it — secrets redacted]

## Commands run

- Read-only: [list]
- State-changing: [list, with approval reference]

## Fix

- Applied: [what, where]
- Proposed (needs approval): [exact diff / command]
- Code change needed: [yes/no — if yes, branch + PR link]

## Verification

[Commands re-run after the fix and their results]

## Prevention

[What would stop this recurring — monitoring, config, doc update] 6. Related docs
Preview deployment detail: 7AI/docs/server/deployment/preview/detail.md
Command reference: 7AI/docs/server/usefulcmds.md
Git / branch rules: 7AI/docs/execution/templates/TASK_TEMPLATE.md
Known issues: 7AI/docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md
