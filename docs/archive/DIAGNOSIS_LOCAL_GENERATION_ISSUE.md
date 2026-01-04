# Diagnosis: Local Generation Not Working

## Issue Summary
A1 sheet generation is not producing any output when running locally with `npm start` only (without Express proxy server).

## Root Cause Analysis

### Primary Issue: Missing Express Proxy Server
**Status**: ❌ CRITICAL

The app is currently using `npm start` which only runs the React development server on port 3000. However, the new deterministic architecture requires the Express proxy server running on port 3001 to handle API calls to Together.ai.

**Evidence**:
- User confirmed running with option "b" (npm start only, no npm run server)
- `package.json` shows `npm run dev` runs both servers concurrently
- All API calls (`/api/together/chat`, `/api/together/image`, `/api/sheet`, `/api/overlay`) require Express proxy

### Secondary Issue: App Still Using Old Architecture
**Status**: ⚠️ WARNING

`src/App.js` is still importing and using the old `ArchitectAIEnhanced` component instead of the new `ArchitectAIWizardContainer` that was created in Phase 2.

**Evidence**:
- Line 8 in `App.js`: `import * as ArchitectAIModule from './ArchitectAIEnhanced';`
- Should be: `import ArchitectAIWizardContainer from './components/ArchitectAIWizardContainer';`

---

## Immediate Fix Steps

### Step 1: Start Both Servers (REQUIRED)

**Option A: Use npm run dev (RECOMMENDED)**
```bash
npm run dev
```
This starts both React (port 3000) and Express (port 3001) concurrently.

**Option B: Use two terminals**
```bash
# Terminal 1: Express proxy
npm run server

# Terminal 2: React dev server
npm start
```

**Verification**:
- React app should be at http://localhost:3000
- Express proxy should log: "🚀 Express proxy server running on port 3001"
- Browser console should NOT show "Failed to fetch" or CORS errors

### Step 2: Verify Environment Variables

Check your `.env` file has:
```env
TOGETHER_API_KEY=tgp_v1_xxxxxxxxxxxxxxxxxxxxx
REACT_APP_GOOGLE_MAPS_API_KEY=xxxxxxxxxxxxxxxxxxxxx
REACT_APP_OPENWEATHER_API_KEY=xxxxxxxxxxxxxxxxxxxxx
```

**Important**: 
- `TOGETHER_API_KEY` must be a real key from https://api.together.ai/
- Requires Build Tier 2+ ($5-10 credits minimum)
- If you just added/changed keys, restart both servers

### Step 3: Test Generation

1. Open http://localhost:3000 in browser
2. Open DevTools (F12) → Network tab
3. Go through wizard steps (Location → Intelligence → Portfolio → Specs → Generate)
4. Click "Generate AI Designs"
5. Watch Network tab for:
   - `POST /api/together/chat` (should return 200)
   - `POST /api/together/image` (should return 200)
   - `POST /api/sheet` (should return 200)

**Expected behavior**:
- Progress indicator shows "Generating Master DNA..."
- After ~60 seconds, A1 sheet appears
- Consistency metrics show 95%+ scores

**If it fails**:
- Check Console tab for errors
- Check Network tab for failed requests (red)
- Note the error messages and status codes

---

## Optional: Update to New Architecture

To use the new deterministic architecture (recommended for future):

### Update src/App.js

Replace:
```javascript
import * as ArchitectAIModule from './ArchitectAIEnhanced';
const ArchitectAIEnhanced = ArchitectAIModule.default || ArchitectAIModule;
```

With:
```javascript
import ArchitectAIWizardContainer from './components/ArchitectAIWizardContainer';
const ArchitectAIEnhanced = ArchitectAIWizardContainer;
```

**Benefits**:
- Cleaner code (modular components)
- Better error handling
- Deterministic behavior
- Easier to debug

**Note**: Old architecture still works, this is optional.

---

## Debugging Checklist

### Environment
- [ ] Both servers running (React + Express)
- [ ] `.env` file exists with valid keys
- [ ] No port conflicts (3000, 3001)
- [ ] Internet connection working

### Browser DevTools
- [ ] Console shows no errors
- [ ] Network tab shows API requests
- [ ] Requests return 200 (not 404, 500)
- [ ] No CORS errors

### API Keys
- [ ] TOGETHER_API_KEY is valid
- [ ] Together.ai account has credits
- [ ] Key has Build Tier 2+ access

---

## Common Error Messages

### "Failed to fetch"
**Cause**: Express proxy not running
**Fix**: Run `npm run server` or `npm run dev`

### "404 Not Found" on /api/*
**Cause**: Express proxy not running
**Fix**: Run `npm run server` or `npm run dev`

### "TOGETHER_API_KEY missing"
**Cause**: `.env` file missing or not loaded
**Fix**: Create `.env` from `env.template`, add key, restart servers

### "Insufficient credits"
**Cause**: Together.ai account has no credits
**Fix**: Add $5-10 credits at https://api.together.ai/settings/billing

### "No image URLs generated"
**Cause**: Together.ai API call failed
**Fix**: Check Console for specific error, verify API key and credits

---

## Expected Timeline

With both servers running and valid API keys:
- **DNA Generation**: 10-15 seconds
- **A1 Sheet Generation**: 40-60 seconds
- **Total**: ~60-90 seconds

Progress should show:
1. Generating Master DNA... (10-15s)
2. Validating DNA... (1-2s)
3. Building prompt... (1-2s)
4. Generating image... (40-60s)
5. Validating result... (1-2s)
6. Creating baseline artifacts... (1-2s)
7. Composing overlays... (1-2s)
8. Finalizing... (1s)

---

## Next Steps

1. **Immediate**: Start both servers with `npm run dev`
2. **Verify**: Check `.env` has valid TOGETHER_API_KEY
3. **Test**: Try generation and watch DevTools
4. **Report**: If still failing, share Console errors and Network failures

---

**Status**: Ready for user action
**Priority**: HIGH (blocking generation)
**Estimated fix time**: 2-5 minutes

