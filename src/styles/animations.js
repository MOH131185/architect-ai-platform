/**
 * Framer Motion Animation Variants
 * 
 * Reusable animation presets for Deepgram-inspired UI
 */

// Page transitions with background choreography
export const pageTransition = {
  initial: { 
    opacity: 0,
    scale: 0.98,
  },
  animate: { 
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: { 
    opacity: 0,
    scale: 1.02,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

// Background zoom animations
export const zoomInBackground = {
  initial: { 
    scale: 1,
  },
  animate: { 
    scale: 1.1,
    transition: {
      duration: 30,
      ease: 'linear',
      repeat: Infinity,
      repeatType: 'reverse',
    },
  },
};

export const zoomOutBackground = {
  initial: { 
    scale: 1.1,
  },
  animate: { 
    scale: 1,
    transition: {
      duration: 30,
      ease: 'linear',
      repeat: Infinity,
      repeatType: 'reverse',
    },
  },
};

// Fade in up animation
export const fadeInUp = {
  initial: { 
    opacity: 0,
    y: 40,
  },
  animate: { 
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

// Fade in down animation
export const fadeInDown = {
  initial: { 
    opacity: 0,
    y: -40,
  },
  animate: { 
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

// Slide in from right (for drawers/panels)
export const slideInRight = {
  initial: { 
    x: '100%',
    opacity: 0,
  },
  animate: { 
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: { 
    x: '100%',
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

// Slide in from left
export const slideInLeft = {
  initial: { 
    x: '-100%',
    opacity: 0,
  },
  animate: { 
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: { 
    x: '-100%',
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

// Stagger children animation
export const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

// Stagger children (fast)
export const staggerChildrenFast = {
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

// Subtle float animation
export const subtleFloat = {
  animate: {
    y: [-5, 5, -5],
    transition: {
      duration: 6,
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
};

// Parallax layer (slow movement)
export const parallaxLayer = (speed = 0.5) => ({
  animate: {
    y: [0, -20 * speed, 0],
    transition: {
      duration: 20,
      ease: 'linear',
      repeat: Infinity,
    },
  },
});

// Scale on hover
export const scaleOnHover = {
  initial: { scale: 1 },
  hover: { 
    scale: 1.05,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  tap: { 
    scale: 0.98,
  },
};

// Glow on hover
export const glowOnHover = {
  initial: { 
    boxShadow: '0 0 0 rgba(37, 99, 235, 0)',
  },
  hover: { 
    boxShadow: '0 0 20px rgba(37, 99, 235, 0.3), 0 0 40px rgba(37, 99, 235, 0.1)',
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

// Rotate animation
export const rotate = {
  animate: {
    rotate: [0, 360],
    transition: {
      duration: 20,
      ease: 'linear',
      repeat: Infinity,
    },
  },
};

// Pulse animation
export const pulse = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 2,
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
};

// Shimmer effect
export const shimmer = {
  animate: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: {
      duration: 8,
      ease: 'linear',
      repeat: Infinity,
    },
  },
};

// Modal backdrop
export const modalBackdrop = {
  initial: { 
    opacity: 0,
  },
  animate: { 
    opacity: 1,
    transition: {
      duration: 0.2,
    },
  },
  exit: { 
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

// Modal content
export const modalContent = {
  initial: { 
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  animate: { 
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: { 
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

// List item animation
export const listItem = {
  initial: { 
    opacity: 0,
    x: -20,
  },
  animate: { 
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: { 
    opacity: 0,
    x: 20,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

// Card reveal animation
export const cardReveal = {
  initial: { 
    opacity: 0,
    y: 60,
    scale: 0.95,
  },
  animate: { 
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

// Progress bar animation
export const progressBar = {
  initial: { 
    scaleX: 0,
    originX: 0,
  },
  animate: { 
    scaleX: 1,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

// Number counter animation (for stats)
export const counterAnimation = (from, to, duration = 2) => ({
  initial: { value: from },
  animate: { 
    value: to,
    transition: {
      duration,
      ease: 'easeOut',
    },
  },
});

// Spotlight effect
export const spotlight = {
  initial: { 
    opacity: 0,
  },
  hover: { 
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

// Expand animation
export const expand = {
  initial: { 
    height: 0,
    opacity: 0,
  },
  animate: { 
    height: 'auto',
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: { 
    height: 0,
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

// Collapse animation
export const collapse = {
  initial: { 
    height: 'auto',
    opacity: 1,
  },
  animate: { 
    height: 0,
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

// Gradient border animation
export const gradientBorder = {
  animate: {
    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
    transition: {
      duration: 3,
      ease: 'linear',
      repeat: Infinity,
    },
  },
};

// Parallax background layer (responds to mouse)
export const parallaxBackground = (depth = 1) => ({
  initial: { x: 0, y: 0 },
  // Mouse position will be set dynamically via useMotionValue
});

// Zoom and rotate background
export const zoomRotateBackground = {
  animate: {
    scale: [1, 1.15, 1],
    rotate: [0, 2, 0],
    transition: {
      duration: 40,
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
};

// Architectural grid animation
export const architecturalGrid = {
  initial: { opacity: 0 },
  animate: {
    opacity: [0.05, 0.15, 0.05],
    transition: {
      duration: 8,
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
};

// Stagger cards (for program review)
export const staggerCards = {
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.15,
    },
  },
};

// Card entrance (for program review)
export const cardEntrance = {
  initial: {
    opacity: 0,
    y: 30,
    scale: 0.9,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: {
      duration: 0.3,
    },
  },
};

// Compass rotation (smooth entrance direction change)
export const compassRotation = (bearing) => ({
  rotate: bearing,
  transition: {
    duration: 0.6,
    ease: [0.16, 1, 0.3, 1],
  },
});

// Map overlay fade
export const mapOverlayFade = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.3,
    },
  },
};

export default {
  pageTransition,
  zoomInBackground,
  zoomOutBackground,
  fadeInUp,
  fadeInDown,
  slideInRight,
  slideInLeft,
  staggerChildren,
  staggerChildrenFast,
  subtleFloat,
  parallaxLayer,
  scaleOnHover,
  glowOnHover,
  rotate,
  pulse,
  shimmer,
  modalBackdrop,
  modalContent,
  listItem,
  cardReveal,
  progressBar,
  counterAnimation,
  spotlight,
  expand,
  collapse,
  gradientBorder,
  parallaxBackground,
  zoomRotateBackground,
  architecturalGrid,
  staggerCards,
  cardEntrance,
  compassRotation,
  mapOverlayFade,
};


