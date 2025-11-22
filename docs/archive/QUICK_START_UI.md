# ARCHIAI SOLUTION - UI Quick Start Guide

## 🚀 Quick Reference

### Import Components

```jsx
import { GlassCard, GlassButton, GlassNavbar, GlassModal, HeroSection } from './components/ui';
```

### Use CSS Classes

```jsx
// Glass cards
<div className="liquid-glass-card">Content</div>
<div className="liquid-glass-strong">Strong glass</div>

// Buttons
<button className="btn-premium">Primary</button>
<button className="btn-premium-secondary">Secondary</button>

// Typography
<h1 className="premium-title">Title</h1>
<p className="premium-subtitle">Subtitle</p>

// Backgrounds
<div className="animated-bg" />
<div className="architecture-bg" />

// Animations
<div className="animate-fadeInUp">Fade in</div>
<div className="animate-float">Float</div>
```

### Logo Usage

```jsx
// Navbar
<img src="/logo/logo-light.svg" alt="ARCHIAI" className="h-8 w-8" />

// Hero
<img src="/logo/logo-light.svg" alt="ARCHIAI" className="w-24 h-24 logo-float" />

// Full logo
<img src="/logo/logo-full.svg" alt="ARCHIAI SOLUTION" className="h-12" />
```

### Color Tokens

```css
--blue-primary: #007AFF;
--blue-secondary: #0051D5;
--glass-bg: rgba(255, 255, 255, 0.1);
--text-primary: #FFFFFF;
```

### Component Props

**GlassCard**
- `variant`: 'base' | 'strong'
- `hoverable`: boolean
- `onClick`: function

**GlassButton**
- `variant`: 'primary' | 'secondary' | 'ghost'
- `size`: 'sm' | 'md' | 'lg'
- `loading`: boolean
- `disabled`: boolean

**GlassModal**
- `isOpen`: boolean
- `onClose`: function
- `title`: string
- `size`: 'sm' | 'md' | 'lg' | 'xl'

---

## 📍 File Locations

- **Design System**: `src/styles/designSystem/`
- **Components**: `src/components/ui/`
- **CSS**: `src/styles/premium-enhanced.css`
- **Logos**: `public/logo/`

---

## 🎨 Design Tokens

Import from design system:
```typescript
import { colors } from './styles/designSystem/colors';
import { typography } from './styles/designSystem/typography';
import { animations } from './styles/designSystem/animations';
```

---

**Ready to use!** 🎉

