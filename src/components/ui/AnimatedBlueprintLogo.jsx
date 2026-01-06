/**
 * AnimatedBlueprintLogo - CAD-style line drawing animation
 *
 * Technical, precise blueprint drawing animation.
 * Line-by-line reveal with stroke animation.
 * Fill appears only after drawing completes.
 *
 * Animation sequence:
 * 1. Frame outline (0.0s - 0.4s)
 * 2. Paper rectangle (0.2s - 0.8s)
 * 3. Paper roll curl (0.5s - 0.9s)
 * 4. House roof (0.7s - 1.1s)
 * 5. House walls (0.9s - 1.3s)
 * 6. Door (1.1s - 1.4s)
 * 7. Fills fade in (1.4s - 1.8s)
 */

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";

// Design tokens matching the blueprint theme
const COLORS = {
  background: "#0a0e27",
  backgroundGradientEnd: "#0f172a",
  stroke: "#60a5fa", // Subtle cyan/blue
  strokeMuted: "#3b82f6", // Slightly darker blue
  strokeDim: "rgba(96, 165, 250, 0.4)",
  fill: "rgba(96, 165, 250, 0.08)",
  fillAccent: "rgba(96, 165, 250, 0.15)",
  frame: "rgba(96, 165, 250, 0.25)",
};

// Animation timing - technical, linear, CAD-like
const TIMING = {
  // Easing: linear for technical precision, slight ease-out at end
  easing: [0.2, 0, 0.1, 1],

  // Stagger delays (in seconds)
  frame: 0,
  paper: 0.15,
  rollCurl: 0.4,
  roofLine: 0.6,
  wallsLine: 0.8,
  doorLine: 1.0,
  fillsAppear: 1.3,

  // Durations
  strokeDraw: 0.5,
  fillFade: 0.4,
};

// Path lengths (approximate, for stroke-dasharray)
const PATH_LENGTHS = {
  frame: 240,
  paper: 120,
  rollCurl: 20,
  roof: 25,
  walls: 40,
  door: 15,
};

/**
 * Animated path component with stroke drawing effect
 */
const AnimatedPath = ({
  d,
  pathLength,
  delay = 0,
  duration = TIMING.strokeDraw,
  stroke = COLORS.stroke,
  strokeWidth = 2,
  fill = "none",
  className = "",
}) => {
  return (
    <motion.path
      d={d}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{
        pathLength: 0,
        opacity: 0,
      }}
      animate={{
        pathLength: 1,
        opacity: 1,
      }}
      transition={{
        pathLength: {
          delay,
          duration,
          ease: TIMING.easing,
        },
        opacity: {
          delay,
          duration: 0.1,
        },
      }}
      className={className}
      style={{
        strokeDasharray: pathLength,
        strokeDashoffset: 0,
      }}
    />
  );
};

AnimatedPath.propTypes = {
  d: PropTypes.string.isRequired,
  pathLength: PropTypes.number,
  delay: PropTypes.number,
  duration: PropTypes.number,
  stroke: PropTypes.string,
  strokeWidth: PropTypes.number,
  fill: PropTypes.string,
  className: PropTypes.string,
};

/**
 * Animated rect component with stroke drawing effect
 */
const AnimatedRect = ({
  x,
  y,
  width,
  height,
  rx = 0,
  delay = 0,
  duration = TIMING.strokeDraw,
  stroke = COLORS.stroke,
  strokeWidth = 2,
  fill = "none",
}) => {
  const perimeter = 2 * (width + height);

  return (
    <motion.rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={rx}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{
        pathLength: 0,
        opacity: 0,
      }}
      animate={{
        pathLength: 1,
        opacity: 1,
      }}
      transition={{
        pathLength: {
          delay,
          duration,
          ease: TIMING.easing,
        },
        opacity: {
          delay,
          duration: 0.1,
        },
      }}
      style={{
        strokeDasharray: perimeter,
        strokeDashoffset: 0,
      }}
    />
  );
};

AnimatedRect.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  rx: PropTypes.number,
  delay: PropTypes.number,
  duration: PropTypes.number,
  stroke: PropTypes.string,
  strokeWidth: PropTypes.number,
  fill: PropTypes.string,
};

/**
 * Animated fill that fades in after strokes complete
 */
const AnimatedFill = ({ children, delay = TIMING.fillsAppear }) => {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        delay,
        duration: TIMING.fillFade,
        ease: "easeOut",
      }}
    >
      {children}
    </motion.g>
  );
};

AnimatedFill.propTypes = {
  children: PropTypes.node.isRequired,
  delay: PropTypes.number,
};

/**
 * Main animated blueprint logo component
 */
const AnimatedBlueprintLogo = ({
  size = 80,
  className = "",
  showBackground = true,
  autoPlay = true,
  onAnimationComplete,
  style,
}) => {
  const [isAnimating, setIsAnimating] = useState(autoPlay);
  const [animationKey, setAnimationKey] = useState(0);

  // Reset and replay animation
  const replay = () => {
    setAnimationKey((prev) => prev + 1);
    setIsAnimating(true);
  };

  // Handle animation complete
  useEffect(() => {
    if (isAnimating) {
      const totalDuration = TIMING.fillsAppear + TIMING.fillFade + 0.2;
      const timer = setTimeout(() => {
        setIsAnimating(false);
        onAnimationComplete?.();
      }, totalDuration * 1000);
      return () => clearTimeout(timer);
    }
  }, [isAnimating, animationKey, onAnimationComplete]);

  const dimension = typeof size === "number" ? `${size}px` : size;

  return (
    <motion.svg
      key={animationKey}
      width={dimension}
      height={dimension}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="ArchiAI Solution animated logo"
      className={className}
      style={{
        display: "block",
        ...style,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      onClick={replay}
    >
      <defs>
        {/* Background gradient */}
        <linearGradient id="animLogo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={COLORS.background} />
          <stop offset="1" stopColor={COLORS.backgroundGradientEnd} />
        </linearGradient>

        {/* Subtle glow filter */}
        <filter id="animLogo-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Background */}
      {showBackground && (
        <rect
          x="0"
          y="0"
          width="64"
          height="64"
          rx="12"
          fill="url(#animLogo-bg)"
        />
      )}

      {/* Layer 1: Frame outline (draws first) */}
      <AnimatedRect
        x={3}
        y={3}
        width={58}
        height={58}
        rx={11}
        delay={TIMING.frame}
        duration={0.6}
        stroke={COLORS.frame}
        strokeWidth={1}
      />

      {/* Layer 2: Blueprint paper rectangle */}
      <AnimatedPath
        d="M17 16 H45 a3 3 0 0 1 3 3 V45 a3 3 0 0 1 -3 3 H17 a3 3 0 0 1 -3 -3 V19 a3 3 0 0 1 3 -3 Z"
        pathLength={PATH_LENGTHS.paper}
        delay={TIMING.paper}
        duration={0.6}
        stroke={COLORS.strokeDim}
        strokeWidth={1.5}
      />

      {/* Layer 3: Paper roll curl */}
      <AnimatedPath
        d="M48 16 Q52 12 56 16"
        pathLength={PATH_LENGTHS.rollCurl}
        delay={TIMING.rollCurl}
        duration={0.3}
        stroke={COLORS.strokeDim}
        strokeWidth={1.5}
      />

      {/* Main drawing group with subtle glow */}
      <g filter="url(#animLogo-glow)">
        {/* Layer 4: House roof */}
        <AnimatedPath
          d="M26 34 L32 28 L38 34"
          pathLength={PATH_LENGTHS.roof}
          delay={TIMING.roofLine}
          duration={0.4}
          stroke={COLORS.stroke}
          strokeWidth={2.2}
        />

        {/* Layer 5: House walls */}
        <AnimatedPath
          d="M27.5 34 V42.5 H36.5 V34"
          pathLength={PATH_LENGTHS.walls}
          delay={TIMING.wallsLine}
          duration={0.4}
          stroke={COLORS.stroke}
          strokeWidth={2.2}
        />

        {/* Layer 6: Door */}
        <AnimatedPath
          d="M31 42.5 V38.5 H33 V42.5"
          pathLength={PATH_LENGTHS.door}
          delay={TIMING.doorLine}
          duration={0.3}
          stroke={COLORS.stroke}
          strokeWidth={1.8}
        />
      </g>

      {/* Layer 7: Fills fade in after strokes complete */}
      <AnimatedFill delay={TIMING.fillsAppear}>
        {/* Paper fill */}
        <path
          d="M17 16 H45 a3 3 0 0 1 3 3 V45 a3 3 0 0 1 -3 3 H17 a3 3 0 0 1 -3 -3 V19 a3 3 0 0 1 3 -3 Z"
          fill={COLORS.fill}
        />
        {/* Roll fill */}
        <path
          d="M48 16 Q52 12 56 16 L56 48 Q52 52 48 48 Z"
          fill={COLORS.fill}
        />
        {/* House interior subtle fill */}
        <path
          d="M27.5 34 L32 29 L36.5 34 V42.5 H27.5 Z"
          fill={COLORS.fillAccent}
        />
      </AnimatedFill>
    </motion.svg>
  );
};

AnimatedBlueprintLogo.propTypes = {
  /** Size in pixels or CSS value */
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Show dark navy background */
  showBackground: PropTypes.bool,
  /** Auto-play animation on mount */
  autoPlay: PropTypes.bool,
  /** Callback when animation completes */
  onAnimationComplete: PropTypes.func,
  /** Additional inline styles */
  style: PropTypes.object,
};

export default AnimatedBlueprintLogo;

/**
 * Timing reference for integration:
 *
 * Total animation duration: ~1.9 seconds
 *
 * Timeline:
 * 0.00s - 0.60s : Frame outline draws
 * 0.15s - 0.75s : Paper rectangle draws
 * 0.40s - 0.70s : Roll curl draws
 * 0.60s - 1.00s : Roof line draws
 * 0.80s - 1.20s : Walls draw
 * 1.00s - 1.30s : Door draws
 * 1.30s - 1.70s : Fills fade in
 *
 * Easing: [0.2, 0, 0.1, 1] - technical, precise, slight deceleration
 */
