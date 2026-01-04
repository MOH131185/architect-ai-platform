@echo off
echo ========================================
echo Together AI Local Testing Setup
echo ========================================
echo.

REM Check if .env file exists
if not exist .env (
    echo [ERROR] .env file not found!
    echo.
    echo Creating .env from .env.example...
    copy .env.example .env
    echo.
    echo Please edit .env and add your TOGETHER_API_KEY
    echo Then run this script again.
    pause
    exit /b
)

REM Check if TOGETHER_API_KEY is set
findstr /C:"TOGETHER_API_KEY=" .env | findstr /V /C:"your_together_api_key_here" >nul
if errorlevel 1 (
    echo [WARNING] TOGETHER_API_KEY not configured in .env
    echo.
    echo Please:
    echo 1. Get API key from https://api.together.xyz/
    echo 2. Edit .env file
    echo 3. Replace 'your_together_api_key_here' with your actual key
    echo.
    pause
    exit /b
)

echo [OK] .env file found
echo [OK] TOGETHER_API_KEY configured
echo.

REM Check if node_modules exists
if not exist node_modules (
    echo [WARNING] Dependencies not installed
    echo.
    echo Installing dependencies...
    call npm install
    echo.
)

echo ========================================
echo Starting Development Servers...
echo ========================================
echo.
echo React App: http://localhost:3000
echo API Proxy: http://localhost:3001
echo.
echo IMPORTANT:
echo 1. Open http://localhost:3000 in your browser
echo 2. Press F12 to open Developer Console
echo 3. Watch for "Together AI" and "FLUX.1" messages
echo.
echo Press Ctrl+C to stop servers
echo ========================================
echo.

REM Start servers
call npm run dev
