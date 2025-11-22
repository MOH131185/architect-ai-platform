# ARCHIAI SOLUTION - Logo Placement Guide

## 📍 Logo Files Location

All logo files are located in: `public/logo/`

### Available Logo Variants

1. **logo-light.svg** (200×200px)
   - **Use for**: Dark backgrounds, navbar, hero section
   - **Best for**: Primary logo display

2. **logo-dark.svg** (200×200px)
   - **Use for**: Light backgrounds
   - **Best for**: Alternative color scheme

3. **logo-monochrome.svg** (200×200px)
   - **Use for**: Print, single-color applications
   - **Best for**: Monochrome contexts

4. **logo-full.svg** (400×120px)
   - **Use for**: Full branding with text
   - **Best for**: Marketing materials, headers

5. **favicon.svg** (32×32px)
   - **Use for**: Browser tab icon
   - **Location**: `public/favicon.svg`

## 🎯 Usage Examples

### In React Components

```jsx
// Navbar Logo
<img src="/logo/logo-light.svg" alt="ARCHIAI SOLUTION" className="h-8 w-8" />

// Hero Section Logo
<img src="/logo/logo-light.svg" alt="ARCHIAI SOLUTION" className="w-24 h-24" />

// Full Logo with Text
<img src="/logo/logo-full.svg" alt="ARCHIAI SOLUTION" className="h-12" />
```

### In HTML

```html
<!-- Favicon -->
<link rel="icon" href="/logo/logo-light.svg" type="image/svg+xml" />

<!-- Apple Touch Icon -->
<link rel="apple-touch-icon" href="/logo/logo-light.svg" />
```

## 📐 Recommended Sizes

- **Navbar**: 32px × 32px (h-8 w-8)
- **Hero Section**: 96px × 96px (h-24 w-24)
- **Favicon**: 32px × 32px
- **App Icon**: 512px × 512px (generate PNG from SVG)

## 🎨 Logo Design Elements

**Inspired by isometric architectural blueprints and technical drawings:**

- **Isometric 3D Building**: Modern architectural structure with detailed windows and facades
- **Blueprint Roll**: Rolled architectural drawing with grid lines, representing traditional drafting
- **AI Neural Network Nodes**: Connected sparkles representing artificial intelligence
- **Architectural Compass**: Drafting tool accent symbolizing precision and design
- **Blue Gradient**: Professional brand colors (#3B82F6 to #1E40AF)
- **Technical Aesthetic**: Clean, professional look matching architectural standards

## 🔄 Generating PNG Versions

To create PNG versions for app icons:

1. Open `logo-light.svg` in a vector editor (Illustrator, Figma, Inkscape)
2. Export at these sizes:
   - 192×192px → `logo192.png`
   - 512×512px → `logo512.png`
   - 1024×1024px → `app-icon.png`

Or use online tools:
- https://convertio.co/svg-png/
- https://cloudconvert.com/svg-to-png

## ✅ Current Implementation

- ✅ Favicon: `public/favicon.svg`
- ✅ HTML favicon link: Updated in `public/index.html`
- ✅ Landing page logo: Updated to `/logo/logo-light.svg`
- ✅ Manifest.json: Updated to use SVG logos

## 📝 Notes

- All logos are SVG format for scalability
- Logos use blue gradient (#007AFF to #0051D5)
- Logo includes architectural grid pattern
- Logo includes geometric "A" symbol for AI
- Logo is minimal and futuristic

