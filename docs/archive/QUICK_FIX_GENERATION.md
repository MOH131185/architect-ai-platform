# Quick Fix: Get A1 Generation Working

## The Problem
You're running `npm start` only, but the app needs **both** React and Express servers.

## The Solution (30 seconds)

### Step 1: Stop Current Server
Press `Ctrl+C` in your terminal to stop `npm start`

### Step 2: Start Both Servers
```bash
npm run dev
```

This single command starts:
- React dev server (port 3000)
- Express proxy server (port 3001)

### Step 3: Verify
You should see:
```
[0] 🚀 Express proxy server running on port 3001
[1] webpack compiled successfully
```

### Step 4: Test
1. Open http://localhost:3000
2. Go through wizard
3. Click "Generate AI Designs"
4. Wait ~60 seconds
5. A1 sheet should appear!

---

## Why This Fixes It

The new deterministic architecture needs Express to:
- Proxy Together.ai API calls (avoids CORS)
- Handle rate limiting (6-second delays)
- Provide deterministic endpoints (/api/sheet, /api/overlay)

Without Express, all API calls fail with "Failed to fetch" or 404 errors.

---

## Alternative (Two Terminals)

If `npm run dev` doesn't work:

**Terminal 1**:
```bash
npm run server
```

**Terminal 2**:
```bash
npm start
```

---

## Still Not Working?

Check your `.env` file has:
```env
TOGETHER_API_KEY=tgp_v1_your_actual_key_here
```

If missing:
1. Copy `env.template` to `.env`
2. Add your Together.ai API key
3. Restart servers

Get key at: https://api.together.ai/settings/api-keys

---

**That's it!** Generation should work now. 🎉

