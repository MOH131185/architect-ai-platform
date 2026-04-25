import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";
import { cardReveal } from "../../styles/animations.js";

const StatCard = ({
  value,
  label,
  suffix = "",
  prefix = "",
  icon = null,
  animate = true,
  duration = 2,
  className = "",
  ...props
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!animate) {
      setDisplayValue(value);
      return;
    }

    let startTime;
    let animationFrame;

    const animateValue = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);

      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = Math.floor(easeOutQuart * value);

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animateValue);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrame = requestAnimationFrame(animateValue);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [value, animate, duration]);

  return (
    <motion.div
      className={`relative p-8 rounded-2xl bg-navy-800 border border-white/10 hover:border-royal-600/60 transition-all duration-200 ${className}`}
      variants={cardReveal}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true }}
      whileHover={{ y: -2, boxShadow: "0 0 20px rgba(37, 99, 235, 0.25)" }}
      transition={{ duration: 0.2 }}
      {...props}
    >
      {icon && <div className="mb-4 text-royal-400">{icon}</div>}

      <div
        className="text-5xl font-bold text-white mb-2 font-heading tabular-nums"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {prefix}
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {displayValue}
        </motion.span>
        {suffix}
      </div>

      <div className="text-white/55 text-lg">{label}</div>

      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-royal-600/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </motion.div>
  );
};

StatCard.propTypes = {
  value: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
  suffix: PropTypes.string,
  prefix: PropTypes.string,
  icon: PropTypes.node,
  animate: PropTypes.bool,
  duration: PropTypes.number,
  className: PropTypes.string,
};

export default StatCard;
