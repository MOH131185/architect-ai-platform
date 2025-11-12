#!/bin/bash

echo "========================================"
echo "Together AI Local Testing Setup"
echo "========================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "[ERROR] .env file not found!"
    echo ""
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "Please edit .env and add your TOGETHER_API_KEY"
    echo "Then run this script again."
    exit 1
fi

# Check if TOGETHER_API_KEY is set
if grep -q "TOGETHER_API_KEY=your_together_api_key_here" .env; then
    echo "[WARNING] TOGETHER_API_KEY not configured in .env"
    echo ""
    echo "Please:"
    echo "1. Get API key from https://api.together.xyz/"
    echo "2. Edit .env file"
    echo "3. Replace 'your_together_api_key_here' with your actual key"
    echo ""
    exit 1
fi

echo "[OK] .env file found"
echo "[OK] TOGETHER_API_KEY configured"
echo ""

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "[WARNING] Dependencies not installed"
    echo ""
    echo "Installing dependencies..."
    npm install
    echo ""
fi

echo "========================================"
echo "Starting Development Servers..."
echo "========================================"
echo ""
echo "React App: http://localhost:3000"
echo "API Proxy: http://localhost:3001"
echo ""
echo "IMPORTANT:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Press F12 to open Developer Console"
echo "3. Watch for 'Together AI' and 'FLUX.1' messages"
echo ""
echo "Press Ctrl+C to stop servers"
echo "========================================"
echo ""

# Start servers
npm run dev
