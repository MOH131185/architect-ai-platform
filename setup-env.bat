@echo off
echo Setting up environment variables for ArchitectAI Platform...
echo.

REM Copy the template to .env
copy env.template .env

echo.
echo ✅ Environment file created: .env
echo.
echo ⚠️  IMPORTANT: You need to edit .env and add your actual API keys:
echo.
echo 1. Get OpenAI API key from: https://platform.openai.com/api-keys
echo 2. Get Replicate API key from: https://replicate.com/account/api-tokens
echo 3. Get Google Maps API key from: https://console.cloud.google.com/apis/credentials
echo 4. Get OpenWeather API key from: https://openweathermap.org/api
echo.
echo After adding your keys, restart the development server with: npm run dev
echo.
pause
