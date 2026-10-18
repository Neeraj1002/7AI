# Deployment

`.github/workflows/deploy.yml` runs CI, then SSHes to the server and runs `/var/www/7AI/deploy.sh`, then verifies the deployed revision and `/health`.

`deploy.sh` here is a **reference copy**. The server runs its own file; keep them in sync by hand (back up first: `cp /var/www/7AI/deploy.sh /var/www/7AI/deploy.sh.bak`).

What it does: single-run lock; closes the nginx maintenance gate (if installed); waits up to `DRAIN_WAIT_SEC` (600) for no running runs / publishing stages (exit 75 and no change otherwise; `FORCE=1` skips); pulls, installs, migrates, builds, restarts; health-checks; on failure rolls the code back unless migrations were applied (then the gate stays closed). The gate reopens on success.

## Maintenance gate (nginx)

New requests get 503 while `/var/lib/7ai/publishing-maintenance` exists; requests already forwarded finish. Install once, as root, in each `7aistudio.tech` `server { ... }` block of `/etc/nginx/sites-enabled/7ai`, before the first `location`:

```nginx
if (-f /var/lib/7ai/publishing-maintenance) { return 503; }
```

Then `nginx -t && systemctl reload nginx`. The `deploy` user must be able to create files in `/var/lib/7ai` (for example `chgrp deploy /var/lib/7ai && chmod g+w /var/lib/7ai`; check existing permissions first, the backups under it are private). If the directory is not writable, `deploy.sh` skips the gate. Direct callers to the app port bypass nginx and are not gated.

Recovery rules and the full cutover procedure for the publishing receipt are in `docs/execution/sprint5/runbooks/task2-rollout.md`.
