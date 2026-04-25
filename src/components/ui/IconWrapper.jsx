import React from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";
import { scaleOnHover } from "../../styles/animations.js";

const SIZE_CLASSES = {
  // Container size + inner-icon target
  xs: { container: "w-7 h-7", icon: "w-3.5 h-3.5" },
  sm: { container: "w-10 h-10", icon: "w-4 h-4" },
  md: { container: "w-14 h-14", icon: "w-5 h-5" },
  lg: { container: "w-20 h-20", icon: "w-6 h-6" },
  xl: { container: "w-28 h-28", icon: "w-8 h-8" },
};

const VARIANT_CLASSES = {
  default: "bg-royal-600/10 text-royal-400 border border-royal-600/20",
  primary: "bg-royal-600 text-white",
  secondary: "bg-navy-800 text-royal-400 border border-white/10",
  glass: "bg-white/5 backdrop-blur-md text-royal-400 border border-white/10",
  gradient: "bg-gradient-to-br from-royal-600 to-royal-400 text-white",
};

/**
 * IconWrapper — colored container for an icon (typically a Lucide icon).
 * Enforces a consistent stroke-width (1.75) and standard size on the inner SVG.
 */
const IconWrapper = ({
  children,
  size = "md",
  variant = "default",
  glow = false,
  enforceIconSize = true,
  className = "",
  ...props
}) => {
  const sizing = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const glowClass = glow ? "shadow-glow" : "";

  // Clone the icon child to apply premium polish defaults: stroke 1.75 +
  // standard sizing tied to wrapper size. Consumer-set strokeWidth/className
  // wins (only fills in when not specified).
  const enhancedChild = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (!enforceIconSize) return child;

    const existingClassName = child.props.className || "";
    const sizingApplied = /\bw-\d|\bh-\d/.test(existingClassName);

    return React.cloneElement(child, {
      strokeWidth:
        child.props.strokeWidth !== undefined ? child.props.strokeWidth : 1.75,
      className: sizingApplied
        ? existingClassName
        : `${existingClassName} ${sizing.icon}`.trim(),
    });
  });

  const combinedClasses = `rounded-xl flex items-center justify-center ${sizing.container} ${VARIANT_CLASSES[variant]} ${glowClass} ${className}`;

  return (
    <motion.div
      className={combinedClasses}
      variants={scaleOnHover}
      initial="initial"
      whileHover="hover"
      whileTap="tap"
      {...props}
    >
      {enhancedChild}
    </motion.div>
  );
};

IconWrapper.propTypes = {
  children: PropTypes.node.isRequired,
  size: PropTypes.oneOf(["xs", "sm", "md", "lg", "xl"]),
  variant: PropTypes.oneOf([
    "default",
    "primary",
    "secondary",
    "glass",
    "gradient",
  ]),
  glow: PropTypes.bool,
  enforceIconSize: PropTypes.bool,
  className: PropTypes.string,
};

export default IconWrapper;
