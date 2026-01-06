/**
 * BlueprintLogoLoader - Looping CAD-style loading animation
 *
 * Continuous drawing animation for loading states.
 * Technical, precise blueprint aesthetic.
 * Draws, pauses, fades, repeats.
 */

import React from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";

// Design tokens
const COLORS = {
  background: "#0a0e27",
  stroke: "#60a5fa",
  strokeDim: "rgba(96, 165, 250, 0.3)",
  fill: "rgba(96, 165, 250, 0.1)",
};

// Animation timing
const CYCLE_DURATION = 2.4; // Total loop duration in seconds

/**
 * Looping blueprint logo for loading states
 */
const BlueprintLogoLoader = ({
  size = 64,
  className = "",
  showBackground = false,
  style,
}) => {
  const dimension = typeof size === "number" ? `${size}px` : size;

  // Stroke animation keyframes
  const strokeVariants = {
    initial: { pathLength: 0, opacity: 0.3 },
    animate: {
      pathLength: [0, 1, 1, 0],
      opacity: [0.3, 1, 1, 0.3],
    },
  };

  // Stagger delays for each element
  const getTransition = (delay = 0) => ({
    pathLength: {
      duration: CYCLE_DURATION,
      times: [0, 0.4, 0.7, 1], // draw, hold, fade
      ease: "linear",
      repeat: Infinity,
      delay,
    },
    opacity: {
      duration: CYCLE_DURATION,
      times: [0, 0.4, 0.7, 1],
      ease: "linear",
      repeat: Infinity,
      delay,
    },
  });

  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Loading"
      className={className}
      style={{
        display: "block",
        ...style,
      }}
    >
      {/* Background */}
      {showBackground && (
        <rect
          x="0"
          y="0"
          width="64"
          height="64"
          rx="12"
          fill={COLORS.background}
        />
      )}

      {/* Static frame (always visible, dim) */}
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="11"
        fill="none"
        stroke={COLORS.strokeDim}
        strokeWidth={0.75}
      />

      {/* Paper outline - static dim */}
      <path
        d="M17 16 H45 a3 3 0 0 1 3 3 V45 a3 3 0 0 1 -3 3 H17 a3 3 0 0 1 -3 -3 V19 a3 3 0 0 1 3 -3 Z"
        fill={COLORS.fill}
        stroke={COLORS.strokeDim}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Animated house - roof */}
      <motion.path
        d="M26 34 L32 28 L38 34"
        fill="none"
        stroke={COLORS.stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={strokeVariants}
        initial="initial"
        animate="animate"
        transition={getTransition(0)}
      />

      {/* Animated house - walls */}
      <motion.path
        d="M27.5 34 V42.5 H36.5 V34"
        fill="none"
        stroke={COLORS.stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={strokeVariants}
        initial="initial"
        animate="animate"
        transition={getTransition(0.15)}
      />

      {/* Animated house - door */}
      <motion.path
        d="M31 42.5 V38.5 H33 V42.5"
        fill="none"
        stroke={COLORS.stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={strokeVariants}
        initial="initial"
        animate="animate"
        transition={getTransition(0.3)}
      />
    </svg>
  );
};

BlueprintLogoLoader.propTypes = {
  /** Size in pixels or CSS value */
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Show dark navy background */
  showBackground: PropTypes.bool,
  /** Additional inline styles */
  style: PropTypes.object,
};

export default BlueprintLogoLoader;
