/**
 * Design Tokens
 *
 * Centralized design tokens for consistent UI styling.
 * Defines colors, spacing, typography, shadows, and other visual properties.
 *
 * Version: 1.0.0
 * Last Updated: 2025-10-25
 *
 * @module ui/tokens
 */

/**
 * Color palette
 */
export const colors = {
  // Primary brand colors
  primary: {
    50: '#E3F2FD',
    100: '#BBDEFB',
    200: '#90CAF9',
    300: '#64B5F6',
    400: '#42A5F5',
    500: '#2196F3', // Main primary
    600: '#1E88E5',
    700: '#1976D2',
    800: '#1565C0',
    900: '#0D47A1'
  },

  // Secondary accent colors
  secondary: {
    50: '#F3E5F5',
    100: '#E1BEE7',
    200: '#CE93D8',
    300: '#BA68C8',
    400: '#AB47BC',
    500: '#9C27B0', // Main secondary
    600: '#8E24AA',
    700: '#7B1FA2',
    800: '#6A1B9A',
    900: '#4A148C'
  },

  // Success states
  success: {
    light: '#81C784',
    main: '#4CAF50',
    dark: '#388E3C',
    contrast: '#FFFFFF'
  },

  // Warning states
  warning: {
    light: '#FFB74D',
    main: '#FF9800',
    dark: '#F57C00',
    contrast: '#000000'
  },

  // Error states
  error: {
    light: '#E57373',
    main: '#F44336',
    dark: '#D32F2F',
    contrast: '#FFFFFF'
  },

  // Info states
  info: {
    light: '#64B5F6',
    main: '#2196F3',
    dark: '#1976D2',
    contrast: '#FFFFFF'
  },

  // Neutral grays
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121'
  },

  // Background colors
  background: {
    default: '#FFFFFF',
    paper: '#F5F5F5',
    dark: '#1A1A1A'
  },

  // Text colors
  text: {
    primary: 'rgba(0, 0, 0, 0.87)',
    secondary: 'rgba(0, 0, 0, 0.60)',
    disabled: 'rgba(0, 0, 0, 0.38)',
    hint: 'rgba(0, 0, 0, 0.38)'
  },

  // Architectural theme colors
  architectural: {
    blueprint: '#003D82',
    concrete: '#A8A8A8',
    wood: '#8B4513',
    steel: '#B0C4DE',
    glass: '#E0F7FA'
  }
};

/**
 * Spacing scale (in pixels)
 * Based on 8px grid system
 */
export const spacing = {
  xs: 4,    // 0.5 units
  sm: 8,    // 1 unit
  md: 16,   // 2 units
  lg: 24,   // 3 units
  xl: 32,   // 4 units
  '2xl': 48,  // 6 units
  '3xl': 64,  // 8 units
  '4xl': 96,  // 12 units
  '5xl': 128  // 16 units
};

/**
 * Typography scale
 */
export const typography = {
  // Font families
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
    serif: 'Georgia, "Times New Roman", Times, serif',
    mono: '"Courier New", Courier, monospace',
    architectural: '"Helvetica Neue", Helvetica, Arial, sans-serif'
  },

  // Font sizes
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',    // 24px
    '3xl': '1.875rem',  // 30px
    '4xl': '2.25rem',   // 36px
    '5xl': '3rem',      // 48px
    '6xl': '3.75rem',   // 60px
    '7xl': '4.5rem'     // 72px
  },

  // Font weights
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800
  },

  // Line heights
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2
  },

  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em'
  }
};

/**
 * Border radius
 */
export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  base: '0.25rem',  // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',      // 16px
  '3xl': '1.5rem',    // 24px
  full: '9999px'
};

/**
 * Box shadows
 */
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)'
};

/**
 * Z-index layers
 */
export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070
};

/**
 * Transitions
 */
export const transitions = {
  // Durations
  duration: {
    fast: '150ms',
    base: '300ms',
    slow: '500ms'
  },

  // Easing functions
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)'
  },

  // Preset transitions
  preset: {
    fast: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 500ms cubic-bezier(0.4, 0, 0.2, 1)'
  }
};

/**
 * Breakpoints (for responsive design)
 */
export const breakpoints = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px'
};

/**
 * Container max widths
 */
export const container = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px'
};

/* ============================================================================
 * HELPER FUNCTIONS
 * ========================================================================== */

/**
 * Convert spacing value to CSS
 *
 * @param {string} size - Size key from spacing object
 * @returns {string} CSS pixel value
 */
export function getSpacing(size) {
  return `${spacing[size]}px`;
}

/**
 * Create a color with opacity
 *
 * @param {string} color - Hex color value
 * @param {number} opacity - Opacity (0-1)
 * @returns {string} RGB color with alpha
 */
export function withOpacity(color, opacity) {
  // Convert hex to RGB
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Get media query for breakpoint
 *
 * @param {string} size - Breakpoint size
 * @returns {string} Media query string
 */
export function mediaQuery(size) {
  return `@media (min-width: ${breakpoints[size]})`;
}

/* ============================================================================
 * EXPORTS
 * ========================================================================== */

export default {
  colors,
  spacing,
  typography,
  borderRadius,
  shadows,
  zIndex,
  transitions,
  breakpoints,
  container,

  // Helpers
  getSpacing,
  withOpacity,
  mediaQuery
};
