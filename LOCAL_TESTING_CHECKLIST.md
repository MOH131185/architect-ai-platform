# Local Testing Checklist

## Pre-flight Checks

### 1. Environment Variables
Check that your `.env` file has all required API keys:

```bash
# Required API Keys
REACT_APP_GOOGLE_MAPS_API_KEY=your_key_here
REACT_APP_OPENWEATHER_API_KEY=your_key_here
REACT_APP_OPENAI_API_KEY=your_key_here
REACT_APP_REPLICATE_API_KEY=your_key_here

# Feature Flags (optional)
ENABLE_DXF_EXPORT=true
ENABLE_CONTROLNET=true
ENABLE_VALIDATION_LOOP=true
```

### 2. Dependencies
Ensure all dependencies are installed:
```bash
npm install
```

### 3. Start Development Servers
Run both frontend and backend servers:
```bash
# In one terminal - Start Express proxy server (port 3001)
npm run server

# In another terminal - Start React dev server (port 3000)
npm start

# OR run both together
npm run dev
```

## Testing Checklist

### A. Basic Application Load
- [ ] React app loads on http://localhost:3000
- [ ] No console errors on initial load
- [ ] Express server running on http://localhost:3001
- [ ] Can navigate through all 6 steps without crashes

### B. New MDS Features Test

1. **Test Location Intelligence**
   - [ ] Enter an address (e.g., "San Francisco, CA")
   - [ ] Check console for MDS generation logs
   - [ ] Verify location analysis completes without errors

2. **Test Portfolio Style Blending**
   - [ ] Upload portfolio images in step 3
   - [ ] Check console for portfolio analysis
   - [ ] Verify blended style is created

3. **Test MDS Generation**
   - [ ] Complete project specifications in step 4
   - [ ] Check console for "🏗️ Creating Master Design Specification..." log
   - [ ] Verify no errors in console

4. **Test AI Generation with MDS**
   - [ ] Click "Generate AI Designs" in step 4
   - [ ] Monitor console for reasoning service logs
   - [ ] Check Network tab for API calls to `/api/projects` endpoints

### C. API Endpoint Tests

Test the new project management endpoints:

```bash
# Test project creation
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"address":"123 Main St","area":200,"program":"residential"}'

# Test MDS generation (replace PROJECT_ID)
curl -X POST http://localhost:3001/api/projects/PROJECT_ID/generate \
  -H "Content-Type: application/json"

# Test MDS modification (replace PROJECT_ID)
curl -X POST http://localhost:3001/api/projects/PROJECT_ID/modify \
  -H "Content-Type: application/json" \
  -d '{"modification":"Make it 3 floors with brick facade"}'
```

### D. Console Error Monitoring

Watch for these common errors:
- [ ] No "TypeError: Cannot read property" errors
- [ ] No "undefined is not a function" errors
- [ ] No "Failed to fetch" network errors
- [ ] No "CORS" errors
- [ ] No "API key invalid" errors

### E. Performance Checks
- [ ] Page loads within 3 seconds
- [ ] No memory leaks (check Chrome DevTools Memory tab)
- [ ] Network requests complete within reasonable time

## Common Issues & Solutions

### Issue: "Module not found" errors
**Solution:** Clear cache and reinstall
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Port already in use"
**Solution:** Kill existing processes
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### Issue: API calls failing
**Solution:** Check Express proxy server is running
```bash
npm run server
# Should see: "Proxy server running on port 3001"
```

### Issue: OpenAI/Replicate errors
**Solution:** Verify API keys in .env file and check usage limits

## Test Sequence

1. **Start servers**
   ```bash
   npm run dev
   ```

2. **Open browser**
   - Navigate to http://localhost:3000
   - Open Developer Console (F12)

3. **Run through complete workflow**
   - Landing page → Location → Intelligence Report → Portfolio → Specifications → AI Generation

4. **Check logs**
   - Terminal logs for server errors
   - Browser console for client errors
   - Network tab for failed requests

5. **Test new features specifically**
   - MDS generation
   - Style blending
   - Text modification

## Success Criteria

✅ Application loads without errors
✅ Can complete full workflow
✅ MDS is generated successfully
✅ No console errors
✅ API calls work correctly
✅ AI generation produces results

## Before Committing

If all tests pass:
```bash
# Add files
git add .

# Commit with descriptive message
git commit -m "feat: Implement MDS generation pipeline with OpenAI reasoning

- Add Master Design Specification (MDS) schema
- Create reasoning service for AI-driven design
- Implement style blending (local + portfolio)
- Add project management API endpoints
- Include comprehensive test suite
- Update environment configuration"

# Push to GitHub
git push origin main
```

## Notes

- The application will use fallback data if API keys are missing
- One test may fail due to Jest mocking issues (doesn't affect runtime)
- Use Chrome DevTools for best debugging experience