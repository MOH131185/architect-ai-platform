#!/bin/bash

echo "=========================================="
echo " Architect AI Platform - Local Setup"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js from: https://nodejs.org/"
    exit 1
fi

echo "[1/5] Checking Node.js version..."
node --version
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[2/5] Installing dependencies..."
    echo "This may take 1-3 minutes..."
    npm install
    echo ""
else
    echo "[2/5] Dependencies already installed (skipping)"
    echo ""
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "[ERROR] .env file not found!"
    echo ""
    echo "Please create a .env file with your API keys."
    echo "See LOCAL_SETUP_GUIDE.md for instructions."
    echo ""
    exit 1
fi

echo "[3/5] Environment variables found"
echo ""

echo "[4/5] Checking API keys configuration..."

if grep -q "REACT_APP_OPENAI_API_KEY=sk-" .env; then
    echo "  - OpenAI API Key: [OK]"
else
    echo "  - OpenAI API Key: [MISSING]"
fi

if grep -q "REACT_APP_REPLICATE_API_KEY=r8_" .env; then
    echo "  - Replicate API Key: [OK]"
else
    echo "  - Replicate API Key: [MISSING]"
fi

if grep -q "REACT_APP_GOOGLE_MAPS_API_KEY=" .env; then
    echo "  - Google Maps API Key: [OK]"
else
    echo "  - Google Maps API Key: [MISSING]"
fi

if grep -q "REACT_APP_OPENWEATHER_API_KEY=" .env; then
    echo "  - OpenWeather API Key: [OK]"
else
    echo "  - OpenWeather API Key: [MISSING]"
fi

echo ""

echo "[5/5] Starting servers..."
echo ""
echo "=========================================="
echo " Starting Express Server (port 3001)"
echo " Starting React App (port 3000)"
echo "=========================================="
echo ""
echo "The application will open in your browser at:"
echo "  http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the servers"
echo ""

# Start the application
npm run dev
