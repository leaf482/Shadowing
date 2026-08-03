# Deployment Guide (Ubuntu + Caddy + PM2)

## Prerequisites

- Ubuntu 20.04 or later
- A domain pointed at the server IP (e.g. `shadowingnetwork.com`)
- SSH access to the server

---

## 1. Install Node.js (v20 LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should print v20.x.x (GitHub Actions also tests Node 22.x)
```

---

## 2. Install PM2

```bash
sudo npm install -g pm2
```

---

## 3. Install Caddy (handles HTTPS automatically)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

---

## 4. Upload the project

From your local machine:

```bash
# Option A: git clone on the server
git clone https://github.com/YOUR_USERNAME/Shadowing.git /home/ubuntu/shadowing

# Option B: rsync from local
rsync -avz --exclude node_modules --exclude dist --exclude '*.db' \
  ./ ubuntu@YOUR_SERVER_IP:/home/ubuntu/shadowing/
```

Production sessions use the `__Host-` session cookie when `NODE_ENV=production` (HTTPS + `Secure`). Legacy `shadowing_session` values are still accepted until the next refresh or login, then cleared.

**Git authentication (recommended):** Do not embed a GitHub username or personal access token in the `origin` URL (`https://user:token@github.com/...` exposes credentials in `.git/config` and logs). Prefer SSH (`git@github.com:USER/Shadowing.git`) with a deploy key or your existing key. If outbound SSH on port 22 is blocked (common on some networks), use GitHub’s SSH on port 443 by adding `~/.ssh/config`:

```
Host github.com
  Hostname ssh.github.com
  Port 443
  User git
```

---

## 5. Install dependencies and build

```bash
cd /home/ubuntu/shadowing
npm install
npm run build
```

This creates the `dist/` folder that the server will serve statically.

---

## 6. Configure environment

```bash
cp .env.example .env
nano .env
```

Minimum `.env` for production:

```
PORT=3000
NODE_ENV=production
```

Optional auth/email settings:

```
# Sender used for verification emails
FROM_EMAIL=Shadow Network <noreply@shadowingnetwork.com>

# Resend API key for verification email delivery
RESEND_API_KEY=your_resend_api_key

# Optional clinic lock period override (defaults to 14, clamped to 14-21)
COOLDOWN_DAYS=14

# Optional auth/session tuning
SESSION_TTL_MS=604800000
SESSION_REFRESH_THRESHOLD_MS=86400000
LOGIN_RATE_WINDOW_MS=600000
LOGIN_MAX_ATTEMPTS_PER_IP=10
LOGIN_MAX_ATTEMPTS_PER_ACCOUNT=10
VERIFICATION_TTL_MS=600000
VERIFICATION_RESEND_COOLDOWN_MS=60000
VERIFICATION_MAX_ATTEMPTS=5
VERIFICATION_LOCK_MS=600000
PASSWORD_RESET_TTL_MS=600000
PASSWORD_RESET_RESEND_COOLDOWN_MS=60000
PASSWORD_RESET_MAX_ATTEMPTS=5
PASSWORD_RESET_LOCK_MS=600000

# Set to false to disable auth event logs
AUTH_LOGGING_ENABLED=true
```

Notes:

- `NODE_ENV=production` enables the `Secure` flag on the session cookie.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and expire in 7 days.
- If `RESEND_API_KEY` is not set, verification codes are still generated server-side but email delivery is skipped.
- Each request is assigned an `X-Request-Id` (or reuses proxy-provided one) to correlate auth logs across systems.
- With `NODE_ENV=production`, the app sends **Content-Security-Policy** tuned for this SPA (maps tiles + Nominatim). Set `CSP_REPORT_ONLY=true` to log violations without enforcing, or `CSP_DISABLED=true` to turn CSP off.

---

## Operations: where the API runs

- **Production:** CloudFront + S3 (SPA) + Lambda HTTP API (`infra/sam/template.yaml`, Node.js 24.x, `lambda-handler.mjs`). Domain traffic must **not** terminate on EC2.
- **EC2 (optional tooling):** start only for SSH / AWS CLI / deploy helpers, then stop. Do **not** enable Caddy auto-HTTPS for `shadowingnetwork.com` on this host (DNS is CloudFront; cert renewals fail). Local Node on the VM can still bind loopback for debugging.
- **Static CDN:** `npm run deploy:static` uploads `dist/`; CSP from Express/Lambda does **not** apply to HTML served only from S3 unless you add equivalent headers in CloudFront.

**Ubuntu note:** switching from distro Node 18 to NodeSource 20+ may **remove many `node-*` apt packages**. Reinstall anything you still need (`npm install -g …` or apt).

**CI:** Pushes and PRs run GitHub Actions (`npm audit`, production build, auth smoke tests).

---

## 7. Start the Node server with PM2

```bash
cd /home/ubuntu/shadowing
pm2 start npm --name shadowing -- start
pm2 save               # persist across reboots
pm2 startup            # follow the printed command to enable on boot
```

Check it's running:

```bash
pm2 status
pm2 logs shadowing
```

---

## 8. Configure Caddy (HTTPS + reverse proxy)

Edit `/etc/caddy/Caddyfile`:

```
sudo nano /etc/caddy/Caddyfile
```

Replace the entire contents with:

```
shadowingnetwork.com {
    reverse_proxy localhost:3000
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

Caddy will automatically obtain and renew a Let's Encrypt certificate for your domain.

---

## 9. Verify

Open `https://shadowingnetwork.com` in a browser.  
The full app (frontend + API) should be live over HTTPS.

---

## Useful commands

| Task | Command |
|------|---------|
| View logs | `pm2 logs shadowing` |
| Restart server | `pm2 restart shadowing` |
| Stop server | `pm2 stop shadowing` |
| Deploy new version | `git pull && npm install && npm run build && pm2 restart shadowing` |
| Check Caddy status | `sudo systemctl status caddy` |
| Check Caddy logs | `sudo journalctl -u caddy -f` |

---

## Updating the app after changes

```bash
cd /home/ubuntu/shadowing
git pull
npm install          # only needed if package.json changed
npm run build        # rebuild frontend
pm2 restart shadowing
```
