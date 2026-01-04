/**
 * ArchitectAI Animation System
 *
 * Framer Motion variants and animation utilities for smooth,
 * professional micro-interactions inspired by Apple and Linear.
 */

// =============================================================================
// CORE ANIMATION VARIANTS
// =============================================================================

/**
 * Fade in with upward movement (most common)
 */
export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

/**
 * Fade in with downward movement
 */
export const fadeInDown = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
};

/**
 * Fade in from left
 */
export const fadeInLeft = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

/**
 * Fade in from right
 */
export const fadeInRight = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

/**
 * Simple fade
 */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Scale in (for modals, popovers)
 */
export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

/**
 * Scale in with bounce (for emphasis)
 */
export const scaleInBounce = {
  initial: { opacity: 0, scale: 0.9 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  },
  exit: { opacity: 0, scale: 0.9 },
};

/**
 * Slide in from bottom (for sheets, drawers)
 */
export const slideInBottom = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
};

/**
 * Slide in from right (for side panels)
 */
export const slideInRight = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
};

/**
 * Slide in from left
 */
export const slideInLeft = {
  initial: { x: '-100%' },
  animate: { x: 0 },
  exit: { x: '-100%' },
};

// =============================================================================
// STAGGER CONTAINERS
// =============================================================================

/**
 * Parent container for staggered children
 */
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

/**
 * Fast stagger for lists
 */
export const staggerContainerFast = {
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

/**
 * Slow stagger for hero elements
 */
export const staggerContainerSlow = {
  animate: {
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

/**
 * Child item for staggered lists
 */
export const staggerItem = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

// =============================================================================
// TRANSITION PRESETS
// =============================================================================

/**
 * Default smooth transition
 */
export const transitionSmooth = {
  duration: 0.5,
  ease: [0.25, 0.46, 0.45, 0.94],
};

/**
 * Quick transition
 */
export const transitionQuick = {
  duration: 0.2,
  ease: [0.25, 0.46, 0.45, 0.94],
};

/**
 * Slow transition (for large elements)
 */
export const transitionSlow = {
  duration: 0.7,
  ease: [0.25, 0.46, 0.45, 0.94],
};

/**
 * Spring transition (for buttons, interactive elements)
 */
export const transitionSpring = {
  type: 'spring',
  stiffness: 400,
  damping: 25,
};

/**
 * Bounce transition
 */
export const transitionBounce = {
  type: 'spring',
  stiffness: 300,
  damping: 20,
};

// =============================================================================
// INTERACTIVE VARIANTS
// =============================================================================

/**
 * Button hover/tap animation
 */
export const buttonAnimation = {
  initial: { scale: 1 },
  whileHover: {
    scale: 1.02,
    transition: transitionSpring,
  },
  whileTap: {
    scale: 0.98,
    transition: transitionSpring,
  },
};

/**
 * Card hover animation (lift effect)
 */
export const cardHover = {
  initial: { y: 0 },
  whileHover: {
    y: -4,
    transition: transitionSmooth,
  },
};

/**
 * Card hover with scale
 */
export const cardHoverScale = {
  initial: { scale: 1 },
  whileHover: {
    scale: 1.02,
    transition: transitionSmooth,
  },
};

/**
 * Link hover animation
 */
export const linkHover = {
  initial: { x: 0 },
  whileHover: {
    x: 4,
    transition: transitionQuick,
  },
};

/**
 * Icon button animation
 */
export const iconButtonAnimation = {
  whileHover: {
    scale: 1.1,
    transition: transitionSpring,
  },
  whileTap: {
    scale: 0.9,
    transition: transitionSpring,
  },
};

// =============================================================================
// PAGE TRANSITIONS
// =============================================================================

/**
 * Page fade transition
 */
export const pageTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.3 },
};

/**
 * Wizard step transition (slide left/right)
 */
export const stepTransition = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
  transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
};

/**
 * Reverse step transition (going back)
 */
export const stepTransitionReverse = {
  initial: { opacity: 0, x: -50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 50 },
  transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
};

// =============================================================================
// SPECIAL EFFECTS
// =============================================================================

/**
 * Pulse animation (for loading states)
 */
export const pulse = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Shimmer effect (for skeleton loaders)
 */
export const shimmer = {
  animate: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Rotate animation (for spinners)
 */
export const rotate = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

/**
 * Float animation (for decorative elements)
 */
export const float = {
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

/**
 * Subtle breathing animation
 */
export const breathe = {
  animate: {
    scale: [1, 1.02, 1],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// =============================================================================
// MODAL & OVERLAY
// =============================================================================

/**
 * Modal backdrop
 */
export const modalBackdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
};

/**
 * Modal content
 */
export const modalContent = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
  transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
};

/**
 * Drawer slide
 */
export const drawerSlide = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
  transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
};

// =============================================================================
// NOTIFICATION & TOAST
// =============================================================================

/**
 * Toast notification
 */
export const toastAnimation = {
  initial: { opacity: 0, y: 50, scale: 0.9 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 20, scale: 0.9 },
  transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a delayed variant
 * @param {Object} variant - Base variant
 * @param {number} delay - Delay in seconds
 * @returns {Object} Variant with delay
 */
export function withDelay(variant, delay) {
  return {
    ...variant,
    animate: {
      ...variant.animate,
      transition: {
        ...variant.animate?.transition,
        delay,
      },
    },
  };
}

/**
 * Create stagger children with custom timing
 * @param {number} stagger - Stagger time in seconds
 * @param {number} delay - Initial delay in seconds
 * @returns {Object} Container variant
 */
export function createStagger(stagger = 0.1, delay = 0) {
  return {
    animate: {
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };
}

/**
 * Combine multiple animation variants
 * @param  {...Object} variants - Variants to combine
 * @returns {Object} Combined variant
 */
export function combineVariants(...variants) {
  return variants.reduce((acc, variant) => {
    return {
      initial: { ...acc.initial, ...variant.initial },
      animate: { ...acc.animate, ...variant.animate },
      exit: { ...acc.exit, ...variant.exit },
    };
  }, { initial: {}, animate: {}, exit: {} });
}

// =============================================================================
// VIEWPORT ANIMATION SETTINGS
// =============================================================================

/**
 * Default viewport settings for scroll animations
 */
export const viewportSettings = {
  once: true,
  amount: 0.2,
  margin: '-50px',
};

/**
 * Viewport settings for eager loading
 */
export const viewportEager = {
  once: true,
  amount: 0.1,
  margin: '-100px',
};

// =============================================================================
// EXPORT DEFAULT
// =============================================================================

export default {
  // Core variants
  fadeInUp,
  fadeInDown,
  fadeInLeft,
  fadeInRight,
  fade,
  scaleIn,
  scaleInBounce,
  slideInBottom,
  slideInRight,
  slideInLeft,

  // Stagger
  staggerContainer,
  staggerContainerFast,
  staggerContainerSlow,
  staggerItem,

  // Transitions
  transitionSmooth,
  transitionQuick,
  transitionSlow,
  transitionSpring,
  transitionBounce,

  // Interactive
  buttonAnimation,
  cardHover,
  cardHoverScale,
  linkHover,
  iconButtonAnimation,

  // Page
  pageTransition,
  stepTransition,
  stepTransitionReverse,

  // Effects
  pulse,
  shimmer,
  rotate,
  float,
  breathe,

  // Modal
  modalBackdrop,
  modalContent,
  drawerSlide,

  // Toast
  toastAnimation,

  // Utilities
  withDelay,
  createStagger,
  combineVariants,
  viewportSettings,
  viewportEager,
};
