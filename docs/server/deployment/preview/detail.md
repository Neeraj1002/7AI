# 7AI Preview Environment — Deployment Detail

**Last updated**: 2026-09-28
**Environment**: Preview
**Host**: Hostinger VPS
**Domain**: https://7aistudio.tech

> Secrets are never written in this doc. Anything in `<ANGLE_BRACKETS>` is a placeholder — the real value lives only on the VPS.

---

## 1. Status

7AI preview is deployed on a Hostinger VPS with Node.js, PM2, PostgreSQL, Nginx, HTTPS, and automated GitHub Actions deployment. PR merges to `main` trigger deployment.

---

## 2. Stack at a glance

| Layer | Choice |
|---|---|
| Host | Hostinger VPS |
| Runtime | Node.js (`NODE_ENV=production`) |
| Process manager | PM2 — process name `sevenai` |
| Database | PostgreSQL (local, port `5432`), DB `sevenai_preview` |
| ORM / migrations | Prisma |
| Reverse proxy | Nginx (ports `80` / `443`) |
| TLS | Let's Encrypt via Certbot (auto-renew) |
| Media tooling | FFmpeg / FFprobe (`/usr/bin/`) |
| CI/CD | GitHub Actions → SSH → `deploy.sh` |
| Deploy user | `deploy` |

---

## 3. Request flow

```text
Browser
  │  https://7aistudio.tech  (or www.)
  ▼
DNS  (A @ → VPS public IP, CNAME www → 7aistudio.tech)
  ▼
Nginx  :80 / :443   ← TLS terminated here (Let's Encrypt)
  │  reverse proxy
  ▼
7AI API (PM2: sevenai)  127.0.0.1:1995
  │
  ├── PostgreSQL  localhost:5432 / sevenai_preview
  ├── FFmpeg / FFprobe  /usr/bin/
  └── Runtime storage  /var/lib/7ai/
```

---

## 4. DNS / Domain configuration

| Item | Value |
|---|---|
| Domain | `7aistudio.tech` |
| WWW domain | `www.7aistudio.tech` |
| VPS public IP | `187.127.185.46` |
| Nameservers | `lunar.dns-parking.com`, `solar.dns-parking.com` |

**Records**

| Type | Name | Content | TTL |
|---|---|---|---|
| A | `@` | `187.127.185.46` | 60 |
| CNAME | `www` | `7aistudio.tech` | 300 |

**Verification**

```bash
dig +short 7aistudio.tech
dig +short www.7aistudio.tech
```

Expected:

```text
7aistudio.tech     → 187.127.185.46
www.7aistudio.tech → 7aistudio.tech → 187.127.185.46
```

**Ports**

| Port | Purpose | Exposed publicly? |
|---|---|---|
| 80 | HTTP (Nginx; redirects / ACME challenge) | Yes |
| 443 | HTTPS (Nginx) | Yes |
| 1995 | 7AI API (behind Nginx) | No — should only listen on / be reachable via localhost |
| 5432 | PostgreSQL | No — localhost only |

---

## 5. SSL / HTTPS

| Item | Value |
|---|---|
| Domains covered | `7aistudio.tech`, `www.7aistudio.tech` |
| Issuer | Let's Encrypt |
| Certificate path | `/etc/letsencrypt/live/7aistudio.tech/` |
| Termination | Nginx |
| Renewal | Automatic via Certbot |

---

## 6. Environment configuration

```env
NODE_ENV=production

DATABASE_URL="postgresql://sevenai:<PREVIEW_PASSWORD>@localhost:5432/sevenai_preview"

API_PORT=1995

FFMPEG_PATH="/usr/bin/ffmpeg"
FFPROBE_PATH="/usr/bin/ffprobe"

YOUTUBE_REDIRECT_URI="https://7aistudio.tech/oauth2callback"
```

Only non-secret keys are listed above. Other secret keys (API keys, OAuth client secret, etc.) exist on the VPS and are intentionally not documented here.

**Database URL format**

```text
postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>
```

Preview:

```text
postgresql://sevenai:<PREVIEW_PASSWORD>@localhost:5432/sevenai_preview
```

> `YOUTUBE_REDIRECT_URI` must exactly match an Authorized Redirect URI in the Google Cloud OAuth client. A mismatch produces `redirect_uri_mismatch` on YouTube connect.

---

## 7. Paths on the VPS

| Path | What it is | Owner |
|---|---|---|
| `/var/www/7AI` | Git checkout (repo root) | `deploy` |
| `/var/www/7AI/studio` | Studio app (Node / Prisma) | `deploy` |
| `/var/www/7AI/deploy.sh` | Deployment script (CI + manual fallback) | `deploy` |
| `/var/www/7AI/studio/data/audio-beds/` | Checked-in audio-bed assets (part of the repo) | `deploy` |
| `/var/lib/7ai/videos/` | Generated video output (runtime) | `deploy` |
| `/var/lib/7ai/media-tmp/` | Temporary media processing (runtime) | `deploy` |
| `/var/lib/7ai/stock-footage-tmp/` | Temporary stock-footage downloads (runtime) | `deploy` |
| `/etc/letsencrypt/live/7aistudio.tech/` | TLS certificate | root |
| `/var/log/nginx/` | Nginx access / error logs | root |

**Runtime storage** lives outside the Git repository so deployments never remove generated media.

---

## 8. Database / Prisma

- Engine: PostgreSQL on the same VPS, `localhost:5432`
- Database: `sevenai_preview`, user: `sevenai`
- Migrations are applied with:

```bash
cd /var/www/7AI/studio
npm run prisma:migrate:deploy
```

Runs pending Prisma migrations against the configured database. `migrate deploy` only applies committed migrations — it never generates or resets anything.

---

## 9. Tenants / accounts on preview

Founder decision (2026-09-28): preview's database starts fresh rather than migrating data from the
local/dev DB (the founder's existing YouTube credential was already independently confirmed
expired/revoked at Google's end regardless of environment, so a raw data migration would have bought
little). Two separate tenants, both created via `scripts/invite-tenant.ts` (run over SSH as the
`deploy` user from `/var/www/7AI/studio` — see `docs/server/usefulcmds.md`):

| Owner email | Tenant | Purpose (as stated by the founder) |
|---|---|---|
| `neeraj100296@gmail.com` | Founder's own account | Testing only — no public posts. |
| `7aistudiochannel@gmail.com` | 7AI Studio | The founder's own words: "real testing channel on preview." Also earlier described as the real channel that will have real posts. Recorded here verbatim, not reconciled — a testing/production tension the founder may want to revisit, not something to silently resolve. |

`7AI Studio` is a separate account (its own `Tenant`/`User`), not a channel under the founder's own
tenant — confirmed by the founder explicitly when asked.

Invite command shape (per `scripts/invite-tenant.ts`):

```bash
npx tsx scripts/invite-tenant.ts "<tenant name>" <ownerEmail> ["<owner name>"]
```

---

## 10. Deployment flow

**Normal (automated):**

```text
PR → merge to main → GitHub Actions → SSH to VPS → deploy.sh → PM2 restart
```

**Manual fallback** (as `deploy`):

```bash
/var/www/7AI/deploy.sh
```

If the script loses its executable bit:

```bash
chmod +x /var/www/7AI/deploy.sh
```

**What a deploy does (in order):** pull latest `main` (`git pull --ff-only`) → `npm ci` → `npm run prisma:generate` → `npm run prisma:migrate:deploy` → `npm run build` → `pm2 restart sevenai`.
*(Order as understood from the commands in use — `deploy.sh` itself is the source of truth.)*

---

## 11. Deployment rules (do not break)

1. **Never run `git clean`** in `/var/www/7AI`, and **never delete `/var/www/7AI`** as part of a deploy.
2. **Never delete or move `/var/lib/7ai/`** — it holds generated videos and in-flight temp data.
3. Deploys go through `main` only (PR → merge). No hot-editing code on the server.
4. `git pull --ff-only` only — if it refuses, someone changed files on the server; investigate, don't force.
5. Secrets stay on the VPS. Never commit them, paste them into docs, or print them in logs / chat.

---

## 12. Related docs

- Debug commands: `7AI/docs/server/usefulcmds.md`
- Agent debugging template: `7AI/docs/server/task-template.md`
