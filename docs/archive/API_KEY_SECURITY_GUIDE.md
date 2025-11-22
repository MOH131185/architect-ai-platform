# API Key Security Guide

**Critical**: Not all API keys should be treated equally. This guide explains how to configure keys safely.

---

## 🔐 Key Security Levels

### **1. BACKEND-ONLY KEYS** (Highest Security)

**Never exposed to browser** - Server-side only

| Key | Prefix | Location | Security Level |
|-----|--------|----------|----------------|
| `TOGETHER_API_KEY` | None | server.js, Vercel functions | 🔴 CRITICAL |
| `OPENAI_REASONING_API_KEY` | None | server.js | 🔴 CRITICAL |
| `DATABASE_URL` | None | Server only | 🔴 CRITICAL |

**Rules**:
- ❌ **NO** `REACT_APP_` prefix
- ✅ **NEVER** import in React components
- ✅ Only use in `server.js` or Vercel `/api` functions
- ✅ Keep in `.env` (git-ignored)

**Example (CORRECT)**:
```javascript
// server.js
const togetherApiKey = process.env.TOGETHER_API_KEY; // ✅ Server-side only
```

**Example (WRONG - DO NOT DO)**:
```javascript
// React component
const key = process.env.REACT_APP_TOGETHER_API_KEY; // ❌ EXPOSED TO BROWSER
```

---

### **2. FRONTEND-SAFE KEYS** (Restricted Public Keys)

**Exposed to browser** - Domain/IP restricted required

| Key | Prefix | Restrictions Required | Security Level |
|-----|--------|---------------------|----------------|
| `REACT_APP_GOOGLE_MAPS_API_KEY` | REACT_APP_ | Domain whitelist | 🟡 MEDIUM |
| `REACT_APP_OPENWEATHER_API_KEY` | REACT_APP_ | Read-only + IP restrict | 🟡 MEDIUM |

**Rules**:
- ✅ **MUST** use `REACT_APP_` prefix
- ✅ **MUST** configure restrictions in provider dashboard
- ⚠️ Keys will be visible in browser DevTools
- ✅ Safe for frontend IF properly restricted

**Example (CORRECT)**:
```javascript
// React component
const mapKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY; // ✅ Domain-restricted
```

---

## 🛡️ How to Restrict Frontend Keys

### **Google Maps API Key**

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your API key
3. Under "Application restrictions":
   - Select **"HTTP referrers (web sites)"**
   - Add allowed domains:
     ```
     https://www.archiaisolution.pro/*
     https://archiaisolution.pro/*
     https://architect-ai-platform-*.vercel.app/*
     localhost:3000/*
     ```
4. Under "API restrictions":
   - Select **"Restrict key"**
   - Enable only: Maps JavaScript API, Geocoding API, Places API

**Result**: Key only works on your domains ✅

---

### **OpenWeather API Key**

1. Go to [OpenWeather Dashboard](https://home.openweathermap.org/api_keys)
2. Your key restrictions:
   - **Read-only** by default ✅
   - Optional: Configure IP whitelist for extra security

**Result**: Key is read-only, safe for frontend ✅

---

## ❌ Common Mistakes

### **Mistake #1: Exposing Backend Keys**
```javascript
// ❌ WRONG - Exposes sensitive key to browser
REACT_APP_TOGETHER_API_KEY=tgp_v1_xxxxx

// ✅ CORRECT - Server-side only
TOGETHER_API_KEY=tgp_v1_xxxxx
```

### **Mistake #2: Unrestricted Frontend Keys**
```
❌ Google Maps key without domain restrictions
→ Anyone can steal and use your key on their site
→ Unlimited API calls charged to your account

✅ Domain-restricted Google Maps key
→ Only works on your domains
→ Theft is useless
```

### **Mistake #3: Committing .env to Git**
```bash
# ❌ WRONG
git add .env
git commit -m "Add env vars"

# ✅ CORRECT - .env is in .gitignore
git add .env.example  # Template only, no real keys
```

---

## 📋 Security Checklist

Before deploying:

### **Backend Keys** (TOGETHER_API_KEY, OPENAI_*)
- [ ] No `REACT_APP_` prefix
- [ ] Listed in `.env` (not `.env.example`)
- [ ] `.env` is in `.gitignore`
- [ ] Set in Vercel environment variables
- [ ] Never imported in React components

### **Frontend Keys** (GOOGLE_MAPS, OPENWEATHER)
- [ ] Has `REACT_APP_` prefix
- [ ] Domain restrictions configured in provider dashboard
- [ ] IP restrictions configured (if available)
- [ ] Read-only permissions only
- [ ] API usage limits set in provider dashboard

### **General**
- [ ] `.env` file NOT committed to git
- [ ] Separate keys for dev/staging/production
- [ ] API usage monitoring enabled
- [ ] Billing alerts configured

---

## 🔍 How to Check if Keys are Exposed

### **Method 1: Browser DevTools**
1. Open your deployed app
2. Press F12 → Network tab
3. Look for `main.*.js` bundles
4. Search for "tgp_v1" or "sk-proj"
5. If found = **KEY IS EXPOSED** ❌

### **Method 2: Build Inspection**
```bash
npm run build
grep -r "TOGETHER_API_KEY" build/
```

**Expected**: No results (backend keys not in build)
**If found**: Remove `REACT_APP_` prefix immediately

---

## 💰 Cost Impact of Key Exposure

### **Exposed Backend Key**
- Attacker can make unlimited API calls
- Together.ai FLUX calls: $0.01-0.02 each
- Potential loss: **$100-1000+ per day**
- Account suspension risk

### **Unrestricted Frontend Key**
- Google Maps stolen → $200+ monthly surprise bills
- OpenWeather stolen → Lower risk (free tier)
- API quota exhaustion → Your app stops working

### **Restricted Frontend Key**
- Stolen key is useless (domain-locked)
- Max loss: Your legitimate usage only
- **Much safer** ✅

---

## 🚨 What to Do if Key is Exposed

### **Immediate Actions**:
1. **Revoke exposed key** in provider dashboard
2. **Generate new key** with restrictions
3. **Update `.env`** and Vercel environment variables
4. **Clear build cache**: `rm -rf build node_modules/.cache`
5. **Rebuild and redeploy**

### **Verify Fix**:
```bash
# Check build output doesn't contain key
npm run build
grep -r "YOUR_KEY_PREFIX" build/

# Expected: No results
```

---

## ✅ Recommended Configuration

### **.env (Development)**
```bash
# BACKEND-ONLY (No REACT_APP_ prefix)
TOGETHER_API_KEY=tgp_v1_xxxxx
OPENAI_REASONING_API_KEY=sk-proj-xxxxx

# FRONTEND-SAFE (With REACT_APP_ prefix + restrictions)
REACT_APP_GOOGLE_MAPS_API_KEY=AIzaSy_xxxxx  # Domain-restricted
REACT_APP_OPENWEATHER_API_KEY=abc123xxx  # Read-only
```

### **Vercel Environment Variables**
Set separately for each environment:
- Production
- Preview
- Development

**Backend keys**: Available to all environments
**Frontend keys**: Different keys per environment (optional)

---

## 📚 Additional Resources

- [Google Maps API Security](https://developers.google.com/maps/api-security-best-practices)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [OWASP API Security](https://owasp.org/www-project-api-security/)

---

## 🎯 Quick Reference

| Want to... | Use... | Prefix | Restrictions |
|-----------|--------|--------|--------------|
| Call Together.ai API | Backend proxy | None | N/A (server-side) |
| Call OpenAI API | Backend proxy | None | N/A (server-side) |
| Use Google Maps | Frontend | REACT_APP_ | Domain whitelist |
| Get weather data | Frontend | REACT_APP_ | Read-only |
| Store secrets | Backend | None | Never expose |

---

**Last Updated**: 2025-11-03
**Review Date**: Every 3 months
**Responsible**: Development Team

**Remember**: When in doubt, keep it server-side! 🔒
