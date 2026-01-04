/**
 * ARCHIAI SOLUTION - Animation System
 * Smooth, Apple-inspired animations and transitions
 */

export const animations = {
  // Duration
  duration: {
    fast: '0.15s',
    normal: '0.3s',
    slow: '0.5s',
    slower: '0.8s',
  },

  // Easing Functions
  easing: {
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },

  // Keyframe Animations
  keyframes: {
    fadeIn: `
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `,
    fadeInUp: `
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
    fadeInDown: `
      @keyframes fadeInDown {
        from {
          opacity: 0;
          transform: translateY(-30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
    slideInRight: `
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(30px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `,
    slideInLeft: `
      @keyframes slideInLeft {
        from {
          opacity: 0;
          transform: translateX(-30px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `,
    scaleIn: `
      @keyframes scaleIn {
        from {
          opacity: 0;
          transform: scale(0.9);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
    `,
    float: `
      @keyframes float {
        0%, 100% {
          transform: translateY(0) rotate(0deg);
        }
        50% {
          transform: translateY(-20px) rotate(5deg);
        }
      }
    `,
    pulse: `
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
    `,
    shimmer: `
      @keyframes shimmer {
        0% {
          background-position: -1000px 0;
        }
        100% {
          background-position: 1000px 0;
        }
      }
    `,
    glow: `
      @keyframes glow {
        0%, 100% {
          box-shadow: 0 0 20px rgba(0, 122, 255, 0.5);
        }
        50% {
          box-shadow: 0 0 40px rgba(0, 122, 255, 0.8);
        }
      }
    `,
    bgFloat: `
      @keyframes bgFloat {
        0%, 100% {
          transform: translate(0, 0) rotate(0deg);
        }
        33% {
          transform: translate(30px, -30px) rotate(120deg);
        }
        66% {
          transform: translate(-20px, 20px) rotate(240deg);
        }
      }
    `,
    bgPulse: `
      @keyframes bgPulse {
        0%, 100% {
          opacity: 0.5;
        }
        50% {
          opacity: 0.8;
        }
      }
    `,
  },

  // Animation Classes
  classes: {
    fadeIn: {
      animation: 'fadeIn 0.5s ease-out',
    },
    fadeInUp: {
      animation: 'fadeInUp 0.8s ease-out',
    },
    fadeInDown: {
      animation: 'fadeInDown 0.8s ease-out',
    },
    slideInRight: {
      animation: 'slideInRight 0.5s ease-out',
    },
    slideInLeft: {
      animation: 'slideInLeft 0.5s ease-out',
    },
    scaleIn: {
      animation: 'scaleIn 0.4s ease-out',
    },
    float: {
      animation: 'float 6s ease-in-out infinite',
    },
    pulse: {
      animation: 'pulse 2s ease-in-out infinite',
    },
    shimmer: {
      background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%)',
      backgroundSize: '1000px 100%',
      animation: 'shimmer 2s infinite',
    },
    glow: {
      animation: 'glow 2s ease-in-out infinite',
    },
  },

  // Transitions
  transitions: {
    default: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    fast: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

