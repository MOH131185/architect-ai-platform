# RunPod + Vercel Deployment Checklist

Complete checklist for deploying the genarch pipeline on RunPod with Vercel frontend.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER                                   │
│  (React app served from Vercel CDN)                              │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              │ POST /api/genarch/jobs
                              │ (no API key from browser)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                       VERCEL                                      │
│  api/genarch/jobs/index.js                                       │
│  api/genarch/jobs/[jobId].js                                     │
│  api/genarch/runs/[...params].js                                 │
│                                                                   │
│  Adds: Authorization: Bearer $GENARCH_API_KEY                    │
│  Forwards to: $RUNPOD_GENARCH_URL                                │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              │ HTTPS + API Key
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      RUNPOD GPU POD                               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Caddy/Nginx (port 443)                                     │ │
│  │  TLS termination + reverse proxy                            │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                             │                                     │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Node.js server.cjs (port 3001)                             │ │
│  │  Express + genarchAuth middleware                           │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                             │                                     │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Python genarch (subprocess)                                │ │
│  │  + Blender (optional)                                       │ │
│  │  + ComfyUI (127.0.0.1:8188, NOT exposed)                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  /mnt/persistent/runs/  (persistent volume)                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: RunPod Setup

### 1.1 Create Pod

- [ ] Go to [RunPod Console](https://www.runpod.io/console/pods)
- [ ] Click "Deploy" → "Secure Cloud" (recommended) or "Community Cloud"
- [ ] Select template: **RunPod Pytorch 2.1** or **Ubuntu 22.04 CUDA**
- [ ] Select GPU: RTX 4090, A6000, or A100 (24GB+ VRAM recommended)
- [ ] Set volume: `/mnt/persistent` with 50GB+ storage
- [ ] Enable ports: **22 (SSH)** only (we'll add HTTPS via Caddy)
- [ ] Deploy pod

### 1.2 SSH into Pod

```bash
# Get SSH command from RunPod dashboard
ssh root@xxx.runpod.io -p 22xxx

# Or use RunPod web terminal
```

### 1.3 Install Dependencies

```bash
# Update system
apt-get update && apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Python 3.11 (if not present)
apt-get install -y python3.11 python3.11-venv python3-pip

# Install Blender (optional, for Phase 2)
apt-get install -y blender

# Install Caddy (reverse proxy)
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
```

### 1.4 Clone Repository

```bash
cd /opt
git clone https://github.com/your-org/architect-ai-platform.git genarch
cd genarch
```

### 1.5 Install Node.js Dependencies

```bash
npm ci --only=production
```

### 1.6 Setup Python Environment

```bash
python3.11 -m venv /opt/genarch/venv
source /opt/genarch/venv/bin/activate
pip install --upgrade pip
pip install -e ./genarch[phase4]
deactivate
```

### 1.7 Create Directories

```bash
mkdir -p /mnt/persistent/runs
mkdir -p /opt/genarch/logs
ln -sf /mnt/persistent/runs /opt/genarch/runs
```

---

## Phase 2: Configuration

### 2.1 Generate API Key

```bash
# Generate a random 32-byte hex key
openssl rand -hex 32
# Example output: a1b2c3d4e5f6...

# Save this key - you'll need it for both RunPod and Vercel
```

### 2.2 Create Environment File

```bash
cat > /opt/genarch/.env << 'EOF'
# Node.js
NODE_ENV=production
PORT=3001

# AI Services
TOGETHER_API_KEY=tgp_v1_your_key_here
OPENAI_REASONING_API_KEY=sk-your_key_here

# Genarch Auth
GENARCH_API_KEY=YOUR_GENERATED_KEY_HERE
API_KEY_AUTH_ENABLED=true

# CORS - Replace with your Vercel domain
ALLOWED_ORIGINS=https://www.archiaisolution.pro,https://archiaisolution.pro

# Genarch Pipeline
GENARCH_PYTHON_PATH=/opt/genarch/venv/bin/python
GENARCH_RUNS_DIR=/opt/genarch/runs
BLENDER_PATH=/usr/bin/blender
GENARCH_MAX_JOB_AGE_HOURS=24

# ComfyUI (Phase 3, if installed)
# COMFYUI_URL=http://127.0.0.1:8188
EOF

chmod 600 /opt/genarch/.env
```

### 2.3 Configure Caddy (HTTPS)

```bash
# Get your RunPod pod's public hostname
# It's usually: xxx-3001.proxy.runpod.net (but we're using Caddy on 443)

# Option A: Use RunPod's built-in proxy (simpler)
# Enable port 443 in RunPod dashboard
# Caddy will get automatic HTTPS via RunPod

# Option B: Use custom domain (recommended for production)
# Point your domain's DNS to RunPod's IP
# Example: genarch.yourdomain.com → RunPod IP

cat > /etc/caddy/Caddyfile << 'EOF'
# Replace with your domain or RunPod hostname
genarch.yourdomain.com {
    reverse_proxy localhost:3001

    # Rate limiting
    rate_limit {
        zone genarch_api {
            key {remote_host}
            events 100
            window 1m
        }
    }
}
EOF

# Reload Caddy
systemctl reload caddy
```

### 2.4 Create Systemd Service

```bash
cat > /etc/systemd/system/genarch.service << 'EOF'
[Unit]
Description=Genarch Pipeline API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/genarch
EnvironmentFile=/opt/genarch/.env
ExecStart=/usr/bin/node /opt/genarch/server.cjs
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable genarch
systemctl start genarch
```

---

## Phase 3: Vercel Configuration

### 3.1 Add Environment Variables

In [Vercel Dashboard](https://vercel.com) → Your Project → Settings → Environment Variables:

| Variable             | Value                            | Environment         |
| -------------------- | -------------------------------- | ------------------- |
| `RUNPOD_GENARCH_URL` | `https://genarch.yourdomain.com` | Production, Preview |
| `GENARCH_API_KEY`    | `YOUR_GENERATED_KEY_HERE`        | Production, Preview |

**Important:** These are server-side variables. Do NOT add `REACT_APP_` prefix.

### 3.2 Deploy to Vercel

```bash
# Push your changes (includes new Vercel proxy files)
git add .
git commit -m "feat: add Vercel proxy for genarch"
git push origin main

# Vercel will auto-deploy
```

### 3.3 Verify Deployment

```bash
# Check Vercel deployment logs
# In Vercel Dashboard → Deployments → Latest → Functions

# Test the proxy
curl -X POST https://your-vercel-app.vercel.app/api/genarch/jobs \
  -H "Content-Type: application/json" \
  -d '{"prompt": "modern villa 200sqm"}'
```

---

## Phase 4: Smoke Test

### 4.1 Test from RunPod (Direct)

```bash
# SSH into RunPod
ssh root@xxx.runpod.io -p 22xxx

# Test direct API (with API key)
curl -X POST http://localhost:3001/api/genarch/jobs \
  -H "Authorization: Bearer YOUR_GENARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "modern villa 200sqm", "skipPhase2": true, "skipPhase3": true}'

# Should return: {"success": true, "job": {"id": "genarch_xxx", ...}}
```

### 4.2 Test from Vercel (via Proxy)

```bash
# Test via Vercel proxy (no API key needed)
curl -X POST https://your-vercel-app.vercel.app/api/genarch/jobs \
  -H "Content-Type: application/json" \
  -d '{"prompt": "modern villa 200sqm"}'

# Should return: {"success": true, "job": {"id": "genarch_xxx", ...}}
```

### 4.3 Poll Job Status

```bash
JOB_ID="genarch_xxx"  # From previous response

# Poll until complete
curl https://your-vercel-app.vercel.app/api/genarch/jobs/$JOB_ID

# Expected: {"success": true, "job": {"status": "completed", ...}}
```

### 4.4 Download Artifact

```bash
# Download A1 PDF
curl -o A1_sheet.pdf \
  https://your-vercel-app.vercel.app/api/genarch/runs/$JOB_ID/phase4/A1_sheet.pdf

# Verify
file A1_sheet.pdf
# Should show: PDF document
```

### 4.5 Test from Browser

1. Open your Vercel app in browser
2. Navigate to generate step
3. Enable genarch mode (if feature flagged)
4. Start generation
5. Verify PDF downloads

---

## Troubleshooting

### "RUNPOD_NOT_CONFIGURED" error

- Check Vercel environment variables
- Ensure `RUNPOD_GENARCH_URL` is set in Vercel dashboard
- Redeploy after adding env vars

### "401 Unauthorized" from RunPod

- Check `GENARCH_API_KEY` matches in both Vercel and RunPod
- Verify RunPod server is running: `systemctl status genarch`
- Check RunPod logs: `journalctl -u genarch -f`

### "503 Service Unavailable"

- RunPod server may be down
- Check Caddy status: `systemctl status caddy`
- Check Node.js status: `systemctl status genarch`
- Verify port 3001 is listening: `netstat -tlnp | grep 3001`

### CORS errors

- Add your Vercel domain to `ALLOWED_ORIGINS` in RunPod `.env`
- Restart genarch: `systemctl restart genarch`

### Job stuck in "running"

- Check Python subprocess: `ps aux | grep python`
- Check genarch logs: `journalctl -u genarch -f`
- Verify Python venv: `/opt/genarch/venv/bin/python --version`

---

## Security Checklist

- [ ] `GENARCH_API_KEY` is random 32+ bytes
- [ ] API key is NOT in browser/frontend code
- [ ] `ALLOWED_ORIGINS` is restricted to your domains
- [ ] ComfyUI is bound to `127.0.0.1:8188` (not public)
- [ ] Only ports 22 and 443 are exposed on RunPod
- [ ] Caddy has rate limiting enabled
- [ ] RunPod volume is persistent (data survives restarts)

---

## Maintenance

### Update Code

```bash
cd /opt/genarch
git pull origin main
npm ci --only=production
systemctl restart genarch
```

### View Logs

```bash
# Node.js server
journalctl -u genarch -f

# Caddy
journalctl -u caddy -f
```

### Clean Old Jobs

```bash
# Jobs older than 24h are auto-cleaned
# Manual cleanup:
find /opt/genarch/runs -type d -mtime +7 -exec rm -rf {} +
```
