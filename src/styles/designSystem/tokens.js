/**
 * ArchitectAI Design System Tokens
 *
 * A comprehensive design token system inspired by Apple, Linear, Vercel, and Figma
 * with architectural-themed branding using Royal Blue as the primary color.
 */

// =============================================================================
// COLOR PALETTE
// =============================================================================

export const colors = {
  // Brand - Royal Blue Family
  brand: {
    50: '#E8EEFF',
    100: '#C4D4FF',
    200: '#9DB5FF',
    300: '#7696FF',
    400: '#4F77FF',
    500: '#2962FF', // Primary brand color
    600: '#1E4FDB',
    700: '#143CB7',
    800: '#0A2993',
    900: '#001970',
  },

  // Neutral - Gray Scale
  gray: {
    50: '#FAFAFA',
    100: '#F4F4F5',
    200: '#E4E4E7',
    300: '#D4D4D8',
    400: '#A1A1AA',
    500: '#71717A',
    600: '#52525B',
    700: '#3F3F46',
    800: '#27272A',
    900: '#18181B',
    950: '#09090B',
  },

  // Semantic Colors
  success: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
  },

  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
  },

  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
  },

  info: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
  },

  // Background Colors
  background: {
    primary: '#FFFFFF',
    secondary: '#FAFAFA',
    tertiary: '#F4F4F5',
    inverse: '#18181B',
  },

  // Text Colors
  text: {
    primary: '#18181B',
    secondary: '#52525B',
    tertiary: '#71717A',
    muted: '#A1A1AA',
    inverse: '#FFFFFF',
    brand: '#2962FF',
  },

  // Border Colors
  border: {
    default: '#E4E4E7',
    subtle: '#F4F4F5',
    strong: '#D4D4D8',
    focus: '#2962FF',
  },
};

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  // Font Families
  fontFamily: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    display: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },

  // Font Sizes with Line Heights
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],       // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }],   // 14px
    base: ['1rem', { lineHeight: '1.5rem' }],      // 16px
    lg: ['1.125rem', { lineHeight: '1.75rem' }],   // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }],    // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }],     // 24px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],  // 36px
    '5xl': ['3rem', { lineHeight: '1' }],          // 48px
    '6xl': ['3.75rem', { lineHeight: '1' }],       // 60px
    '7xl': ['4.5rem', { lineHeight: '1' }],        // 72px
  },

  // Font Weights
  fontWeight: {
    thin: '100',
    extralight: '200',
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  },

  // Letter Spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
};

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
  36: '9rem',       // 144px
  40: '10rem',      // 160px
  44: '11rem',      // 176px
  48: '12rem',      // 192px
  52: '13rem',      // 208px
  56: '14rem',      // 224px
  60: '15rem',      // 240px
  64: '16rem',      // 256px
  72: '18rem',      // 288px
  80: '20rem',      // 320px
  96: '24rem',      // 384px
};

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const borderRadius = {
  none: '0',
  sm: '0.25rem',    // 4px
  DEFAULT: '0.5rem', // 8px
  md: '0.5rem',     // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  '2xl': '1.25rem', // 20px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
};

// =============================================================================
// SHADOWS
// =============================================================================

export const shadows = {
  // Elevation shadows (Apple-style)
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  DEFAULT: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  none: 'none',

  // Brand color shadows
  brand: {
    sm: '0 4px 14px 0 rgba(41, 98, 255, 0.15)',
    DEFAULT: '0 8px 24px 0 rgba(41, 98, 255, 0.2)',
    lg: '0 12px 32px 0 rgba(41, 98, 255, 0.25)',
  },

  // Soft shadows (for cards - Vercel/Linear style)
  soft: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.04)',
    DEFAULT: '0 2px 20px rgba(0, 0, 0, 0.08)',
    md: '0 4px 30px rgba(0, 0, 0, 0.08)',
    lg: '0 8px 40px rgba(0, 0, 0, 0.12)',
  },
};

// =============================================================================
// TRANSITIONS & ANIMATIONS
// =============================================================================

export const transitions = {
  // Durations
  duration: {
    75: '75ms',
    100: '100ms',
    150: '150ms',
    200: '200ms',
    300: '300ms',
    500: '500ms',
    700: '700ms',
    1000: '1000ms',
  },

  // Timing functions (easing)
  easing: {
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    // Apple-style bounce
    bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    // Smooth deceleration
    smooth: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    // Spring-like
    spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },
};

// =============================================================================
// Z-INDEX
// =============================================================================

export const zIndex = {
  0: '0',
  10: '10',
  20: '20',
  30: '30',
  40: '40',
  50: '50',
  dropdown: '1000',
  sticky: '1020',
  fixed: '1030',
  modalBackdrop: '1040',
  modal: '1050',
  popover: '1060',
  tooltip: '1070',
  toast: '1080',
};

// =============================================================================
// BREAKPOINTS
// =============================================================================

export const breakpoints = {
  xs: '475px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// =============================================================================
// COMPONENT-SPECIFIC TOKENS
// =============================================================================

export const components = {
  // Button tokens
  button: {
    paddingX: {
      sm: spacing[3],
      md: spacing[4],
      lg: spacing[6],
    },
    paddingY: {
      sm: spacing[1.5],
      md: spacing[2],
      lg: spacing[3],
    },
    fontSize: {
      sm: typography.fontSize.sm[0],
      md: typography.fontSize.sm[0],
      lg: typography.fontSize.base[0],
    },
    borderRadius: borderRadius.lg,
  },

  // Card tokens
  card: {
    padding: spacing[6],
    borderRadius: borderRadius.xl,
    shadow: shadows.soft.DEFAULT,
  },

  // Input tokens
  input: {
    paddingX: spacing[3],
    paddingY: spacing[2.5],
    borderRadius: borderRadius.lg,
    fontSize: typography.fontSize.sm[0],
  },

  // Modal tokens
  modal: {
    padding: spacing[6],
    borderRadius: borderRadius['2xl'],
    maxWidth: {
      sm: '400px',
      md: '500px',
      lg: '640px',
      xl: '768px',
      full: '100%',
    },
  },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get a color value by path
 * @param {string} path - e.g., 'brand.500' or 'gray.100'
 * @returns {string} Color value
 */
export function getColor(path) {
  const keys = path.split('.');
  let value = colors;
  for (const key of keys) {
    value = value[key];
    if (!value) return undefined;
  }
  return value;
}

/**
 * Create a CSS custom property reference
 * @param {string} name - Property name without --
 * @returns {string} CSS var() reference
 */
export function cssVar(name) {
  return `var(--${name})`;
}

// =============================================================================
// CSS CUSTOM PROPERTIES (for use in CSS files)
// =============================================================================

export const cssVariables = `
  /* Brand Colors */
  --brand-50: ${colors.brand[50]};
  --brand-100: ${colors.brand[100]};
  --brand-200: ${colors.brand[200]};
  --brand-300: ${colors.brand[300]};
  --brand-400: ${colors.brand[400]};
  --brand-500: ${colors.brand[500]};
  --brand-600: ${colors.brand[600]};
  --brand-700: ${colors.brand[700]};
  --brand-800: ${colors.brand[800]};
  --brand-900: ${colors.brand[900]};

  /* Gray Scale */
  --gray-50: ${colors.gray[50]};
  --gray-100: ${colors.gray[100]};
  --gray-200: ${colors.gray[200]};
  --gray-300: ${colors.gray[300]};
  --gray-400: ${colors.gray[400]};
  --gray-500: ${colors.gray[500]};
  --gray-600: ${colors.gray[600]};
  --gray-700: ${colors.gray[700]};
  --gray-800: ${colors.gray[800]};
  --gray-900: ${colors.gray[900]};

  /* Semantic Colors */
  --success: ${colors.success[500]};
  --warning: ${colors.warning[500]};
  --error: ${colors.error[500]};
  --info: ${colors.info[500]};

  /* Background */
  --bg-primary: ${colors.background.primary};
  --bg-secondary: ${colors.background.secondary};
  --bg-tertiary: ${colors.background.tertiary};

  /* Text */
  --text-primary: ${colors.text.primary};
  --text-secondary: ${colors.text.secondary};
  --text-tertiary: ${colors.text.tertiary};
  --text-muted: ${colors.text.muted};

  /* Borders */
  --border-default: ${colors.border.default};
  --border-subtle: ${colors.border.subtle};
  --border-strong: ${colors.border.strong};

  /* Shadows */
  --shadow-soft: ${shadows.soft.DEFAULT};
  --shadow-soft-lg: ${shadows.soft.lg};
  --shadow-brand: ${shadows.brand.DEFAULT};

  /* Transitions */
  --ease-smooth: ${transitions.easing.smooth};
  --ease-bounce: ${transitions.easing.bounce};
`;

export default {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  transitions,
  zIndex,
  breakpoints,
  components,
};
