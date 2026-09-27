usefulcmds.md

7AI Server — Useful Commands
Quick reference for debugging the preview VPS. Format: command → what it does. Most app commands (PM2, git, npm) should run as the deploy user — run su - deploy first.

Server
Command What it does
su - deploy Switch to the deployment user. PM2 processes belong to this user — pm2 status as root shows an empty list.
whoami Show which user you're currently logged in as.
lsb_release -a Show OS name and version.
nproc Number of CPU cores.
free -h RAM and swap usage (human-readable). Check when the app crashes during video renders.
df -h Disk space per mount. Check first when renders or uploads fail.
du -sh /var/lib/7ai/\* Size of each runtime folder (videos, temp). Shows what's eating disk.
uptime Load average and how long since the last reboot.
top / htop Live CPU/memory per process — spot a stuck FFmpeg or runaway Node.
Application / Git
Command What it does
cd /var/www/7AI Go to repo root.
cd /var/www/7AI/studio Go to the Studio app.
git status Check for uncommitted or unexpected changes on the server (should be clean).
git log -1 --oneline Show the commit currently deployed.
git pull --ff-only Pull latest main; refuses instead of merging if the server has diverged.
Deployment
Command What it does
/var/www/7AI/deploy.sh Run a deployment manually (fallback when GitHub Actions fails).
chmod +x /var/www/7AI/deploy.sh Make the deploy script executable again if it errors with "Permission denied".
Node / npm
Command What it does
node -v Installed Node version.
npm -v Installed npm version.
npm ci Clean install of dependencies exactly from package-lock.json.
npm run build Build the app. Run manually to see build errors a failed deploy hid.
npm run prisma:generate Regenerate the Prisma client (needed after schema changes).
Prisma / Database
Command What it does
npm run prisma:migrate:deploy Apply pending migrations (run from /var/www/7AI/studio). Safe — never resets data.
npx prisma migrate status Show which migrations are applied / pending / failed.
psql -h localhost -U sevenai -d sevenai_preview Connect to the preview DB; prompts for password (keeps it out of shell history).
\dt (inside psql) List tables.
\q (inside psql) Exit PostgreSQL.
sudo systemctl status postgresql Is PostgreSQL running?
pg_isready -h localhost -p 5432 Quick check that Postgres accepts connections.
PM2
Command What it does
pm2 status List processes with status, restarts, CPU, memory. A climbing restart count = crash loop.
pm2 logs sevenai Stream live app logs (Ctrl+C to exit).
pm2 logs sevenai --lines 200 --nostream Print the last 200 log lines and exit — good for copying into a bug report.
pm2 describe sevenai Full process detail: script path, cwd, env mode, log file paths, uptime.
pm2 restart sevenai Restart the app.
pm2 stop sevenai Stop the app.
pm2 start sevenai Start the app.
pm2 save Save the current process list so it comes back after a reboot.
API / Ports
Command What it does
curl -I http://127.0.0.1:1995 Hit the API directly, bypassing Nginx. Works here + 502 on the domain = Nginx problem.
sudo ss -lntp | grep 1995 What's listening on port 1995 (should be the Node process).
sudo ss -lntp | grep nginx Confirm Nginx is listening on 80/443.
Nginx
Command What it does
sudo nginx -t Test config syntax. Always run before reload/restart.
sudo systemctl reload nginx Apply config changes without dropping connections.
sudo systemctl restart nginx Full restart (use if reload doesn't fix it).
sudo systemctl status nginx Is Nginx running, plus recent errors.
Domain / HTTPS
Command What it does
dig +short 7aistudio.tech Should return the VPS IP.
dig +short www.7aistudio.tech Should return 7aistudio.tech then the VPS IP.
curl -I https://7aistudio.tech End-to-end check through DNS → Nginx → app.
sudo certbot certificates List certificates, domains covered, and expiry dates.
sudo certbot renew --dry-run Test that auto-renewal will work (changes nothing).
FFmpeg
Command What it does
ffmpeg -version Confirm FFmpeg is installed at the expected build.
ffprobe -version Confirm FFprobe is installed.
pgrep -a ffmpeg Any FFmpeg processes running right now (stuck renders).
Logs
Command What it does
pm2 logs sevenai App logs (first place to look for errors).
sudo tail -f /var/log/nginx/error.log Nginx errors live — 502s, upstream timeouts, proxy failures.
sudo tail -f /var/log/nginx/access.log Every incoming request live — confirm traffic reaches the server.
Quick triage: "site is down"
curl -I https://7aistudio.tech — what status?
pm2 status (as deploy) — is sevenai online?
curl -I http://127.0.0.1:1995 — does the app answer directly?
sudo tail -n 50 /var/log/nginx/error.log — proxy errors?
pm2 logs sevenai --lines 200 --nostream — app crash reason?
df -h / free -h — out of disk or memory?
Never run
git clean or rm -rf /var/www/7AI — deploy relies on the checkout staying in place.
rm -rf /var/lib/7ai — deletes generated videos.
npx prisma migrate reset / prisma db push --force-reset — wipes the database.
psql "postgresql://sevenai:<real password>@..." — puts the password in shell history.
