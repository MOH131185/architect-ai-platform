# How to Start Servers (Two Terminal Method)

## Problem with `npm run dev`

The `npm run dev` command uses concurrently to run both servers, but it's causing the Express server to crash.

**Solution**: Run servers in TWO separate terminal windows.

---

## ✅ Method 1: Two Terminals (Recommended)

### Terminal 1: Start Express API Proxy

**Open first terminal** in project folder:

```bash
npm run server
```

**Expected output**:
```
🚀 API Proxy Server running on http://localhost:3001
🧠 Meta Llama 3.1 70B (Reasoning): Configured ✅
🎨 FLUX.1 (Image Generation): Configured ✅

🎯 Architecture Engine: FLUX.1 + Llama 70B via Together AI
💡 100% Together AI Exclusive - No DALL-E, No Midjourney, No OpenArt
```

**Leave this terminal running!**

---

### Terminal 2: Start React App

**Open second terminal** in project folder:

```bash
npm start
```

**Expected output**:
```
Starting the development server...

Compiled successfully!

You can now view architect-ai-platform in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000
```

**Leave this terminal running too!**

---

## ✅ Method 2: PowerShell Script (Windows)

Save this as `start-dev.ps1`:

```powershell
# Start API server in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run server"

# Wait 3 seconds
Start-Sleep -Seconds 3

# Start React in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm start"

Write-Host "✅ Servers starting in separate windows..."
Write-Host "Express API: http://localhost:3001"
Write-Host "React App: http://localhost:3000"
```

Then run:
```powershell
.\start-dev.ps1
```

---

## ✅ Method 3: Batch Script (Windows)

Save this as `start-dev.bat`:

```batch
@echo off
echo Starting Express API Server...
start "Express API Server" cmd /k "npm run server"

timeout /t 3

echo Starting React App...
start "React App" cmd /k "npm start"

echo.
echo ✅ Servers starting in separate windows...
echo Express API: http://localhost:3001
echo React App: http://localhost:3000
```

Then double-click `start-dev.bat` or run:
```batch
start-dev.bat
```

---

## Verification

### Check Both Servers Are Running

**Check ports**:
```bash
netstat -ano | findstr ":3000"
netstat -ano | findstr ":3001"
```

Both should show `LISTENING`.

---

## Testing

1. **Open browser**: http://localhost:3000
2. **Open console**: F12
3. **Generate a design**
4. **Watch for**: "Together AI" and "FLUX.1" messages

---

## Stopping Servers

**Option 1**: Press `Ctrl+C` in each terminal window

**Option 2**: Kill all node processes:
```bash
taskkill /F /IM node.exe
```

---

## Troubleshooting

### Port 3001 already in use

```bash
# Find process using port 3001
netstat -ano | findstr ":3001"

# Kill that process
taskkill /PID [PID_NUMBER] /F
```

### Port 3000 already in use

```bash
# Find process using port 3000
netstat -ano | findstr ":3000"

# Kill that process
taskkill /PID [PID_NUMBER] /F
```

### React won't start

Make sure Express started first (wait 3-5 seconds between starting servers).
