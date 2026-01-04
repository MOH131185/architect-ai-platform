@echo off
echo ========================================
echo Starting Architect AI Platform
echo ========================================
echo.

REM Check if .env exists
if not exist .env (
    echo [ERROR] .env file not found!
    echo Please create .env from .env.example
    pause
    exit /b
)

echo [1/2] Starting Express API Server (port 3001)...
start "Express API Server - Port 3001" cmd /k "npm run server"

echo Waiting 3 seconds for API server to start...
timeout /t 3 /nobreak >nul

echo.
echo [2/2] Starting React App (port 3000)...
start "React App - Port 3000" cmd /k "npm start"

echo.
echo ========================================
echo ✅ Servers Starting!
echo ========================================
echo.
echo Express API: http://localhost:3001
echo React App: http://localhost:3000
echo.
echo Two windows opened:
echo 1. Express API Server (keep running)
echo 2. React App (keep running)
echo.
echo To stop: Press Ctrl+C in each window
echo ========================================
