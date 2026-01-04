# Storage Troubleshooting Guide

This guide helps diagnose and fix storage-related issues in the Architect AI Platform, specifically the "Failed to create design entry" error.

## Common Error Messages

### "Modification failed: Failed to create design entry for design_XXXXX"

**Cause**: The design history could not be saved to localStorage, typically due to:
- Storage quota exceeded (localStorage has a ~5-10MB limit per domain)
- Storage disabled in browser settings
- Browser in private/incognito mode with storage restrictions
- Corrupted storage data

## Diagnostic Steps

### Step 1: Check Storage Status in Browser Console

Open the browser developer console (F12) and run:

```javascript
// Import storage manager (if not already available)
import('./src/utils/storageManager.js').then(m => {
  const storage = m.default;

  // Test storage capability
  storage.testStorage();

  // View detailed storage info
  storage.debugStorage();
});
```

This will show:
- Total items stored
- Storage usage percentage
- Size of each stored item
- Whether storage is working

### Step 2: Check for Quota Errors

Look for these messages in the console:
- `💾 Storage quota exceeded, performing cleanup...`
- `⚠️ Item exceeds max size`
- `❌ Failed to store even after cleanup`

### Step 3: Inspect Design History

Check the current design history:

```javascript
import('./src/services/designHistoryService.js').then(m => {
  const history = m.default;
  const designs = history.listDesigns();
  console.log('Designs:', designs);
  console.log('Total:', designs.length);
});
```

## Solutions

### Solution 1: Clear Old Designs

If storage is full, clear old designs:

```javascript
// Open browser console
import('./src/services/designHistoryService.js').then(m => {
  const history = m.default;

  // List all designs
  const designs = history.listDesigns();
  console.log('Found', designs.length, 'designs');

  // Delete oldest designs (keep last 5)
  designs
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(5)
    .forEach(design => {
      history.deleteProject(design.designId);
      console.log('Deleted:', design.designId);
    });
});
```

Or use the provided HTML utility:

```bash
# Open in browser
open CLEAR_DESIGN_HISTORY.html
```

### Solution 2: Manual Storage Cleanup

```javascript
// Clear all architect AI storage
import('./src/utils/storageManager.js').then(m => {
  const storage = m.default;

  // View what will be cleared
  storage.debugStorage();

  // Clear all (WARNING: This deletes ALL designs)
  storage.clearAll();

  // Verify
  console.log('Storage cleared, usage:', storage.getStorageUsage(), '%');
});
```

### Solution 3: Enable Storage in Browser

**Chrome/Edge**:
1. Settings → Privacy and security → Site settings
2. Cookies and site data
3. Ensure "Block third-party cookies" is OFF for this site
4. Check "Sites that can never use cookies" doesn't include your site

**Firefox**:
1. Settings → Privacy & Security
2. Cookies and Site Data
3. Click "Manage Exceptions"
4. Ensure your site is not blocked

**Safari**:
1. Preferences → Privacy
2. Uncheck "Prevent cross-site tracking" for this site

### Solution 4: Check Incognito/Private Mode

localStorage may have reduced capacity in private browsing mode. Try in a regular browser window.

## Preventive Measures

### 1. Enable Automatic Cleanup

The storage manager automatically cleans up old items when quota is exceeded. Verify this is working:

```javascript
// Check cleanup settings
import('./src/utils/storageManager.js').then(m => {
  const storage = m.default;
  console.log('Max items:', storage.maxItems);
  console.log('Max size:', storage.maxSize / 1024 / 1024, 'MB');
});
```

### 2. Monitor Storage Usage

Add periodic checks in your workflow:

```javascript
// Check before generating designs
import('./src/utils/storageManager.js').then(m => {
  const usage = m.default.getStorageUsage();
  if (usage > 80) {
    console.warn('⚠️ Storage is', usage, '% full. Consider clearing old designs.');
  }
});
```

### 3. Export Important Designs

Before clearing storage, export designs you want to keep:

```javascript
import('./src/services/designHistoryService.js').then(m => {
  const history = m.default;

  // Export all designs to JSON
  history.exportHistory();

  // Or export specific design
  history.exportHistory('design_12345');
});
```

## Error Codes Reference

| Error | Cause | Solution |
|-------|-------|----------|
| `Failed to save design to storage. Storage usage: 100%` | Quota exceeded | Clear old designs (Solution 1) |
| `Failed to store even after cleanup` | Storage disabled or restricted | Enable storage (Solution 3) |
| `Storage error: SecurityError` | Incognito mode or blocked | Use regular browsing mode |
| `Failed to create design entry` | Write operation failed | Run diagnostics (Step 1) |

## Advanced Debugging

### Enable Debug Logging

Set environment variable or add to console:

```javascript
localStorage.setItem('DEBUG_STORAGE', 'true');
```

This will log all storage operations with detailed information.

### Check localStorage Directly

```javascript
// View all localStorage keys
console.log('All keys:', Object.keys(localStorage));

// View architect AI keys
console.log('ArchiAI keys:', Object.keys(localStorage).filter(k => k.startsWith('archiAI_')));

// View design history size
const designHistory = localStorage.getItem('archiAI_design_history');
console.log('Design history size:', designHistory ? designHistory.length / 1024 : 0, 'KB');
```

### Verify Data Integrity

```javascript
import('./src/services/designHistoryService.js').then(m => {
  const history = m.default;

  // Get all history
  const allHistory = history.getAllHistory();

  // Check if it's an array
  console.log('Is array:', Array.isArray(allHistory));
  console.log('Length:', allHistory.length);

  // Check for corrupted entries
  allHistory.forEach((entry, index) => {
    if (!entry.designId) {
      console.error('Corrupted entry at index', index, ':', entry);
    }
  });
});
```

## Related Files

- `src/utils/storageManager.js` - Storage management with quota handling
- `src/services/designHistoryService.js` - Design history persistence
- `CLEAR_DESIGN_HISTORY.html` - Utility to manually clear history

## Getting Help

If issues persist after trying these solutions:

1. Export your browser console logs
2. Run `storage.debugStorage()` and save the output
3. Note your browser version and operating system
4. Create an issue at: https://github.com/anthropics/architect-ai-platform/issues

Include:
- Error message
- Storage debug output
- Browser and OS
- Steps to reproduce
