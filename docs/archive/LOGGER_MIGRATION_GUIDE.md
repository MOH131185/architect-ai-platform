# Logger Migration Guide

**Date**: 2025-11-20
**Status**: In Progress (1/20 files complete)
**Purpose**: Replace 279 console.* statements with centralized logger

## Overview

The platform has a centralized logging system (`src/utils/logger.js`) that provides:
- **Environment-aware** logging (DEBUG in development, INFO in production, NONE in tests)
- **Emoji prefixes** for visual scanning (🧠, ✅, ⏳, ❌, ⚠️, etc.)
- **Specialized methods** for AI, API, performance, security logging
- **Grouping and timing** utilities for complex workflows
- **Zero cost in production** when disabled

---

## ✅ Completed Files

- **src/services/togetherAIService.js** - 20 console.* calls → logger (Nov 20, 2025)

## 🔄 Remaining Files (19 files, ~259 calls)

| File | Console.* Count | Priority |
|------|----------------|----------|
| src/ArchitectAIEnhanced.js | 141 | LOW (will be refactored) |
| src/services/enhancedDNAGenerator.js | ~20 | HIGH |
| src/services/dnaWorkflowOrchestrator.js | ~15 | HIGH |
| src/services/dnaPromptGenerator.js | ~10 | HIGH |
| src/services/consistencyChecker.js | ~8 | HIGH |
| Others (15 files) | ~65 | MEDIUM |

---

## Quick Reference

### Basic Replacements

| Old Pattern | New Pattern | Logger Method |
|-------------|-------------|---------------|
| `console.log('Message')` | `logger.info('Message')` | General info |
| `console.error('Error:', error)` | `logger.error('Error', error)` | Errors |
| `console.warn('Warning')` | `logger.warn('Warning')` | Warnings |
| `console.debug('Debug')` | `logger.debug('Debug')` | Debug |

### Specialized Methods (with emojis)

| Old Pattern | New Pattern | Emoji |
|-------------|-------------|-------|
| `console.log('🧠 AI processing')` | `logger.ai('AI processing')` | 🧠 |
| `console.log('✅ Success')` | `logger.success('Success')` | ✅ |
| `console.log('⏳ Loading')` | `logger.loading('Loading')` | ⏳ |
| `console.log('🌐 API call')` | `logger.api('API call')` | 🌐 |
| `console.log('⏱️ Performance')` | `logger.performance('Timing')` | ⏱️ |
| `console.log('🔒 Security')` | `logger.security('Auth')` | 🔒 |
| `console.log('📁 File operation')` | `logger.file('File op')` | 📁 |

---

## Logger Levels

| Level | Use Case | Production | Development |
|-------|----------|------------|-------------|
| **ERROR** | Critical failures, exceptions | ✅ Always shown | ✅ Always shown |
| **WARN** | Warnings, fallbacks, deprecated features | ❌ Hidden | ✅ Shown |
| **INFO** | Key workflow steps, important events | ❌ Hidden | ✅ Shown |
| **DEBUG** | Detailed debugging, data inspection | ❌ Hidden | ✅ Shown |
| **TRACE** | Extremely verbose, function calls | ❌ Hidden | ⚠️ Optional |

---

## Migration Patterns

### Pattern 1: Simple Logs
```javascript
// BEFORE
console.log('User clicked generate button');

// AFTER
logger.info('User clicked generate button');
```

### Pattern 2: Logs with Data
```javascript
// BEFORE
console.log('Generated DNA:', dna);

// AFTER
logger.debug('Generated DNA', { dna });
```

### Pattern 3: Error Logs
```javascript
// BEFORE
console.error('API call failed:', error);

// AFTER
logger.error('API call failed', {
  error: error.message,
  service: 'Together.ai',
  statusCode: error.statusCode
});
```

### Pattern 4: Warning Logs
```javascript
// BEFORE
console.warn('Using fallback data');

// AFTER
logger.warn('Using fallback data', {
  reason: 'API unavailable',
  fallbackType: 'mock'
});
```

### Pattern 5: Debug Logs (Development Only)
```javascript
// BEFORE
console.log('Processing view:', viewType);

// AFTER
logger.debug('Processing view', { viewType });
```

### Pattern 6: Workflow Logging
```javascript
// BEFORE
console.log('🧬 [DNA] Generating Master DNA...');

// AFTER
logger.workflow('DNA Generation', { stage: 'master' });
// OR use specialized method:
logger.dna('Generating Master DNA', { projectId });
```

### Pattern 7: API Logging
```javascript
// BEFORE
console.log('Calling Together.ai API:', endpoint);

// AFTER
logger.api('POST', endpoint, { model: 'FLUX.1-dev' });
```

### Pattern 8: Generation Logging
```javascript
// BEFORE
console.log('✅ View generated:', viewType);

// AFTER
logger.generation('View generated', { viewType, status: 'success' });
```

---

## Error Handling Integration

### Old Way
```javascript
try {
  const result = await generateDesign();
} catch (error) {
  console.error('Generation failed:', error);
  return { success: false };
}
```

### New Way
```javascript
import logger from './utils/logger';
import { GenerationError } from './utils/errors';

try {
  const result = await generateDesign();
  logger.info('Design generated successfully');
  return result;
} catch (error) {
  const generationError = new GenerationError(
    'Design generation failed',
    'image-generation',
    { projectId, viewType }
  );

  logger.error('Generation failed', {
    error: generationError.message,
    context: generationError.details
  });

  throw generationError;
}
```

---

## Specialized Logger Methods

### 1. API Calls
```javascript
logger.api('POST', '/api/together/image', {
  model: 'FLUX.1-dev',
  dimensions: '1024x1024'
});
```

### 2. Generation Steps
```javascript
logger.generation('DNA Generation', { stage: 'validation', passed: true });
logger.generation('Image Creation', { viewType: 'elevation-north', status: 'pending' });
```

### 3. DNA Operations
```javascript
logger.dna('Validating', { dimensions: '15x10x7', floors: 2 });
logger.dna('Prompt generated', { viewType: 'floor-plan', length: 1500 });
```

### 4. Workflow Stages
```javascript
logger.workflow('A1 Sheet Generation', { stage: 'layout', progress: '50%' });
logger.workflow('Consistency Check', { score: 0.98, passed: true });
```

---

## Performance Features

### 1. Log Grouping
```javascript
logger.group('🎨 Generating 13 Views');
  logger.info('Starting floor plan');
  logger.info('Starting elevations');
  logger.info('Starting 3D views');
logger.groupEnd();
```

### 2. Performance Timing
```javascript
logger.time('DNA Generation');
const dna = await generateDNA();
logger.timeEnd('DNA Generation'); // Logs: DNA Generation: 1250ms
```

### 3. Table Output
```javascript
logger.table(views.map(v => ({
  type: v.type,
  status: v.status,
  retries: v.retries
})));
```

---

## Service-Specific Examples

### togetherAIService.js
```javascript
// BEFORE
console.log(`🎨 [FLUX] Generating image for ${viewType}...`);

// AFTER
logger.generation('FLUX Image Generation', {
  viewType,
  model: 'FLUX.1-dev',
  dimensions: `${width}x${height}`
});
```

### dnaWorkflowOrchestrator.js
```javascript
// BEFORE
console.log('🧬 [DNA Workflow] Starting A1 sheet workflow...');

// AFTER
logger.workflow('DNA Workflow', {
  mode: 'A1 sheet',
  stage: 'initialization'
});
```

### secureApiClient.js
```javascript
// BEFORE
console.log(`Making ${method} request to ${endpoint}`);

// AFTER
logger.api(method, endpoint, {
  hasAuth: !!headers.Authorization,
  bodySize: body ? body.length : 0
});
```

---

## Migration Priority

### 🔴 High Priority (Update First)
1. **Error logs** - Replace all `console.error` with `logger.error`
2. **API calls** - Use `logger.api()` for all HTTP requests
3. **Generation workflow** - Use `logger.generation()` and `logger.workflow()`

### 🟡 Medium Priority
1. **Debug logs** - Replace debugging `console.log` with `logger.debug`
2. **Warnings** - Replace `console.warn` with `logger.warn`
3. **Info logs** - Key events with `logger.info`

### 🟢 Low Priority
1. **Trace logs** - Verbose logging with `logger.trace`
2. **Development-only logs** - Keep as `logger.debug` or remove

---

## Automated Migration Script

```bash
# Find all console.log occurrences
grep -r "console\\.log" src/ --include="*.js" --include="*.jsx"

# Find all console.error occurrences
grep -r "console\\.error" src/ --include="*.js" --include="*.jsx"

# Count total occurrences
grep -r "console\\." src/ --include="*.js" --include="*.jsx" | wc -l
```

### Semi-Automated Replacement (Use with caution!)
```bash
# Replace console.log with logger.info (review each change!)
# DON'T run this - just an example of how to approach it
find src/ -name "*.js" -exec sed -i 's/console\.log/logger.info/g' {} +
```

**⚠️ WARNING**: Don't run automated replacements without review! Some console.logs may need different log levels or may be in error handlers.

---

## Best Practices

### 1. Use Appropriate Log Levels
```javascript
// ❌ DON'T
logger.error('User clicked button'); // Not an error!

// ✅ DO
logger.info('User clicked generate button');
```

### 2. Include Context
```javascript
// ❌ DON'T
logger.error('Generation failed');

// ✅ DO
logger.error('Generation failed', {
  projectId,
  viewType,
  error: error.message,
  retryCount
});
```

### 3. Avoid Logging Sensitive Data
```javascript
// ❌ DON'T
logger.debug('API response', { data, apiKey }); // Never log API keys!

// ✅ DO
logger.debug('API response', {
  status: response.status,
  dataSize: data.length
});
```

### 4. Use Structured Data
```javascript
// ❌ DON'T
logger.info(`Generated ${count} views in ${duration}ms`);

// ✅ DO
logger.info('Views generated', {
  count,
  duration,
  avgDuration: duration / count
});
```

---

## Testing Logger

```javascript
import logger from './utils/logger';

// Test all levels
logger.error('Test error', { test: true });
logger.warn('Test warning', { test: true });
logger.info('Test info', { test: true });
logger.debug('Test debug', { test: true });
logger.trace('Test trace', { test: true });

// Get recent logs
const recent = logger.getRecentLogs(5);
console.log('Recent logs:', recent);

// Export all logs
const exported = logger.exportLogs();
console.log('Exported logs:', exported);
```

---

## Environment Configuration

### Development
```bash
# .env
REACT_APP_LOG_LEVEL=DEBUG
```

### Production
```bash
# .env.production
REACT_APP_LOG_LEVEL=ERROR
```

### Testing
```bash
# .env.test
REACT_APP_LOG_LEVEL=WARN
```

---

## Troubleshooting

### "Logger not showing logs"
- Check log level: `logger.setLogLevel('DEBUG')`
- Verify not silenced: `logger.unsilence()`
- Check environment: Development shows more logs

### "Too many logs in production"
- Set `REACT_APP_LOG_LEVEL=ERROR` in production
- Remove or convert `console.log` to `logger.debug`

### "Need to export logs for debugging"
```javascript
// Export logs
const logs = logger.exportLogs();

// Download as file
const blob = new Blob([logs], { type: 'text/plain' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = 'architect-ai-logs.txt';
link.click();
```

---

## Progress Tracking

Total console.* statements found: **1,182**

### Migration Progress
- [ ] Core services (40+ files)
- [ ] Components (20+ files)
- [ ] Utilities (12 files)
- [ ] Server.js

### Estimated Time
- **High priority** (errors & API): 2-3 hours
- **Medium priority** (workflow & debug): 3-4 hours
- **Low priority** (trace & cleanup): 1-2 hours
- **Total**: 6-9 hours

---

## Example: Complete Service Migration

### Before (secureApiClient.js)
```javascript
async openaiChat(params) {
  console.log('Calling OpenAI chat API...');
  try {
    const response = await this.makeRequest('/api/openai/chat', {
      method: 'POST',
      body: JSON.stringify(params)
    });
    console.log('OpenAI response received');
    return response;
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
}
```

### After (secureApiClient.js)
```javascript
import logger from './utils/logger';
import { APIError } from './utils/errors';

async openaiChat(params) {
  logger.api('POST', '/api/openai/chat', {
    model: params.model,
    messageCount: params.messages?.length
  });

  try {
    const response = await this.makeRequest('/api/openai/chat', {
      method: 'POST',
      body: JSON.stringify(params)
    });

    logger.info('OpenAI response received', {
      model: params.model,
      tokensUsed: response.usage?.total_tokens
    });

    return response;
  } catch (error) {
    const apiError = new APIError(
      'OpenAI API call failed',
      error.statusCode || 500,
      { service: 'OpenAI', endpoint: '/api/openai/chat' }
    );

    logger.error('OpenAI API error', {
      error: apiError.message,
      statusCode: apiError.statusCode,
      model: params.model
    });

    throw apiError;
  }
}
```

---

**Next Steps**:
1. Review this guide
2. Start with high-priority files (errors and API calls)
3. Test thoroughly after migration
4. Monitor production logs to verify proper log levels

**Questions?** Check `src/utils/logger.js` for full implementation details.