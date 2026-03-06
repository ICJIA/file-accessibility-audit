# 04 — Deployment Guide

**Project:** `file-accessibility-audit`
**Target:** DigitalOcean droplet → Laravel Forge → PM2 → nginx reverse proxy

---

## 1. Infrastructure Specification

### Recommended DigitalOcean Droplet

| Spec | Recommendation | Notes |
|------|---------------|-------|
| **Plan** | Basic — Regular Intel | |
| **Size** | 2 vCPU / 4GB RAM / 80GB SSD | `$24/mo` — headroom for QPDF subprocess + pdfjs |
| **Minimum** | 1 vCPU / 2GB RAM / 50GB SSD | `$12/mo` — adequate for low traffic, tight on memory |
| **OS** | Ubuntu 24.04 LTS | Forge-supported, LTS through 2029 |
| **Region** | Chicago (ORD1) | Closest to ICJIA |

### Why 4GB?

QPDF runs as a subprocess and can spike memory on complex PDFs. pdfjs-dist loads the full PDF into memory for parsing. With Node.js overhead and Nuxt SSR, 2GB is genuinely tight. 4GB gives comfortable headroom and allows future batch processing.

### Software Stack on Droplet (Forge-managed)

- **nginx** — Forge installs and manages; you configure a proxy rule
- **Node.js 22 LTS** — Forge installs (project requires 22+, see `.nvmrc`)
- **PM2** — Forge installs; you provide `ecosystem.config.cjs`
- **QPDF** — `sudo apt install qpdf` (one command post-provision)
- **pnpm** — `npm install -g pnpm` (one command post-provision)

---

## 2. Post-Provision Setup

After Forge creates the server, SSH in and run:

```bash
sudo apt update && sudo apt install -y qpdf
npm install -g pnpm

# Create data directory for SQLite
mkdir -p /home/forge/file-accessibility-audit/apps/api/data
```

That's it. Everything else is handled by Forge and PM2.

---

## 3. PM2 Configuration

```javascript
// ecosystem.config.cjs (root of monorepo)
module.exports = {
  apps: [
    {
      name: 'file-audit-api',
      cwd: './apps/api',
      script: 'pnpm',
      args: 'start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 5103
      },
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100
    },
    {
      name: 'file-audit-web',
      cwd: './apps/web',
      script: 'pnpm',
      args: 'start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 5102,
        NUXT_API_BASE: 'http://localhost:5103'
      },
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100
    }
  ]
}
```

### Ports

| Service | Port |
|---------|------|
| Nuxt frontend | 5102 |
| Express API | 5103 |
| nginx (public) | 80 / 443 |

---

## 4. nginx / Laravel Forge Configuration

In Forge, create a new site and use a custom nginx config. The key block:

```nginx
# In Forge: Edit Nginx Configuration for the site

# Hide nginx version
server_tokens off;

# Security headers
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

location / {
    proxy_pass http://127.0.0.1:5102;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

location /api/ {
    proxy_pass http://127.0.0.1:5103;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 110M;
    proxy_read_timeout 60s;
}
```

Forge handles SSL (Let's Encrypt) automatically. You just point your DNS at the droplet.

---

## 5. Deployment Workflow

### First Deploy

```bash
# On the droplet (after Forge provisions it)
sudo apt update && sudo apt install -y qpdf
npm install -g pnpm

# Clone repo
git clone <repo-url> /home/forge/file-accessibility-audit
cd /home/forge/file-accessibility-audit

# Install dependencies
pnpm install

# Build
pnpm --filter web build
pnpm --filter api build

# Copy production .env files
cp apps/api/.env.example.production apps/api/.env
cp apps/web/.env.example.production apps/web/.env
# (edit .env files with real credentials)

# Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
```

### Subsequent Deploys

```bash
cd /home/forge/file-accessibility-audit
git pull
pnpm install
pnpm --filter web build
pnpm --filter api build
pm2 restart all
```

Or use Forge's deployment scripts to automate this on git push.

### Forge Deploy Script (paste into Forge UI)

```bash
cd /home/forge/file-accessibility-audit
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter api build
pnpm --filter web build
pm2 restart ecosystem.config.cjs --update-env
```

---

## 6. Environment Variables

This section is the canonical reference for all environment variables. The master design document (00) references this section.

### `apps/api/.env`

```env
NODE_ENV=production
PORT=5103
JWT_SECRET=<random-256-bit-hex>
# Generate with: openssl rand -hex 32
SMTP_USER=<your-smtp-login>
SMTP_PASS=<your-smtp-password>
ADMIN_EMAILS=chris@icjia.illinois.gov
```

> **Email provider** (Mailgun or SMTP2GO) is selected in `audit.config.ts` → `EMAIL.PROVIDER`. Host and port are resolved automatically per provider. Only credentials go in `.env`. See the README Email Setup section and [docs/07-mailgun-integration.md](07-mailgun-integration.md) for details.

### `apps/web/.env`

```env
NUXT_PUBLIC_APP_NAME=File Accessibility Audit
```

> URLs switch automatically based on `NODE_ENV` — no URL configuration needed in `.env`.

### Important: `.env` files must be in `.gitignore`

```gitignore
# In project root .gitignore
apps/api/.env
apps/web/.env
```

On the droplet, `.env` files should be `chmod 600` and owned by the `forge` user. Secrets (JWT_SECRET, SMTP_PASS) must never be committed to the repository. Use `.env.example.production` as a template.

---

## 7. Firewall

This section is the canonical reference for firewall configuration. The master design document (00) references this section.

Configure the DigitalOcean firewall (or `ufw` on the droplet) to allow only:

| Port | Protocol | Source |
|------|----------|--------|
| 22 | TCP | Your IP / ICJIA network |
| 80 | TCP | Anywhere |
| 443 | TCP | Anywhere |

Block all other inbound ports. The Express API (5103) and Nuxt server (5102) listen on localhost and are proxied through nginx — they must not be directly accessible from the internet.

```bash
# If using ufw instead of DO firewall:
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 8. SSL & DNS

1. Point your domain's DNS A record to the droplet's IP address
2. In Forge, add the site with the domain name
3. Click "SSL" → "Let's Encrypt" → Forge provisions and auto-renews the certificate

---

## 9. Monitoring & Maintenance

### PM2 Commands

```bash
pm2 status                    # Check process status
pm2 logs                      # Tail all logs
pm2 logs file-audit-api      # Tail API logs only
pm2 monit                     # Real-time resource monitoring
pm2 restart all               # Restart both processes
```

### Log Rotation

PM2 logs grow indefinitely. Install `pm2-logrotate`:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### QPDF Temp File Cleanup

The app cleans up temp files in its `finally` block, but as a safety net, add a cron job:

```bash
# Crontab: delete QPDF temp files older than 1 hour
0 * * * * find /tmp -name '*.pdf' -mmin +60 -delete
```

### SQLite Backup

The audit log database at `apps/api/data/audit.db` should be backed up periodically:

```bash
# Crontab: daily backup
0 2 * * * cp /home/forge/file-accessibility-audit/apps/api/data/audit.db /home/forge/backups/audit-$(date +\%Y\%m\%d).db
```

Note: In Phase 2, the database also contains the `shared_reports` table for shareable report URLs. The same backup strategy covers both tables.

---

*End of Deployment Guide — v1.5*
