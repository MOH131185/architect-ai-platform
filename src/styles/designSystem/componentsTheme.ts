/**
 * ARCHIAI SOLUTION - Component Theme System
 * Liquid glass component styles and variants
 */

import { colors } from './colors.js';

export const componentsTheme = {
  // Glass Card Variants
  glassCard: {
    base: {
      background: colors.glass.bg,
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      border: `1px solid ${colors.glass.border}`,
      borderRadius: '20px',
      boxShadow: `
        0 8px 32px 0 ${colors.glass.shadow},
        inset 0 1px 0 0 rgba(255, 255, 255, 0.2)
      `,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    strong: {
      background: colors.glass.bgStrong,
      backdropFilter: 'blur(30px) saturate(200%)',
      WebkitBackdropFilter: 'blur(30px) saturate(200%)',
      border: `1px solid ${colors.glass.borderStrong}`,
      borderRadius: '24px',
      boxShadow: `
        0 12px 40px 0 ${colors.glass.shadowStrong},
        inset 0 1px 0 0 rgba(255, 255, 255, 0.3)
      `,
    },
    hover: {
      background: colors.glass.bgStrong,
      borderColor: colors.glass.borderStrong,
      transform: 'translateY(-4px)',
      boxShadow: `
        0 16px 48px 0 ${colors.glass.shadowStrong},
        inset 0 1px 0 0 rgba(255, 255, 255, 0.25)
      `,
    },
  },

  // Button Variants
  button: {
    primary: {
      background: `linear-gradient(135deg, ${colors.blue.primary} 0%, ${colors.blue.secondary} 100%)`,
      backdropFilter: 'blur(10px)',
      border: `1px solid ${colors.glass.border}`,
      borderRadius: '12px',
      boxShadow: `
        0 8px 24px ${colors.blue.glow},
        inset 0 1px 0 rgba(255, 255, 255, 0.2)
      `,
      color: colors.text.primary,
      fontWeight: 600,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative' as const,
      overflow: 'hidden' as const,
    },
    secondary: {
      background: colors.glass.bg,
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      border: `1px solid ${colors.glass.border}`,
      borderRadius: '12px',
      color: colors.text.primary,
      fontWeight: 500,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    ghost: {
      background: 'transparent',
      border: `1px solid ${colors.glass.border}`,
      borderRadius: '12px',
      color: colors.text.secondary,
      fontWeight: 500,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  // Input Fields
  input: {
    base: {
      background: colors.glass.bgLight,
      backdropFilter: 'blur(10px) saturate(150%)',
      WebkitBackdropFilter: 'blur(10px) saturate(150%)',
      border: `1px solid ${colors.glass.border}`,
      borderRadius: '12px',
      color: colors.text.primary,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    focus: {
      borderColor: colors.blue.primary,
      boxShadow: `0 0 0 3px ${colors.blue.glow}`,
      background: colors.glass.bg,
    },
  },

  // Navigation Bar
  navbar: {
    base: {
      background: colors.glass.bg,
      backdropFilter: 'blur(30px) saturate(200%)',
      WebkitBackdropFilter: 'blur(30px) saturate(200%)',
      borderBottom: `1px solid ${colors.glass.border}`,
      boxShadow: `0 4px 20px ${colors.glass.shadow}`,
    },
  },

  // Modal/Overlay
  modal: {
    overlay: {
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    },
    content: {
      background: colors.glass.bgStrong,
      backdropFilter: 'blur(40px) saturate(200%)',
      WebkitBackdropFilter: 'blur(40px) saturate(200%)',
      border: `1px solid ${colors.glass.borderStrong}`,
      borderRadius: '24px',
      boxShadow: `
        0 20px 60px ${colors.glass.shadowStrong},
        inset 0 1px 0 rgba(255, 255, 255, 0.2)
      `,
    },
  },

  // Glow Effects
  glow: {
    blue: {
      boxShadow: `
        0 0 20px ${colors.blue.glow},
        0 0 40px ${colors.blue.glowStrong},
        0 0 60px rgba(0, 122, 255, 0.1)
      `,
    },
    text: {
      textShadow: `
        0 0 10px ${colors.blue.glowStrong},
        0 0 20px ${colors.blue.glow},
        0 0 30px rgba(0, 122, 255, 0.4)
      `,
    },
  },
} as const;

