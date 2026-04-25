import React from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";
import { cardReveal, scaleOnHover } from "../../styles/animations.js";

const Card = ({
  children,
  variant = "default",
  padding = "md",
  hover = false,
  interactive = false,
  glass = false,
  gradient = false,
  className = "",
  onClick,
  ...props
}) => {
  const baseClasses = "rounded-2xl transition-all duration-200";

  const variantClasses = {
    default: "bg-navy-800 border border-white/10",
    elevated: "bg-navy-800 border border-white/10 shadow-xl",
    glass: "bg-white/5 backdrop-blur-md border border-white/10",
    dark: "bg-navy-900 border border-white/8",
    gradient:
      "bg-gradient-to-br from-navy-800 to-navy-900 border border-white/10",
    outline: "bg-transparent border-2 border-royal-600",
  };

  const paddingClasses = {
    none: "p-0",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
    xl: "p-12",
  };

  // `hover` (legacy) gives a strong glow + larger lift; `interactive` is the
  // refined Linear/Vercel-style subtle lift used by ExportPanel / Pricing rows.
  const hoverClasses = hover
    ? "cursor-pointer hover:shadow-glow hover:border-royal-600 hover:-translate-y-1"
    : interactive
      ? "cursor-pointer hover:-translate-y-0.5 hover:border-white/20 hover:shadow-soft-lg"
      : "";

  // eslint-disable-next-line no-unused-vars
  const glassEffect = glass || variant === "glass"; // Reserved for future glass styling
  const gradientBorder = gradient;

  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${paddingClasses[padding]} ${hoverClasses} ${className}`;

  const cardContent = (
    <div className={combinedClasses} onClick={onClick} {...props}>
      {children}
    </div>
  );

  if (gradientBorder) {
    return (
      <motion.div
        className="gradient-border rounded-2xl"
        variants={hover ? scaleOnHover : cardReveal}
        initial="initial"
        animate="animate"
        whileHover={hover ? "hover" : undefined}
      >
        <div className="gradient-border-content p-[2px]">{cardContent}</div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={hover ? scaleOnHover : cardReveal}
      initial="initial"
      animate="animate"
      whileHover={hover ? "hover" : undefined}
    >
      {cardContent}
    </motion.div>
  );
};

Card.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf([
    "default",
    "elevated",
    "glass",
    "dark",
    "gradient",
    "outline",
  ]),
  padding: PropTypes.oneOf(["none", "sm", "md", "lg", "xl"]),
  hover: PropTypes.bool,
  interactive: PropTypes.bool,
  glass: PropTypes.bool,
  gradient: PropTypes.bool,
  className: PropTypes.string,
  onClick: PropTypes.func,
};

export default Card;
