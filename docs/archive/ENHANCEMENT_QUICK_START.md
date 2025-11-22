# Quick Start Guide - Project Enhancements

## 🚨 IMMEDIATE ACTION REQUIRED

### 1. Rotate the Exposed API Key
```bash
# The Together.ai API key was exposed in source code
# 1. Go to https://api.together.xyz/settings/billing
# 2. Generate a new API key
# 3. Update your .env file with the new key
# 4. Revoke the old key
```

---

## 🚀 Quick Start Commands

### Check Your Environment
```bash
# Validate all environment variables
npm run check:env

# Check everything before build
npm run check:all
```

### Migrate Console Logs (Automated)
```bash
# Dry run to see what will change
npm run migrate:logs:dry

# Actually migrate all console.log statements
npm run migrate:logs

# Migrate a specific file
node scripts/migrate-console-logs.js --file=src/services/myService.js
```

### Development with New Features
```bash
# Run with debug logging
npm run logs:debug

# Run with production logging (errors only)
npm run logs:production

# Run with performance monitoring enabled
npm run analyze:performance

# Run tests with coverage
npm run test:coverage
```

---

## 📝 Using the New Utilities

### 1. Logger Instead of Console.log
```javascript
// OLD WAY ❌
console.log('Starting generation for', viewType);
console.error('API failed:', error);

// NEW WAY ✅
import logger from './utils/logger';

logger.info('Starting generation', { viewType });
logger.error('API failed', { error: error.message });
logger.debug('Detailed data', data); // Only in development
```

### 2. Error Handling
```javascript
// OLD WAY ❌
try {
  const result = await apiCall();
} catch (error) {
  console.error(error);
  return fallbackData;
}

// NEW WAY ✅
import errorHandler, { APIError, withTimeout } from './utils/errors';

try {
  const result = await withTimeout(apiCall(), 5000, 'API Call');
} catch (error) {
  const handled = await errorHandler.handle(error);
  if (handled.shouldRetry) {
    // Automatic retry logic
  }
  throw new APIError('Service failed', 500, { service: 'together' });
}
```

### 3. React Error Boundaries
```jsx
// In App.js
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary name="root">
      <ArchitectAIEnhanced />
    </ErrorBoundary>
  );
}
```

### 4. Performance Monitoring
```javascript
import performanceMonitor from './utils/performance';

// Time an operation
const timer = performanceMonitor.startTimer('dna_generation');
await generateDNA();
performanceMonitor.endTimer(timer);

// In browser console
performanceMonitor.logReport(); // See all metrics
```

### 5. API Client
```javascript
// OLD WAY ❌
const response = await fetch('/api/together/image', {
  method: 'POST',
  body: JSON.stringify(data)
});
if (!response.ok) throw new Error('Failed');

// NEW WAY ✅
import { togetherClient } from './utils/apiClient';

// Automatic retry, rate limiting, error handling
const result = await togetherClient.generateImage(prompt, options);
```

---

## 📊 Monitoring in Browser Console

```javascript
// View logger output (colored in development)
logger.info('Test message');

// Check performance metrics
performanceMonitor.logReport();

// Get specific metrics
performanceMonitor.getStats('api_call');

// Check memory usage
performanceMonitor.getMemoryInfo();

// Export logs for debugging
logger.exportLogs();
```

---

## 🔍 Debugging Tips

### Enable Debug Mode
```javascript
// In browser console
logger.setLogLevel('DEBUG');
performanceMonitor.enabled = true;
```

### Check Error Boundaries
```jsx
// Error boundaries will show detailed stack traces in development
// In production, they show a friendly error UI
```

### Monitor API Calls
```javascript
// All API calls are automatically logged with timing
// Check browser Network tab or console for details
```

---

## ⚠️ Common Issues

### Issue: "TOGETHER_API_KEY not set"
**Solution:** Copy `.env.example` to `.env` and add your API key

### Issue: Rate limit errors (429)
**Solution:** The new API client handles this automatically with 6-second delays

### Issue: Console.log still appearing
**Solution:** Run `npm run migrate:logs` to auto-convert them

### Issue: Performance seems slow
**Solution:** Check `performanceMonitor.logReport()` to identify bottlenecks

---

## 📦 What's New

### New Files Created
- `src/utils/logger.js` - Centralized logging
- `src/utils/errors.js` - Error handling
- `src/utils/performance.js` - Performance monitoring
- `src/utils/apiClient.js` - API communication
- `src/components/ErrorBoundary.jsx` - React error boundaries
- `scripts/check-env.js` - Enhanced environment validation
- `scripts/migrate-console-logs.js` - Console.log migration

### New NPM Scripts
- `migrate:logs` - Migrate console.logs to logger
- `migrate:logs:dry` - Preview migration changes
- `analyze:performance` - Run with performance monitoring
- `logs:debug` - Debug logging mode
- `logs:production` - Production logging mode
- `test:coverage` - Tests with coverage report

---

## 🎯 Phase 2 Tasks (Future)

1. **Replace remaining console.logs** - Run `npm run migrate:logs`
2. **Refactor monolithic components** - Split ArchitectAIEnhanced.js
3. **Add comprehensive tests** - Target 80% coverage
4. **TypeScript migration** - Start with interfaces
5. **Bundle optimization** - Implement code splitting

---

## 💡 Best Practices

1. **Always use logger** instead of console.log
2. **Wrap async operations** with error handling
3. **Monitor performance** of new features
4. **Use the API client** for all external calls
5. **Add error boundaries** around critical sections

---

## 📞 Need Help?

1. Check `PROJECT_ENHANCEMENT_REPORT.md` for detailed documentation
2. Review individual utility files for usage examples
3. Use `logger.debug()` to trace issues
4. Monitor with `performanceMonitor.logReport()`

---

**Last Updated:** November 1, 2025
**Version:** 2.0 Enhancement Release