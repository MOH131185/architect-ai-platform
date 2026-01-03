#!/bin/bash
# ArchitectAI Genarch Pipeline - RunPod Setup Script
#
# This script sets up the genarch pipeline on a RunPod GPU instance.
# Run as root or with sudo on a fresh RunPod pod.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/your-org/architect-ai-platform/main/deploy/runpod/setup.sh | bash
#   # Or clone and run locally:
#   git clone https://github.com/your-org/architect-ai-platform.git
#   cd architect-ai-platform
#   chmod +x deploy/runpod/setup.sh
#   sudo ./deploy/runpod/setup.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
APP_DIR="/opt/genarch"
APP_USER="genarch"
NODE_VERSION="20"
PYTHON_VERSION="3.11"

log_info "Starting ArchitectAI Genarch Pipeline setup..."

# Create app user
if ! id -u "$APP_USER" >/dev/null 2>&1; then
    log_info "Creating user: $APP_USER"
    useradd -r -m -s /bin/bash "$APP_USER"
fi

# Install system dependencies
log_info "Installing system dependencies..."
apt-get update
apt-get install -y \
    curl \
    gnupg \
    python${PYTHON_VERSION} \
    python${PYTHON_VERSION}-venv \
    python3-pip \
    blender \
    nginx \
    certbot \
    python3-certbot-nginx \
    git \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0

# Install Node.js
if ! command -v node &> /dev/null; then
    log_info "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
else
    log_info "Node.js already installed: $(node -v)"
fi

# Create app directory
log_info "Setting up app directory: $APP_DIR"
mkdir -p "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# Clone or update repository
if [ -d "$APP_DIR/.git" ]; then
    log_info "Updating existing repository..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git pull
else
    log_info "Cloning repository..."
    cd /opt
    rm -rf genarch
    sudo -u "$APP_USER" git clone https://github.com/your-org/architect-ai-platform.git genarch
fi

cd "$APP_DIR"

# Install Node.js dependencies
log_info "Installing Node.js dependencies..."
sudo -u "$APP_USER" npm ci --only=production

# Set up Python virtual environment
log_info "Setting up Python virtual environment..."
sudo -u "$APP_USER" python${PYTHON_VERSION} -m venv "$APP_DIR/venv"
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install -e ./genarch[phase4]

# Create required directories
log_info "Creating required directories..."
mkdir -p "$APP_DIR/runs" "$APP_DIR/qa_results" "$APP_DIR/logs"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/runs" "$APP_DIR/qa_results" "$APP_DIR/logs"

# Copy .env.example to .env if not exists
if [ ! -f "$APP_DIR/.env" ]; then
    log_warn "Creating .env from template. Please edit with your API keys!"
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
fi

# Install systemd service
log_info "Installing systemd service..."
cp "$APP_DIR/deploy/systemd/genarch.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable genarch

# Install nginx config
log_info "Installing nginx configuration..."
cp "$APP_DIR/deploy/nginx/nginx.conf" /etc/nginx/sites-available/genarch
ln -sf /etc/nginx/sites-available/genarch /etc/nginx/sites-enabled/

# Test nginx config
if nginx -t; then
    log_info "Nginx configuration valid"
else
    log_error "Nginx configuration invalid! Please fix before continuing."
    exit 1
fi

# Generate API key if not set
if ! grep -q "GENARCH_API_KEY=" "$APP_DIR/.env" || grep -q "GENARCH_API_KEY=your_" "$APP_DIR/.env"; then
    GENERATED_KEY=$(openssl rand -hex 32)
    log_info "Generating GENARCH_API_KEY..."
    sed -i "s/GENARCH_API_KEY=.*/GENARCH_API_KEY=$GENERATED_KEY/" "$APP_DIR/.env"
    sed -i "s/REACT_APP_GENARCH_API_KEY=.*/REACT_APP_GENARCH_API_KEY=$GENERATED_KEY/" "$APP_DIR/.env"
    log_warn "Generated API key (save this!): $GENERATED_KEY"
fi

# Print next steps
echo ""
echo "=========================================="
log_info "Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Edit environment file:"
echo "   sudo nano $APP_DIR/.env"
echo ""
echo "2. Add your API keys:"
echo "   - TOGETHER_API_KEY"
echo "   - GENARCH_API_KEY (auto-generated if needed)"
echo "   - ALLOWED_ORIGINS (add your frontend domain)"
echo ""
echo "3. Update nginx config with your domain:"
echo "   sudo nano /etc/nginx/sites-available/genarch"
echo ""
echo "4. Get SSL certificate (after DNS is configured):"
echo "   sudo certbot --nginx -d api.archiaisolution.pro"
echo ""
echo "5. Start services:"
echo "   sudo systemctl start genarch"
echo "   sudo systemctl reload nginx"
echo ""
echo "6. Check status:"
echo "   sudo systemctl status genarch"
echo "   curl http://localhost:3001/api/health"
echo ""
echo "7. View logs:"
echo "   sudo journalctl -u genarch -f"
echo ""
