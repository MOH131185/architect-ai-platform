@echo off
echo ==========================================
echo  Architect AI Platform - Local Setup
echo ==========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] Checking Node.js version...
node --version
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [2/5] Installing dependencies...
    echo This may take 1-3 minutes...
    call npm install
    echo.
) else (
    echo [2/5] Dependencies already installed (skipping)
    echo.
)

REM Check if .env file exists
if not exist ".env" (
    echo [ERROR] .env file not found!
    echo.
    echo Please create a .env file with your API keys.
    echo See LOCAL_SETUP_GUIDE.md for instructions.
    echo.
    pause
    exit /b 1
)

echo [3/5] Environment variables found
echo.

echo [4/5] Checking API keys configuration...
findstr /C:"REACT_APP_OPENAI_API_KEY=sk-" .env >nul
if %ERRORLEVEL% EQU 0 (
    echo   - OpenAI API Key: [OK]
) else (
    echo   - OpenAI API Key: [MISSING]
)

findstr /C:"REACT_APP_REPLICATE_API_KEY=r8_" .env >nul
if %ERRORLEVEL% EQU 0 (
    echo   - Replicate API Key: [OK]
) else (
    echo   - Replicate API Key: [MISSING]
)

findstr /C:"REACT_APP_GOOGLE_MAPS_API_KEY=" .env >nul
if %ERRORLEVEL% EQU 0 (
    echo   - Google Maps API Key: [OK]
) else (
    echo   - Google Maps API Key: [MISSING]
)

findstr /C:"REACT_APP_OPENWEATHER_API_KEY=" .env >nul
if %ERRORLEVEL% EQU 0 (
    echo   - OpenWeather API Key: [OK]
) else (
    echo   - OpenWeather API Key: [MISSING]
)
echo.

echo [5/5] Starting servers...
echo.
echo ==========================================
echo  Starting Express Server (port 3001)
echo  Starting React App (port 3000)
echo ==========================================
echo.
echo The application will open in your browser at:
echo   http://localhost:3000
echo.
echo Press Ctrl+C to stop the servers
echo.

REM Start the application
call npm run dev
