/**
 * AnimatedBlueprintLogo - Animated version of ArchitecturalLogo
 *
 * Matches the exact geometry of ArchitecturalLogo:
 * - Document shape with folded corner
 * - House icon centered
 * 
 * Uses framer-motion for stroke drawing animation.
 */

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";

// Colors from ArchitecturalLogo (Blue-600 mostly)
const COLORS = {
  stroke: "#3B82F6", // Blue-600
  fill: "rgba(255, 255, 255, 0.5)", // From folded corner
  fillGradientStart: "#FFFFFF",
  fillGradientEnd: "#F1F5F9",
  shadow: "rgba(15, 23, 42, 0.15)"
};

const TIMING = {
  easing: [0.2, 0, 0.1, 1],
  document: 0.2,
  corner: 0.8,
  roof: 1.2,
  body: 1.6,
  door: 2.0,
  fill: 2.4
};

const AnimatedPath = ({
  d,
  delay = 0,
  duration = 0.8,
  stroke = COLORS.stroke,
  strokeWidth = 2,
  fill = "none",
  className = "",
  style = {}
}) => {
  return (
    <motion.path
      d={d}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{
        pathLength: { delay, duration, ease: TIMING.easing },
        opacity: { delay, duration: 0.1 }
      }}
      className={className}
      style={style}
    />
  );
};

const AnimatedBlueprintLogo = ({
  size = 48,
  className = "",
  autoPlay = true,
  onAnimationComplete,
  style
}) => {
  const [isAnimating, setIsAnimating] = useState(autoPlay);
  const [animationKey, setAnimationKey] = useState(0);

  // Generate unique IDs
  const uid = React.useId().replace(/:/g, '');
  const gradientId = `anim-logo-gradient-${uid}`;
  const shadowId = `anim-logo-shadow-${uid}`;

  const replay = () => {
    setAnimationKey((prev) => prev + 1);
    setIsAnimating(true);
  };

  useEffect(() => {
    if (isAnimating) {
      const totalDuration = TIMING.fill + 1;
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
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Animated ArchiAI Logo"
      className={className}
      style={{ display: "inline-flex", ...style }}
      onClick={replay}
    >
      <defs>
        <linearGradient id={gradientId} x1="32" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={COLORS.fillGradientStart} stopOpacity="0">
                 <animate attributeName="stop-opacity" from="0" to="1" dur="0.5s" begin={`${TIMING.fill}s`} fill="freeze" />
            </stop>
            <stop offset="1" stopColor={COLORS.fillGradientEnd} stopOpacity="0">
                <animate attributeName="stop-opacity" from="0" to="1" dur="0.5s" begin={`${TIMING.fill}s`} fill="freeze" />
            </stop>
        </linearGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={COLORS.shadow} />
        </filter>
      </defs>
      
      {/* Document Shape */}
      <AnimatedPath
        d="M14 8C11.7909 8 10 9.79086 10 12V52C10 54.2091 11.7909 56 14 56H50C52.2091 56 54 54.2091 54 52V20L42 8H14Z"
        delay={TIMING.document}
        stroke={COLORS.stroke}
        strokeWidth={2}
      />
      
      {/* Fill for Document (Fades in) */}
      <motion.path
        d="M14 8C11.7909 8 10 9.79086 10 12V52C10 54.2091 11.7909 56 14 56H50C52.2091 56 54 54.2091 54 52V20L42 8H14Z"
        fill={`url(#${gradientId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: TIMING.fill, duration: 0.5 }}
        style={{ filter: `url(#${shadowId})` }}
      />

      {/* Folded Corner Detail */}
      <AnimatedPath
        d="M42 8V20H54"
        delay={TIMING.corner}
        stroke={COLORS.stroke}
        strokeWidth={2}
      />
      
      <motion.path 
        d="M42 8V20H54"
        fill={COLORS.fill}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: TIMING.fill, duration: 0.5 }}
      />

      {/* House Roof */}
      <AnimatedPath
        d="M22 32L32 23L42 32"
        delay={TIMING.roof}
        stroke={COLORS.stroke}
        strokeWidth={2.5}
      />

      {/* House Body */}
      <AnimatedPath
        d="M25 32V44H39V32"
        delay={TIMING.body}
        stroke={COLORS.stroke}
        strokeWidth={2.5}
      />

      {/* House Door */}
      <AnimatedPath
        d="M29 44V38H35V44"
        delay={TIMING.door}
        stroke={COLORS.stroke}
        strokeWidth={2}
      />

    </motion.svg>
  );
};

AnimatedBlueprintLogo.propTypes = {
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
  autoPlay: PropTypes.bool,
  onAnimationComplete: PropTypes.func,
  style: PropTypes.object,
  showBackground: PropTypes.bool
};

export default AnimatedBlueprintLogo;
