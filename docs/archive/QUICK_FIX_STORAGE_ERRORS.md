# Quick Fix: Storage Quota Errors

## Symptoms

- ❌ "QuotaExceededError" in console
- ❌ "Design not found in history" when using AI Modify
- ❌ Designs not saving after generation
- ❌ Storage usage above 70%

## Quick Solutions

### Option 1: Use Storage Management UI (Recommended)

1. Open your browser to: `http://localhost:3000/clear-storage.html`
2. Click **"Cleanup Old Items (50%)"** to free space
3. Refresh your app and try again

### Option 2: Clear Design History Only

1. Open: `http://localhost:3000/clear-storage.html`
2. Click **"Clear Design History Only"**
3. This removes all old designs but keeps other settings

### Option 3: Browser Console (Advanced)

Open browser console (F12) and run:

```javascript
// Clear design history
localStorage.removeItem('archiAI_design_history');

// Or clear all ArchiAI storage
Object.keys(localStorage)
  .filter(k => k.startsWith('archiAI_'))
  .forEach(k => localStorage.removeItem(k));

// Refresh page
location.reload();
```

## Prevention

The app now automatically:
- ✅ Strips large images before storage (97% size reduction)
- ✅ Compresses design data (90% reduction)
- ✅ Keeps only 5 most recent designs
- ✅ Cleans up old items when quota exceeded

**You should rarely see these errors after the fix!**

## Still Having Issues?

1. Check storage usage: `http://localhost:3000/clear-storage.html`
2. If usage > 80%, click "Clear ALL ArchiAI Storage"
3. If issues persist, check browser console for other errors
4. Try a different browser (Chrome, Firefox, Edge all have 5-10MB localStorage)

## Technical Details

See `STORAGE_QUOTA_FIX_SUMMARY.md` for complete technical documentation.

## Need Help?

- Check browser console (F12) for detailed error messages
- Run test suite: `node test-storage-quota-fix.js`
- Review `STORAGE_QUOTA_FIX.md` for troubleshooting

