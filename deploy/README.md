# ArchitectAI Genarch Pipeline - Deployment Guide

This guide covers deploying the genarch floor plan generation pipeline to a persistent backend server. The genarch pipeline cannot run on Vercel serverless functions because it requires:

- **Python runtime** for genarch floor plan generation
- **Blender** for 3D rendering (Phase 2)
- **ComfyUI** for AI image generation (Phase 3)
- **Persistent filesystem** for runs and artifacts

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  GPU VM (RunPod / Lambda Labs / Vast.ai)        │
│                                                 │
│  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Node.js     │  │ Python genarch          │  │
│  │ server.cjs  │──│ + Blender + ComfyUI     │  │
│  │ (port 3001) │  │ (subprocess/venv)       │  │
│  └─────────────┘  └─────────────────────────┘  │
│         │                    │                  │
│         └────────────────────┘                  │
│              /runs/ (local disk)                │
└─────────────────────────────────────────────────┘
           │
    HTTPS (nginx/caddy)
           │
    ┌──────┴──────┐
    │   Vercel    │
    │  (Frontend) │
    └─────────────┘
```

## Quick Start (RunPod)

### 1. Create a RunPod GPU Pod

1. Go to [RunPod Console](https://www.runpod.io/console/pods)
2. Click "Deploy" → "GPU Pod"
3. Select template: **RunPod Pytorch 2.1** (includes CUDA)
4. Choose GPU: **RTX 4090** or **A6000** (24GB VRAM recommended)
5. Disk: At least 50GB for models and runs
6. Enable: **HTTP Port 3001**

### 2. SSH into the Pod

```bash
# Get SSH command from RunPod dashboard
ssh root@xxx.runpod.io -p 22xxx
```

### 3. Run Setup Script

```bash
# Clone and run setup
git clone https://github.com/your-org/architect-ai-platform.git
cd architect-ai-platform
chmod +x deploy/runpod/setup.sh
sudo ./deploy/runpod/setup.sh
```

### 4. Configure Environment

```bash
sudo nano /opt/genarch/.env
```

Required variables:

```env
# AI Services
TOGETHER_API_KEY=tgp_v1_xxx
OPENAI_REASONING_API_KEY=sk-xxx  # Optional

# Authentication
GENARCH_API_KEY=<generated-by-setup>
REACT_APP_GENARCH_API_KEY=<same-as-above>
API_KEY_AUTH_ENABLED=true

# CORS
ALLOWED_ORIGINS=https://www.archiaisolution.pro,https://archiaisolution.pro
```

### 5. Start Services

```bash
sudo systemctl start genarch
sudo systemctl status genarch
```

### 6. Configure Domain & SSL

```bash
# Update nginx with your domain
sudo nano /etc/nginx/sites-available/genarch

# Get SSL certificate
sudo certbot --nginx -d api.archiaisolution.pro

# Reload nginx
sudo systemctl reload nginx
```

### 7. Update Frontend

In your Vercel dashboard, add environment variable:

```
REACT_APP_API_PROXY_URL=https://api.archiaisolution.pro
REACT_APP_GENARCH_API_KEY=<your-genarch-api-key>
```

## API Authentication

All `/api/genarch/*` endpoints require authentication:

```bash
# Using Authorization header (recommended)
curl -X POST https://api.archiaisolution.pro/api/genarch/jobs \
  -H "Authorization: Bearer YOUR_GENARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "modern villa 200sqm"}'

# Using x-api-key header (alternative)
curl -X POST https://api.archiaisolution.pro/api/genarch/jobs \
  -H "x-api-key: YOUR_GENARCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "modern villa 200sqm"}'
```

### Development Mode

In development, if `GENARCH_API_KEY` is not set, endpoints are unprotected:

```bash
# No auth needed in dev mode
curl http://localhost:3001/api/genarch/jobs
```

To force auth in development:

```env
API_KEY_AUTH_ENABLED=true
GENARCH_API_KEY=dev-key-12345
```

## Docker Deployment

For non-RunPod environments or local testing:

### Build Image

```bash
docker build -t archiaisolution/genarch:latest -f deploy/Dockerfile .
```

### Run with Docker Compose

```bash
# Create .env file with your keys
cp .env.example .env
nano .env

# Start services
docker compose -f deploy/docker-compose.yml up -d

# View logs
docker compose -f deploy/docker-compose.yml logs -f genarch
```

### Run with Docker CLI

```bash
docker run -d \
  --name genarch \
  --gpus all \
  -p 3001:3001 \
  -v $(pwd)/runs:/app/runs \
  -e TOGETHER_API_KEY=tgp_v1_xxx \
  -e GENARCH_API_KEY=your-key \
  archiaisolution/genarch:latest
```

## Manual Installation (No Docker)

If you prefer running directly on a Linux server:

### Prerequisites

- Ubuntu 22.04+ or Debian 11+
- Node.js 20+
- Python 3.11+
- Blender 4.0+ (optional, for Phase 2)
- NVIDIA GPU with CUDA (for ComfyUI)

### Steps

```bash
# 1. Clone repository
git clone https://github.com/your-org/architect-ai-platform.git /opt/genarch
cd /opt/genarch

# 2. Install Node.js dependencies
npm ci --only=production

# 3. Create Python virtual environment
python3.11 -m venv venv
source venv/bin/activate
pip install -e ./genarch[phase4]
deactivate

# 4. Configure environment
cp .env.example .env
nano .env

# 5. Install systemd service
sudo cp deploy/systemd/genarch.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable genarch
sudo systemctl start genarch

# 6. Install nginx
sudo apt install nginx
sudo cp deploy/nginx/nginx.conf /etc/nginx/sites-available/genarch
sudo ln -s /etc/nginx/sites-available/genarch /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Security Checklist

- [ ] **GENARCH_API_KEY** set with random 32+ character value
- [ ] **API_KEY_AUTH_ENABLED=true** in production
- [ ] **ALLOWED_ORIGINS** restricted to your domains only
- [ ] **HTTPS enabled** via nginx + Let's Encrypt
- [ ] **ComfyUI bound to 127.0.0.1:8188** (not exposed publicly)
- [ ] **Firewall** allows only ports 80, 443, and SSH
- [ ] **Rate limiting** enabled in nginx
- [ ] **No .env file** in git repository

## Monitoring & Logs

```bash
# Service status
sudo systemctl status genarch

# Live logs
sudo journalctl -u genarch -f

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

## Scaling Considerations

### Single VM (Current Setup)

- Suitable for: Development, small production workloads
- Pros: Simple, low cost, fast iteration
- Cons: Single point of failure, limited concurrency

### Future: Separate Services

When scaling is needed:

1. **Node.js API** → Vercel or separate small VMs (auto-scale)
2. **Python genarch** → GPU serverless (RunPod Serverless, Modal)
3. **Artifacts** → S3/R2 bucket (instead of local disk)
4. **Job queue** → Redis or SQS for async processing

## Troubleshooting

### "401 Unauthorized" errors

- Check `GENARCH_API_KEY` matches in server and client
- Verify `REACT_APP_GENARCH_API_KEY` is set in frontend

### "503 Service unavailable"

- `GENARCH_API_KEY` not configured on server
- Check server logs: `sudo journalctl -u genarch -f`

### Job stuck in "running"

- Python subprocess may have crashed
- Check logs for Python errors
- Verify Blender is installed: `blender --version`

### CORS errors

- Add your domain to `ALLOWED_ORIGINS`
- Restart server: `sudo systemctl restart genarch`

## File Structure

```
deploy/
├── Dockerfile                 # Docker image definition
├── docker-compose.yml         # Local Docker testing
├── nginx/
│   └── nginx.conf            # Nginx reverse proxy config
├── systemd/
│   └── genarch.service       # Systemd service definition
├── runpod/
│   └── setup.sh              # RunPod setup script
└── README.md                 # This file
```
