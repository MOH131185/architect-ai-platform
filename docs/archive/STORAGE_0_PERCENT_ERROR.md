# Storage 0% Usage Error - Diagnosis and Fix

## Error Message You're Seeing

```
Modification failed: Failed to create design entry for design_XXXXX
Failed to save design to storage. Storage usage: 0%
```

## What This Means

This error is **different** from a "storage full" error. The 0% usage means:

- ✅ There IS plenty of storage space available
- ❌ BUT browser is BLOCKING storage writes
- 🔒 Usually a **permissions** or **security** issue

Common causes:
1. **Private/Incognito mode** - Some browsers restrict localStorage in private windows
2. **Browser security settings** - Storage disabled for localhost or all sites
3. **Browser extension** - Privacy/security extension blocking storage
4. **Corrupted storage** - Browser storage in invalid state
5. **File:// protocol** - Storage doesn't work with file:// URLs (need http://)

## Step-by-Step Diagnosis

### Step 1: Run Full Diagnostic

1. Open browser DevTools: Press **F12**
2. Go to **Console** tab
3. Open the file: `BROWSER_STORAGE_DIAGNOSTIC.js`
4. Copy **entire contents** and paste into console
5. Press **Enter**

The diagnostic will show you:
- ✅ If localStorage is available
- ✅ If writes/reads work
- ❌ Specific error type (SecurityError, etc.)
- 💡 Recommended solution for your browser

### Step 2: Check What the Diagnostic Shows

#### ✅ If diagnostic shows "localStorage is NOT available"
**Cause**: localStorage is completely disabled or unavailable
**Solution**:
- Check if you're on file:// URL → Use http://localhost:3000
- Check browser settings (see Solution 1 below)

#### ❌ If diagnostic shows "SecurityError"
**Cause**: Browser security policy is blocking storage
**Solution**:
- Check if in Private/Incognito mode → Use regular window
- Check browser security settings (see Solution 2 below)
- Check browser extensions (see Solution 3 below)

#### ❌ If diagnostic shows "QuotaExceededError"
**Cause**: Storage is actually full (diagnostic is more accurate than 0%)
**Solution**: Clear old designs (see Solution 4 below)

#### ❌ If diagnostic shows "InvalidStateError"
**Cause**: Storage is corrupted
**Solution**: Clear browser cache (see Solution 5 below)

---

## Solutions

### Solution 1: Check Browser Access Mode

**Are you in Private/Incognito mode?**

Check the browser window:
- Chrome: Look for "Incognito" icon (person with hat)
- Firefox: Look for purple mask icon
- Edge: Look for "InPrivate" text
- Safari: URL bar is dark gray

**Fix**: Open a **regular** browser window:
1. Close private window
2. Open new regular window: `Ctrl+N` (or `Cmd+N` on Mac)
3. Navigate to: `http://localhost:3000`
4. Try modification again

---

### Solution 2: Enable Storage in Browser Settings

#### Chrome/Edge:
1. Click the **padlock** or **info** icon in URL bar
2. Click "Site settings" or "Permissions"
3. Find "Cookies and site data"
4. Change to **"Allow"**

**Or via global settings:**
1. Chrome Settings (chrome://settings)
2. Privacy and security → Site Settings
3. Cookies and site data
4. Under "Sites that can always use cookies" → Add
5. Add: `http://localhost:3000`

#### Firefox:
1. Click the **shield** icon in URL bar
2. Turn OFF "Enhanced Tracking Protection" for this site

**Or via global settings:**
1. Firefox Settings (about:preferences)
2. Privacy & Security
3. Under "Cookies and Site Data":
   - Select "Standard" (not "Strict")
4. Click "Manage Exceptions"
5. Add: `http://localhost:3000` → Allow

#### Safari:
1. Safari → Preferences → Privacy
2. **Uncheck** "Prevent cross-site tracking"
3. **Uncheck** "Block all cookies"
4. Close and reopen Safari

---

### Solution 3: Check Browser Extensions

Privacy/security extensions can block localStorage:
- Privacy Badger
- uBlock Origin
- Ghostery
- DuckDuckGo Privacy Essentials
- Any VPN extensions

**Fix**:
1. Open browser Extensions page:
   - Chrome: `chrome://extensions`
   - Firefox: `about:addons`
   - Edge: `edge://extensions`
2. **Disable** privacy/security extensions temporarily
3. Refresh page: `F5`
4. Try modification again
5. If it works, re-enable extensions one-by-one to find the culprit
6. Add localhost exception in that extension's settings

---

### Solution 4: Clear Browser Storage (Nuclear Option)

If nothing else works:

```javascript
// In browser console (F12 → Console tab):

// 1. Check what's in storage
console.log('Storage keys:', Object.keys(localStorage));

// 2. Backup if needed (downloads JSON file)
const backup = {};
Object.keys(localStorage).forEach(k => backup[k] = localStorage.getItem(k));
const blob = new Blob([JSON.stringify(backup)], {type: 'application/json'});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'storage-backup-' + Date.now() + '.json';
a.click();

// 3. Clear all storage
localStorage.clear();
console.log('Storage cleared');

// 4. Test storage
localStorage.setItem('test', 'works');
console.log('Test:', localStorage.getItem('test'));
localStorage.removeItem('test');
```

Then refresh page and try again.

---

### Solution 5: Reset Browser (Last Resort)

If all else fails:

**Chrome/Edge**:
1. Settings → Privacy and security
2. "Clear browsing data"
3. Time range: "All time"
4. Check: "Cookies and other site data"
5. Click "Clear data"
6. Restart browser

**Firefox**:
1. Settings → Privacy & Security
2. "Clear Data" button
3. Check both options
4. Click "Clear"
5. Restart browser

---

## After Fixing: Verify Storage Works

```javascript
// Run in console to verify:
import('./src/utils/storageManager.js').then(m => {
  const result = m.default.testStorage();
  if (result.success) {
    console.log('✅ Storage is working!');
  } else {
    console.error('❌ Still not working:', result.error);
  }
});
```

---

## Still Not Working?

### Collect Debug Information

Run this in console and save the output:

```javascript
console.log('=== DEBUG INFO ===');
console.log('Browser:', navigator.userAgent);
console.log('Cookies enabled:', navigator.cookieEnabled);
console.log('Protocol:', window.location.protocol);
console.log('Hostname:', window.location.hostname);
console.log('Port:', window.location.port);
console.log('localStorage available:', typeof localStorage !== 'undefined');

if (typeof localStorage !== 'undefined') {
  try {
    localStorage.setItem('debug_test', 'test');
    console.log('Write test: SUCCESS');
    localStorage.removeItem('debug_test');
  } catch (e) {
    console.log('Write test: FAILED');
    console.log('Error name:', e.name);
    console.log('Error message:', e.message);
    console.log('Error code:', e.code);
  }
}
console.log('=== END DEBUG INFO ===');
```

### Try Different Browser

Test in a different browser to isolate the issue:
- If it works in Browser B but not Browser A → Browser A settings issue
- If it fails in all browsers → System-level security software blocking

### Check System Security Software

Some antivirus/security software blocks localStorage:
- McAfee WebAdvisor
- Norton Safe Web
- Kaspersky
- Avast

**Fix**: Add localhost exception in security software settings.

---

## Prevention

Once fixed, ensure it doesn't happen again:

### 1. Always use http://localhost (not file://)
```
✅ http://localhost:3000
❌ file:///C:/path/to/index.html
```

### 2. Whitelist localhost in browser
Add permanent exception in browser settings

### 3. Don't use Private mode for development
localStorage is restricted in private windows

### 4. Check before generating designs
```javascript
// Add this check in your workflow:
if (typeof localStorage === 'undefined' || !navigator.cookieEnabled) {
  alert('Storage is disabled. Enable cookies and try again.');
}
```

---

## Technical Details

### Why 0% Usage Shows

The `getStorageUsage()` calculation:
```javascript
getStorageUsage() {
  let total = 0;
  for (let key in localStorage) {
    if (key.startsWith('archiAI_')) {
      total += localStorage[key].length;
    }
  }
  return Math.round((total / (5 * 1024 * 1024)) * 100);
}
```

Returns 0% when:
- No items have been stored yet (empty storage)
- localStorage exists but writes fail before calculation

### What Happens During Write

1. `storageManager.setItem()` called
2. Data serialized to JSON
3. Try to write: `localStorage.setItem(key, data)`
4. If it throws error:
   - Caught by try/catch
   - Logged to console with detailed error
   - Returns `false` to caller
5. `designHistoryService.createDesign()` checks return value
6. If `false`, throws error: "Failed to save design"

With enhanced logging, you'll now see the **exact error** in console:
- Error name (SecurityError, QuotaExceededError, etc.)
- Error message
- Browser context
- Suggested solutions

---

## Summary

**0% storage usage** = Storage blocked, not full

**Most common fixes:**
1. ✅ Use regular browser window (not incognito)
2. ✅ Enable localStorage in browser settings
3. ✅ Disable privacy extensions temporarily
4. ✅ Use http://localhost (not file://)

**Always run diagnostic first**: `BROWSER_STORAGE_DIAGNOSTIC.js`

---

**Need more help?**
- See `STORAGE_TROUBLESHOOTING.md` for advanced debugging
- Check browser console for detailed error messages
- Report issue with diagnostic output if still stuck
