# Storage Quota Fix

## Problem
The application was hitting localStorage quota limits (71% usage with just 1 design), causing:
- Failed design saves after generation
- "Design not found" errors in AI Modify workflow
- QuotaExceededError exceptions

## Root Causes

1. **Large Data URLs**: Base64-encoded A1 sheet images (10-20MB) were being stored
2. **Verbose Master DNA**: Full DNA objects with extensive descriptions were stored
3. **Unlimited History**: No limit on number of designs stored
4. **Insufficient Cleanup**: Only 20% of items removed during cleanup

## Solutions Implemented

### 1. Data URL Stripping (`designHistoryService.js`)
- All data URLs are now stripped before storage
- Replaced with metadata placeholders: `[DATA_URL_REMOVED_XXXkb]`
- Applies to:
  - A1 sheet URLs (`resultUrl`, `a1SheetUrl`)
  - Site snapshot data URLs
  - Any version URLs

### 2. Master DNA Compression (`designHistoryService.js`)
- New `compressMasterDNA()` method removes verbose fields
- Keeps only essential data:
  - Dimensions (full)
  - Top 5 materials only
  - Room names/dimensions (removes verbose features)
  - View-specific features (full)
  - Top 10 consistency rules only
- Reduces DNA size by ~60-70%

### 3. History Size Limit (`designHistoryService.js`)
- Maximum 5 designs stored at any time
- Automatically removes oldest designs when limit exceeded
- Sorts by `updatedAt` timestamp (keeps most recent)

### 4. Aggressive Cleanup (`storageManager.js`)
- Cleanup now removes 50% of items (was 20%)
- More effective at freeing space during quota errors
- Still preserves the key being saved

### 5. Storage Management Utility (`public/clear-storage.html`)
- User-friendly HTML page for manual storage management
- Features:
  - View storage stats (items, size, usage %)
  - List all items by size
  - Cleanup old items (50%)
  - Clear design history only
  - Clear all ArchiAI storage
- Access at: `http://localhost:3000/clear-storage.html`

## Usage

### For Users

If you encounter storage quota errors:

1. **Quick Fix**: Open `http://localhost:3000/clear-storage.html` in your browser
2. Click "Cleanup Old Items (50%)" to free space
3. Or click "Clear Design History Only" to remove all old designs

### For Developers

The fixes are automatic and require no code changes:

```javascript
// Design creation now automatically:
// 1. Strips data URLs
// 2. Compresses master DNA
// 3. Limits history to 5 designs
// 4. Triggers aggressive cleanup on quota errors

await designHistoryService.createDesign({
  designId: 'design_seed_123',
  masterDNA: largeDNA, // Will be compressed
  resultUrl: 'data:image/png;base64,...', // Will be stripped
  // ... other params
});
```

## Storage Estimates

### Before Fix
- Single design: ~3.6 MB (with data URLs)
- 2 designs: ~7.2 MB (exceeds 5-10MB limit)
- Usage: 71% with 1 design

### After Fix
- Single design: ~50-100 KB (without data URLs, compressed DNA)
- 5 designs: ~250-500 KB
- Usage: ~5-10% with 5 designs

## Migration

Existing designs with large data URLs will be automatically migrated:
1. On next save, old designs are removed (keeping only 5 most recent)
2. Data URLs are stripped from all designs
3. Master DNA is compressed

No manual migration required.

## Testing

Run the storage test to verify fixes:

```bash
node test-storage-fix.js
```

Expected output: All tests pass, storage usage < 20%

## Known Limitations

1. **No Image Storage**: A1 sheet images are NOT stored in localStorage
   - Only metadata is stored
   - Images must be re-generated or stored externally (e.g., IndexedDB, server)

2. **Compressed DNA**: Some verbose DNA fields are removed
   - Sufficient for AI Modify consistency lock
   - Full DNA available in memory during generation

3. **5 Design Limit**: Only 5 most recent designs kept
   - Older designs automatically removed
   - Export designs before they're removed if needed

## Future Improvements

1. **IndexedDB Migration**: Move to IndexedDB for larger storage (50MB+)
2. **Server-Side Storage**: Store designs on server with user accounts
3. **Selective Image Storage**: Store thumbnails only, not full-res images
4. **Compression**: Use LZ-string or similar for text compression

## Related Files

- `src/utils/storageManager.js` - Storage wrapper with quota handling
- `src/services/designHistoryService.js` - Design storage with compression
- `public/clear-storage.html` - User-facing storage management utility
- `test-storage-fix.js` - Test suite for storage fixes

## See Also

- `A1_MODIFY_STORAGE_FIX.md` - Previous array storage fix
- `CLEAR_DESIGN_HISTORY.html` - Legacy storage clear utility (replaced)

