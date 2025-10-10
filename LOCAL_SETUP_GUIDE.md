# Local Setup Guide - Architect AI Platform

This guide will help you run the Architect AI Platform locally on your machine.

---

## Prerequisites

Make sure you have these installed:
- **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** (for version control)

Check your versions:
```bash
node --version    # Should be v16.x or higher
npm --version     # Should be 8.x or higher
```

---

## Step 1: Clone the Repository (if not already done)

```bash
git clone https://github.com/MOH131185/architect-ai-platform.git
cd architect-ai-platform
```

---

## Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- React and React DOM
- Express server
- Axios for HTTP requests
- Concurrently (to run multiple servers)
- And all other dependencies

**Expected time:** 1-3 minutes depending on your internet speed.

---

## Step 3: Configure Environment Variables

### Create your `.env` file

The `.env` file should already exist in the root directory. If not, create it:

```bash
# Windows Command Prompt
copy .env.example .env

# Windows PowerShell or Git Bash
cp .env.example .env
```

### Add your API keys to `.env`

Open `.env` in a text editor and add your API keys:

```env
# Google Maps API
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# OpenWeather API
REACT_APP_OPENWEATHER_API_KEY=your_openweather_api_key_here

# OpenAI API for Design Reasoning
REACT_APP_OPENAI_API_KEY=your_openai_api_key_here

# Replicate API for Image Generation
REACT_APP_REPLICATE_API_KEY=your_replicate_api_key_here
```

**Note:** Replace the placeholder values with your actual API keys. You can find your keys in the existing `.env` file in your local directory.

**⚠️ Important:**
- Never commit the `.env` file to GitHub
- The `.env` file is already in `.gitignore`
- These keys are for local development only

---

## Step 4: Run the Application

### Option A: Run Both Servers Together (Recommended)

This is the **easiest** and **recommended** way:

```bash
npm run dev
```

This command starts:
1. **Express API Proxy Server** on `http://localhost:3001`
2. **React Development Server** on `http://localhost:3000`

**You should see output like:**
```
[0] 🚀 API Proxy Server running on http://localhost:3001
[0] ✅ OpenAI API Key: Configured
[0] ✅ Replicate API Key: Configured
[1]
[1] Compiled successfully!
[1]
[1] You can now view architect-ai-platform in the browser.
[1]
[1]   Local:            http://localhost:3000
[1]   On Your Network:  http://192.168.x.x:3000
```

### Option B: Run Servers Separately (if Option A doesn't work)

Open **two separate terminal windows**:

**Terminal 1 - Express Server:**
```bash
npm run server
```

**Terminal 2 - React App:**
```bash
npm start
```

---

## Step 5: Access the Application

Open your web browser and navigate to:

```
http://localhost:3000
```

You should see the Architect AI Platform landing page.

---

## Step 6: Test the Application

### 1. Test Location Analysis
- Enter an address (e.g., "1600 Amphitheatre Parkway, Mountain View, CA")
- Click "Analyze Location"
- Verify you see climate data, zoning info, and architectural recommendations

### 2. Test Portfolio Upload
- Upload 10-20 architectural images
- Verify they appear in the portfolio grid

### 3. Test AI Generation
- Enter project specifications (e.g., "3-bedroom house, 200m²")
- Click "Generate AI Designs"
- **Check browser console** (F12) for performance logs

### 4. Verify Performance Optimizations

Open **Browser Developer Console** (F12) and watch for these logs:

```
✅ Portfolio style detected: Contemporary
✅ Design reasoning generated
🏗️ Generating floor plans (parallel execution)...
✅ Floor plans generated in 42.3s (parallel execution)
🏗️ Generating elevations (N, S, E, W) with HIGH QUALITY settings...
✅ Technical drawings generated in 28.7s (parallel execution, 6 drawings)
🎲 Generating exterior_front with seed: 847293
✅ 3D views generated in 38.2s (parallel execution, 5 views)
```

**Expected total generation time:** 60-90 seconds (instead of 3-5 minutes!)

---

## Common Issues & Solutions

### Issue 1: Port Already in Use

**Error:** `Port 3000 is already in use`

**Solution:**
```bash
# Windows - Find and kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID [PID_NUMBER] /F

# Or change the port
set PORT=3002 && npm start
```

### Issue 2: 404 Errors for API Calls

**Error:** `/api/openai-chat:1 Failed to load resource: the server responded with a status of 404`

**Solution:** This means the Express server is not running. Make sure you use:
```bash
npm run dev
```
Not just `npm start`.

### Issue 3: 401 Errors for API Calls

**Error:** `OpenAI API error: 401`

**Solution:**
1. Check your API key in `.env` is correct
2. Restart the servers after changing `.env`:
   ```bash
   # Ctrl+C to stop
   npm run dev
   ```

### Issue 4: Module Not Found

**Error:** `Cannot find module 'express'` or similar

**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue 5: Slow Generation (Still Taking 3-5 Minutes)

**Solution:**
1. Check console logs show "parallel execution"
2. Verify you're running the latest code:
   ```bash
   git pull origin main
   npm install
   npm run dev
   ```
3. Clear browser cache (Ctrl+Shift+Delete)

---

## Available Scripts

### Development

| Command | Description |
|---------|-------------|
| `npm run dev` | **Recommended** - Runs both Express server (port 3001) and React app (port 3000) |
| `npm start` | Runs only React development server (port 3000) |
| `npm run server` | Runs only Express API proxy server (port 3001) |

### Production

| Command | Description |
|---------|-------------|
| `npm run build` | Creates optimized production build in `/build` folder |
| `npm test` | Runs test suite |

---

## Project Structure

```
architect-ai-platform/
├── public/              # Static files
├── src/
│   ├── components/      # React components
│   ├── services/        # API services (optimized with parallel execution)
│   │   ├── aiIntegrationService.js    # Main AI orchestration
│   │   ├── replicateService.js        # Image generation (optimized)
│   │   ├── openaiService.js           # OpenAI integration
│   │   └── locationIntelligence.js    # Location analysis
│   ├── data/            # Architectural database
│   └── ArchitectAIEnhanced.js         # Main application component
├── api/                 # Vercel serverless functions (for production)
├── server.js            # Express proxy server (for development)
├── .env                 # Environment variables (not in git)
├── .gitignore           # Git ignore rules
└── package.json         # Dependencies and scripts
```

---

## Performance Features (Recently Added)

The platform now includes **60-80% faster generation** through parallel execution:

### What Was Optimized:
- ✅ Floor plans generation (3 levels in parallel)
- ✅ Elevations and sections (6 drawings in parallel)
- ✅ 3D views generation (5 views in parallel)
- ✅ Construction documentation (all floors in parallel)
- ✅ Structural plans (all levels in parallel)
- ✅ MEP plans (all floors in parallel)

### How to Verify:
Look for these console logs:
```javascript
✅ Floor plans generated in 42s (parallel execution)
✅ Technical drawings generated in 28s (parallel execution, 6 drawings)
✅ 3D views generated in 38s (parallel execution, 5 views)
```

### Technical Details:
- **Before:** Sequential FOR loops (one image at a time)
- **After:** Promise.all() for concurrent generation
- **Result:** 60-90 seconds total (down from 3-5 minutes)

---

## Environment Variables Explained

| Variable | Purpose | Where to Get |
|----------|---------|--------------|
| `REACT_APP_GOOGLE_MAPS_API_KEY` | Location mapping, geocoding | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `REACT_APP_OPENWEATHER_API_KEY` | Climate data | [OpenWeather](https://home.openweathermap.org/api_keys) |
| `REACT_APP_OPENAI_API_KEY` | Design reasoning, AI analysis | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `REACT_APP_REPLICATE_API_KEY` | Image generation (SDXL) | [Replicate](https://replicate.com/account/api-tokens) |

---

## Stopping the Application

Press `Ctrl+C` in the terminal where the servers are running.

If servers don't stop properly:

**Windows:**
```bash
# Kill all Node processes
taskkill /F /IM node.exe
```

**Mac/Linux:**
```bash
# Kill processes on specific ports
kill $(lsof -t -i:3000)
kill $(lsof -t -i:3001)
```

---

## Updating the Application

To get the latest changes:

```bash
# Stop the servers (Ctrl+C)

# Pull latest code
git pull origin main

# Install any new dependencies
npm install

# Restart servers
npm run dev
```

---

## Browser Console Tips

### Open Developer Console:
- **Chrome/Edge:** F12 or Ctrl+Shift+I
- **Firefox:** F12 or Ctrl+Shift+K
- **Safari:** Cmd+Option+I (enable Developer menu first)

### Filter Console Logs:
Type in the console filter box:
- `parallel` - See parallel execution logs
- `✅` - See success messages
- `❌` - See errors only
- `🏗️` - See generation progress

### Monitor Network Requests:
1. Open DevTools (F12)
2. Go to **Network** tab
3. Filter by **Fetch/XHR**
4. Watch for:
   - `/api/openai-chat` - Design reasoning calls
   - `/api/replicate/predictions` - Image generation calls

---

## Getting Help

### Check Logs:
1. **Browser Console** - For frontend errors (F12)
2. **Terminal Output** - For server errors (where you ran `npm run dev`)

### Common Log Patterns:

**✅ Everything Working:**
```
🚀 API Proxy Server running on http://localhost:3001
✅ OpenAI API Key: Configured
✅ Replicate API Key: Configured
✅ Portfolio style detected: Contemporary
✅ Floor plans generated in 42s (parallel execution)
```

**❌ API Key Issues:**
```
❌ OpenAI API Key: Missing
Error: OpenAI API error: 401
```

**❌ Server Not Running:**
```
Failed to load resource: net::ERR_CONNECTION_REFUSED
Failed to load resource: the server responded with a status of 404
```

---

## Next Steps

1. ✅ Local development environment set up
2. ✅ Application running successfully
3. ✅ Performance optimizations active
4. 🔄 Ready to test and develop new features

For deployment to production (Vercel), see: [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

---

## Additional Resources

- **Performance Analysis:** [PERFORMANCE_ANALYSIS.md](./PERFORMANCE_ANALYSIS.md)
- **Implementation Details:** [PERFORMANCE_OPTIMIZATIONS_IMPLEMENTED.md](./PERFORMANCE_OPTIMIZATIONS_IMPLEMENTED.md)
- **Deployment Guide:** [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- **API Setup:** [API_SETUP.md](./API_SETUP.md)
- **Project Documentation:** [CLAUDE.md](./CLAUDE.md)

---

**Happy Coding!** 🚀

If you encounter any issues not covered in this guide, check the GitHub Issues or contact the development team.
