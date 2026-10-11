# 7AI Server — Useful Commands

Quick reference for debugging the preview VPS. Format: **command → what it does**.
Two sections are not about the VPS: the budget-ceiling reset (under Prisma / Database) and **Phone build and OTA** (your Windows machine, the repo's `app/` folder). Both were added 2026-10-10 after avoidable mix-ups.
Most app commands (PM2, git, npm) should run as the `deploy` user — run `su - deploy` first.

---

## Server

| Command | What it does |
|---|---|
| `su - deploy` | Switch to the deployment user. PM2 processes belong to this user — `pm2 status` as root shows an empty list. |
| `whoami` | Show which user you're currently logged in as. |
| `lsb_release -a` | Show OS name and version. |
| `nproc` | Number of CPU cores. |
| `free -h` | RAM and swap usage (human-readable). Check when the app crashes during video renders. |
| `df -h` | Disk space per mount. Check first when renders or uploads fail. |
| `du -sh /var/lib/7ai/*` | Size of each runtime folder (videos, temp). Shows what's eating disk. |
| `uptime` | Load average and how long since the last reboot. |
| `top` / `htop` | Live CPU/memory per process — spot a stuck FFmpeg or runaway Node. |

## Application / Git

| Command | What it does |
|---|---|
| `cd /var/www/7AI` | Go to repo root. |
| `cd /var/www/7AI/studio` | Go to the Studio app. |
| `git status` | Check for uncommitted or unexpected changes on the server (should be clean). |
| `git log -1 --oneline` | Show the commit currently deployed. |
| `git pull --ff-only` | Pull latest `main`; refuses instead of merging if the server has diverged. |

## Deployment

| Command | What it does |
|---|---|
| `/var/www/7AI/deploy.sh` | Run a deployment manually (fallback when GitHub Actions fails). |
| `chmod +x /var/www/7AI/deploy.sh` | Make the deploy script executable again if it errors with "Permission denied". |

## Node / npm

| Command | What it does |
|---|---|
| `node -v` | Installed Node version. |
| `npm -v` | Installed npm version. |
| `npm ci` | Clean install of dependencies exactly from `package-lock.json`. |
| `npm run build` | Build the app. Run manually to see build errors a failed deploy hid. |
| `npm run prisma:generate` | Regenerate the Prisma client (needed after schema changes). |

## Prisma / Database

| Command | What it does |
|---|---|
| `npm run prisma:migrate:deploy` | Apply pending migrations (run from `/var/www/7AI/studio`). Safe — never resets data. |
| `npx prisma migrate status` | Show which migrations are applied / pending / failed. |
| `psql -h localhost -U sevenai -d sevenai_preview` | Connect to the preview DB; prompts for password (keeps it out of shell history). |
| `\dt` | (inside psql) List tables. |
| `\q` | (inside psql) Exit PostgreSQL. |
| `\r` | (inside psql) Clear a half-typed statement. Use it when the prompt shows `->` instead of `=>`, which means the previous statement was never finished. End every statement with `;`. |
| `\x on` / `\x off` | (inside psql) Show wide results one field per line, then switch back. |
| `select "budgetCeilingUsd" from agent_quotas where "tenantId" = 'd0617c67-b7bd-47b1-9501-d316d2d66a15';` | Read the founder tenant's weekly budget ceiling. It must be 40. |
| `update agent_quotas set "budgetCeilingUsd" = 40 where "tenantId" = 'd0617c67-b7bd-47b1-9501-d316d2d66a15';` | Restore the ceiling to 40. **Run it straight after any ceiling test** (a test sets it to 0.01). A leftover 0.01 refuses every run with "Account spend limit reached: ... of $0.01 this week", which looks like a bug in whatever stage it hits (it was mistaken for a script failure on 2026-10-08 and for a video failure on 2026-10-10). |
| `sudo systemctl status postgresql` | Is PostgreSQL running? |
| `pg_isready -h localhost -p 5432` | Quick check that Postgres accepts connections. |

## PM2

| Command | What it does |
|---|---|
| `pm2 status` | List processes with status, restarts, CPU, memory. A climbing restart count = crash loop. |
| `pm2 logs sevenai` | Stream live app logs (Ctrl+C to exit). |
| `pm2 logs sevenai --lines 200 --nostream` | Print the last 200 log lines and exit — good for copying into a bug report. |
| `pm2 describe sevenai` | Full process detail: script path, cwd, env mode, log file paths, uptime. |
| `pm2 restart sevenai` | Restart the app. |
| `pm2 stop sevenai` | Stop the app. |
| `pm2 start sevenai` | Start the app. |
| `pm2 save` | Save the current process list so it comes back after a reboot. |

### Restart loop recovery (added 2026-10-11, after the Gate 2 Revise/Retry incident)

Use when `pm2 status` shows a climbing restart count (`↺`), the phone shows "Can't reach the server", or the phone gets the same push over and over. **Do not run `pm2 restart` to "fix" a stuck run**: a restart makes resume re-run whatever the run was parked on, which is how a loop starts.

1. `pm2 stop sevenai` first. Nothing else works until the loop is stopped, and it stops the pushes.
2. `pm2 logs sevenai --err --lines 60 --nostream`. If it only repeats the boot warning, the process is exiting without logging an error: also read the out log (`pm2 logs sevenai --out --lines 100 --nostream`), `pm2 describe sevenai | grep -E "restarts|unstable|exit code|status"` and `free -m`.
3. Find the run being resumed (`[resume] run <id> ...` in the logs), then look at its stages: `select "stageName", "attemptNumber", status, "startedAt", "completedAt", left(error, 80) from pipeline_stages where "pipelineRunId" = '<run id>' order by "startedAt" desc limit 8;` (the column is `"pipelineRunId"`, not `"runId"`).
4. Close the poisoned stage and the run so resume has nothing to pick up:
   ```sql
   begin;
   update pipeline_stages set status='failed', error='Closed manually: <reason>' where "pipelineRunId"='<run id>' and "stageName"='<stage>' and "attemptNumber"=<n>;
   update pipeline_runs set status='failed', "lastError"='Cancelled by user' where id='<run id>';
   commit;
   ```
   Expect `UPDATE 1` twice; on `UPDATE 0`, stop and read the rows again.
5. `pm2 start sevenai`, then `pm2 status` after 30 seconds: the restart count must not move. Open the app and check the Inbox for leftover cards for the closed run.

### Push receipts (added 2026-10-11)

Expo's push receipts show whether a push was really delivered. For the tenant user, look for `DeveloperError` ("malformed or contained invalid parameters"); Gate 2 pushes arrive and Gate 1 pushes do not (Bugs Task 12 R6). Run the SQL that Task 12's report gives for the notifications table and paste the rows.

### Production settings the preview server needs (added 2026-10-11)

`/var/www/7AI/studio/.env` must contain `PUBLIC_API_BASE_URL=https://7aistudio.tech`; without it the server logs `[boot] PUBLIC_API_BASE_URL not set` on every start and magic-link text points at localhost. After editing, `pm2 restart sevenai --update-env` (look at the Queue first: a restart resumes any run that was mid-flight).

## API / Ports

| Command | What it does |
|---|---|
| `curl -I http://127.0.0.1:1995` | Hit the API directly, bypassing Nginx. Works here + 502 on the domain = Nginx problem. |
| `sudo ss -lntp \| grep 1995` | What's listening on port 1995 (should be the Node process). |
| `sudo ss -lntp \| grep nginx` | Confirm Nginx is listening on 80/443. |

## Nginx

| Command | What it does |
|---|---|
| `sudo nginx -t` | Test config syntax. Always run before reload/restart. |
| `sudo systemctl reload nginx` | Apply config changes without dropping connections. |
| `sudo systemctl restart nginx` | Full restart (use if reload doesn't fix it). |
| `sudo systemctl status nginx` | Is Nginx running, plus recent errors. |

## Domain / HTTPS

| Command | What it does |
|---|---|
| `dig +short 7aistudio.tech` | Should return the VPS IP. |
| `dig +short www.7aistudio.tech` | Should return `7aistudio.tech` then the VPS IP. |
| `curl -I https://7aistudio.tech` | End-to-end check through DNS → Nginx → app. |
| `sudo certbot certificates` | List certificates, domains covered, and expiry dates. |
| `sudo certbot renew --dry-run` | Test that auto-renewal will work (changes nothing). |

## FFmpeg

| Command | What it does |
|---|---|
| `ffmpeg -version` | Confirm FFmpeg is installed at the expected build. |
| `ffprobe -version` | Confirm FFprobe is installed. |
| `pgrep -a ffmpeg` | Any FFmpeg processes running right now (stuck renders). |

## Logs

| Command | What it does |
|---|---|
| `pm2 logs sevenai` | App logs (first place to look for errors). |
| `sudo tail -f /var/log/nginx/error.log` | Nginx errors live — 502s, upstream timeouts, proxy failures. |
| `sudo tail -f /var/log/nginx/access.log` | Every incoming request live — confirm traffic reaches the server. |

---

## Phone build and OTA (run on your Windows machine in the repo's `app/` folder, not on the VPS)

Why this section exists: on 2026-10 the APK was built with a modified, uncommitted `app/package-lock.json`, while the OTA update was published from the committed lockfile. The two had different runtime fingerprints, so the update never reached the phone. These habits prevent a repeat.

| Command | What it does |
|---|---|
| `git status` | Run it in `app/` before every `eas build` and every `eas update`. It must show nothing modified. |
| `git add package-lock.json`, then commit on a branch and open a PR | After any `npm install` that changes the lockfile, commit it before building. Never push it to `main` directly. A lockfile changed on disk but not committed is what broke the OTA. |
| `npm ci` | Installs exactly what the committed lockfile says. Use it in other worktrees, and after switching branches when `node_modules` may not match the lockfile. |
| `npm i` | Can change the lockfile. Run it only when you mean to, and commit the lockfile afterwards. |
| `npx expo-updates fingerprint:generate --platform android` | Prints this checkout's runtime fingerprint. Before `eas update --branch preview`, compare it with the runtime shown on the installed APK's build page. If they differ, the update will not reach that APK. |
| `eas build -p android --profile preview` | Builds a new APK. Needed only for native changes (a new native dependency, a permission or an `app.json` plugin). Run it from a clean tree. |
| `eas update --branch preview --message "..."` | Publishes a JS-only update to the installed preview build. |

To apply an OTA update: open the app, fully close it (swipe it away), then reopen it. The app downloads the update at launch and applies it on the next cold start.

---

## Quick triage: "site is down"

1. `curl -I https://7aistudio.tech` — what status?
2. `pm2 status` (as `deploy`) — is `sevenai` online?
3. `curl -I http://127.0.0.1:1995` — does the app answer directly?
4. `sudo tail -n 50 /var/log/nginx/error.log` — proxy errors?
5. `pm2 logs sevenai --lines 200 --nostream` — app crash reason?
6. `df -h` / `free -h` — out of disk or memory?

---

## Never run

- `git clean` or `rm -rf /var/www/7AI` — deploy relies on the checkout staying in place.
- `rm -rf /var/lib/7ai` — deletes generated videos.
- `npx prisma migrate reset` / `prisma db push --force-reset` — wipes the database.
- `psql "postgresql://sevenai:<real password>@..."` — puts the password in shell history.
- `eas build` or `eas update` while `git status` in `app/` shows changes — a modified lockfile caused the 2026-10 OTA mismatch.
- A ceiling test without the restore command above straight after it.
