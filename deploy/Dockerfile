# ArchitectAI Platform - Genarch Pipeline Docker Image
# For RunPod GPU instances or any Linux environment with GPU support
#
# Build: docker build -t archiaisolution/genarch:latest -f deploy/Dockerfile .
# Run:   docker run -d --gpus all -p 3001:3001 -v ./runs:/app/runs archiaisolution/genarch:latest

FROM nvidia/cuda:12.1-runtime-ubuntu22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Node.js prerequisites
    curl \
    gnupg \
    # Python prerequisites
    python3.11 \
    python3.11-venv \
    python3-pip \
    # Blender dependencies
    blender \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    # Build tools
    build-essential \
    git \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy genarch Python package
COPY genarch/ ./genarch/

# Create Python virtual environment and install genarch
RUN python3.11 -m venv /app/venv \
    && /app/venv/bin/pip install --upgrade pip \
    && /app/venv/bin/pip install -e ./genarch[phase4]

# Copy server files
COPY server.cjs ./
COPY server/ ./server/

# Copy any additional required files
COPY config-overrides.js ./
COPY jsconfig.json ./

# Create required directories
RUN mkdir -p /app/runs /app/qa_results /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV GENARCH_PYTHON_PATH=/app/venv/bin/python
ENV GENARCH_RUNS_DIR=/app/runs
ENV BLENDER_PATH=/usr/bin/blender

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Start server
CMD ["node", "server.cjs"]
