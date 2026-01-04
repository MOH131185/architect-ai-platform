# DNA Extractor Diagnostic Guide

## Quick Diagnosis Steps

Now that we've fixed the error logging, you should see a proper error message instead of `[Object]`. Follow these steps to diagnose the actual issue:

### Step 1: Check the Console
Run your application and look for the DNA Extractor error. You should now see one of these specific error messages:

#### Possible Error Messages:

**1. API Key Missing/Invalid**
```
❌ [DNA Extractor] Failed: Together AI API error: 401 - Unauthorized
💡 Hint: Check if GPT-4o API is accessible and API keys are configured
```
**Solution:** Configure your OpenAI API key (see Step 2 below)

---

**2. Network/Proxy Error**
```
❌ [DNA Extractor] Failed: fetch failed
Stack trace: TypeError: fetch failed
```
**Solution:** 
- Check if proxy server is running on port 3001
- Run: `node server.js` in a separate terminal
- Check network connectivity

---

**3. Invalid Response Structure**
```
❌ [DNA Extractor] Failed: Invalid API response structure: missing choices or message
```
**Solution:** API returned unexpected format - check API endpoint configuration

---

**4. JSON Parsing Error**
```
❌ [DNA Extractor] Failed: Failed to parse DNA extraction response: Unexpected token...
💡 Hint: API returned invalid JSON format
```
**Solution:** API response is not valid JSON - check API model compatibility

---

**5. Empty Response**
```
❌ [DNA Extractor] Failed: Empty response from API
```
**Solution:** API returned successfully but with no content - check API quota/limits

---

### Step 2: Configure OpenAI API Key (if needed)

If you see an authentication error, you need to configure your OpenAI API key:

#### For Local Development:

1. **Check if you have a `.env` file** in the project root
2. **Add or update the OpenAI API key:**
   ```env
   OPENAI_API_KEY=sk-proj-your-key-here
   ```
3. **Restart your development server**

#### For Server Proxy (port 3001):

The proxy server needs the API key in its environment. Check `server.js` or create a `.env` file:

```env
OPENAI_API_KEY=sk-proj-your-key-here
```

Then restart the proxy server:
```bash
node server.js
```

---

### Step 3: Verify Proxy Server is Running

The DNA extractor uses GPT-4o which requires the proxy server:

1. **Open a new terminal**
2. **Navigate to project directory:**
   ```bash
   cd c:\Users\21366\OneDrive\Documents\GitHub\architect-ai-platform
   ```
3. **Start the proxy server:**
   ```bash
   node server.js
   ```
4. **You should see:**
   ```
   🚀 API Proxy Server running on http://localhost:3001
   ```

---

### Step 4: Test Portfolio Upload

1. **Clear browser cache/storage** (optional but recommended)
2. **Upload a portfolio image** in the application
3. **Check the console** for the new detailed error message
4. **Follow the hint** provided in the error message

---

### Step 5: Alternative - Skip Portfolio Analysis

If portfolio analysis continues to fail, you can skip it:

1. **Don't upload portfolio images** when creating a design
2. **The system will use fallback DNA** which works fine
3. **Portfolio analysis is optional** - the main workflow will continue

---

## Common Issues and Solutions

### Issue: "gpt-4o not found"
**Cause:** Model name incorrect or not available
**Solution:** Check if your OpenAI account has access to GPT-4o

### Issue: "Rate limit exceeded"
**Cause:** Too many API requests
**Solution:** Wait a few minutes or upgrade your OpenAI plan

### Issue: "Invalid image format"
**Cause:** Portfolio image is not in a supported format
**Solution:** Use JPG or PNG images

### Issue: "Image too large"
**Cause:** Image file size exceeds limits
**Solution:** Resize image to under 20MB

---

## Debug Mode

To see more detailed logs, you can temporarily add debug logging:

1. Open `src/services/enhancedDesignDNAService.js`
2. Add this after line 319 (after checking imageUrl):
   ```javascript
   logger.info('   🔍 Image URL type:', typeof imageUrl);
   logger.info('   🔍 Image URL length:', imageUrl?.length);
   logger.info('   🔍 Image URL preview:', imageUrl?.substring(0, 50));
   ```

---

## What to Report

If the issue persists, please provide:

1. **The exact error message** from the console
2. **The stack trace** (first 3 lines)
3. **Any hints** shown in the error
4. **Your environment:**
   - Node version: `node --version`
   - Is proxy server running?
   - Are you using portfolio images?

---

## Next Steps After Diagnosis

Based on the error message you see:

- **401/403 errors** → Configure API keys
- **Network errors** → Start proxy server
- **Parse errors** → Check API model compatibility
- **Empty response** → Check API quota/limits
- **Other errors** → Report with details above
