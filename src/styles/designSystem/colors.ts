/**
 * ARCHIAI SOLUTION - Color Design System
 * Premium blue-themed palette with liquid glass aesthetics
 */

export const colors = {
  // Primary Blue Palette
  blue: {
    primary: '#007AFF',
    secondary: '#0051D5',
    dark: '#003D99',
    light: '#5AC8FA',
    accent: '#0A84FF',
    glow: 'rgba(0, 122, 255, 0.3)',
    glowStrong: 'rgba(0, 122, 255, 0.5)',
  },

  // Glass Morphism Colors
  glass: {
    bg: 'rgba(255, 255, 255, 0.1)',
    bgStrong: 'rgba(255, 255, 255, 0.15)',
    bgLight: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(255, 255, 255, 0.2)',
    borderStrong: 'rgba(255, 255, 255, 0.3)',
    shadow: 'rgba(0, 0, 0, 0.1)',
    shadowStrong: 'rgba(0, 0, 0, 0.2)',
  },

  // Background Gradients
  background: {
    primary: 'linear-gradient(135deg, #0A1929 0%, #1A2B3D 50%, #2A3B4D 100%)',
    secondary: 'linear-gradient(135deg, #001122 0%, #002244 50%, #003366 100%)',
    accent: 'radial-gradient(circle at 20% 30%, rgba(0, 122, 255, 0.15) 0%, transparent 50%)',
  },

  // Text Colors
  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255, 255, 255, 0.8)',
    tertiary: 'rgba(255, 255, 255, 0.6)',
    muted: 'rgba(255, 255, 255, 0.4)',
  },

  // Status Colors
  status: {
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    info: '#007AFF',
  },
} as const;

export type ColorKey = keyof typeof colors;

