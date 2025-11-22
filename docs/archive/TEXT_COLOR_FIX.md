# Text Color Visibility Fix

## Issue
Text was set to white globally, making it invisible on white/light backgrounds.

## Solution
Updated CSS to ensure proper contrast:

1. **Removed global white text** from `body` element
2. **Added explicit dark text** for white/light backgrounds:
   - `.bg-white` → dark text (#1F2937)
   - `.bg-gray-50` → dark text
   - `.bg-gray-100` → dark text
3. **Kept white text** for dark backgrounds and glass cards:
   - `.liquid-glass` → white text
   - `.liquid-glass-card` → white text
   - `.dark-bg` → white text

## CSS Rules Added

```css
/* White cards and light backgrounds should have dark text */
.bg-white,
.bg-gray-50,
.bg-gray-100 {
  color: #1F2937 !important; /* gray-800 */
}

/* All child elements inherit dark text */
.bg-white h1, .bg-white h2, .bg-white p, etc. {
  color: #1F2937 !important;
}
```

## Result
- ✅ White text on dark backgrounds (landing page, glass cards)
- ✅ Dark text on white backgrounds (forms, cards, modals)
- ✅ Proper contrast throughout the application

