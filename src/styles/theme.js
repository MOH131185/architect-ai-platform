/**
 * Deepgram-Inspired Design System Theme
 * 
 * Core design tokens for ArchitectAI platform
 * Premium, cinematic, architectural aesthetic
 */

export const theme = {
  colors: {
    // Primary palette - Navy to Royal Blue gradient
    navy: {
      950: '#0a0e27',
      900: '#0f172a',
      800: '#1e293b',
      700: '#334155',
      600: '#475569',
      500: '#64748b',
    },
    royal: {
      600: '#2563eb',
      500: '#3b82f6',
      400: '#60a5fa',
      300: '#93c5fd',
    },
    // Neutrals
    white: '#ffffff',
    black: '#000000',
    gray: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
    // Accent colors
    accent: {
      blue: '#3b82f6',
      cyan: '#06b6d4',
      purple: '#8b5cf6',
      green: '#10b981',
      amber: '#f59e0b',
      red: '#ef4444',
    },
    // Gradients
    gradients: {
      primary: 'linear-gradient(135deg, #0a0e27 0%, #1e293b 50%, #2563eb 100%)',
      secondary: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
      accent: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #60a5fa 100%)',
      royal: 'linear-gradient(135deg, #1e293b 0%, #2563eb 100%)',
      glass: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
      border: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 50%, #93c5fd 100%)',
      glow: 'linear-gradient(135deg, rgba(37,99,235,0.3) 0%, rgba(59,130,246,0.2) 100%)',
    },
  },

  typography: {
    fonts: {
      heading: '"Space Grotesk", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      body: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      mono: '"Geist Mono", "Fira Code", "Courier New", monospace',
    },
    sizes: {
      xs: '0.75rem',      // 12px
      sm: '0.875rem',     // 14px
      base: '1rem',       // 16px
      lg: '1.125rem',     // 18px
      xl: '1.25rem',      // 20px
      '2xl': '1.5rem',    // 24px
      '3xl': '1.875rem',  // 30px
      '4xl': '2.25rem',   // 36px
      '5xl': '3rem',      // 48px
      '6xl': '3.75rem',   // 60px
      '7xl': '4.5rem',    // 72px
      '8xl': '6rem',      // 96px
      '9xl': '8rem',      // 128px
    },
    weights: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
    lineHeights: {
      tight: 1.2,
      snug: 1.375,
      normal: 1.5,
      relaxed: 1.625,
      loose: 2,
    },
  },

  spacing: {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
    20: '5rem',     // 80px
    24: '6rem',     // 96px
    32: '8rem',     // 128px
    40: '10rem',    // 160px
    48: '12rem',    // 192px
    56: '14rem',    // 224px
    64: '16rem',    // 256px
  },

  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    glow: '0 0 20px rgba(37, 99, 235, 0.3), 0 0 40px rgba(37, 99, 235, 0.1)',
    glowLarge: '0 0 40px rgba(37, 99, 235, 0.4), 0 0 80px rgba(37, 99, 235, 0.2)',
  },

  borderRadius: {
    none: '0',
    sm: '0.125rem',   // 2px
    base: '0.25rem',  // 4px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    '2xl': '1rem',    // 16px
    '3xl': '1.5rem',  // 24px
    full: '9999px',
  },

  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    medium: '400ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '800ms cubic-bezier(0.4, 0, 0.2, 1)',
    smooth: '600ms cubic-bezier(0.16, 1, 0.3, 1)',
  },

  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    fixed: 1200,
    modalBackdrop: 1300,
    modal: 1400,
    popover: 1500,
    tooltip: 1600,
  },

  effects: {
    blur: {
      sm: 'blur(4px)',
      base: 'blur(8px)',
      md: 'blur(12px)',
      lg: 'blur(16px)',
      xl: 'blur(24px)',
    },
    glass: {
      light: 'rgba(255, 255, 255, 0.1)',
      base: 'rgba(255, 255, 255, 0.05)',
      dark: 'rgba(0, 0, 0, 0.1)',
    },
  },
};

// CSS Variables export for use in CSS files
export const cssVariables = `
  :root {
    /* Colors */
    --color-navy-950: ${theme.colors.navy[950]};
    --color-navy-900: ${theme.colors.navy[900]};
    --color-navy-800: ${theme.colors.navy[800]};
    --color-navy-700: ${theme.colors.navy[700]};
    --color-royal-600: ${theme.colors.royal[600]};
    --color-royal-500: ${theme.colors.royal[500]};
    --color-royal-400: ${theme.colors.royal[400]};
    --color-white: ${theme.colors.white};
    --color-black: ${theme.colors.black};
    
    /* Gradients */
    --gradient-primary: ${theme.colors.gradients.primary};
    --gradient-secondary: ${theme.colors.gradients.secondary};
    --gradient-accent: ${theme.colors.gradients.accent};
    --gradient-royal: ${theme.colors.gradients.royal};
    --gradient-glass: ${theme.colors.gradients.glass};
    --gradient-border: ${theme.colors.gradients.border};
    --gradient-glow: ${theme.colors.gradients.glow};
    
    /* Typography */
    --font-heading: ${theme.typography.fonts.heading};
    --font-body: ${theme.typography.fonts.body};
    --font-mono: ${theme.typography.fonts.mono};
    
    /* Shadows */
    --shadow-sm: ${theme.shadows.sm};
    --shadow-base: ${theme.shadows.base};
    --shadow-md: ${theme.shadows.md};
    --shadow-lg: ${theme.shadows.lg};
    --shadow-xl: ${theme.shadows.xl};
    --shadow-2xl: ${theme.shadows['2xl']};
    --shadow-glow: ${theme.shadows.glow};
    --shadow-glow-large: ${theme.shadows.glowLarge};
    
    /* Transitions */
    --transition-fast: ${theme.transitions.fast};
    --transition-base: ${theme.transitions.base};
    --transition-medium: ${theme.transitions.medium};
    --transition-slow: ${theme.transitions.slow};
    --transition-smooth: ${theme.transitions.smooth};
    
    /* Effects */
    --blur-sm: ${theme.effects.blur.sm};
    --blur-base: ${theme.effects.blur.base};
    --blur-md: ${theme.effects.blur.md};
    --blur-lg: ${theme.effects.blur.lg};
  }
`;

export default theme;

