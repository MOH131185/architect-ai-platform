import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * AnimatedLogo - Creates a "drawn" or "digitally constructed" reveal effect for PNG logos
 *
 * Simulates a drawing effect by:
 * 1. Showing a silhouette/outline first (simulating a sketch/wireframe)
 * 2. Using a wipe/clip-path animation to fill it in
 * 3. Adding a "pen" or "laser" spark at the leading edge of the wipe
 */
const AnimatedLogo = ({
  src,
  alt,
  className = "",
  delay = 0,
  variant = "draw", // 'draw' | 'construct' | 'fade'
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  // Parse height/width from className if possible, or default
  // This is a bit rough, but needed for the absolute positioning of layers
  // We'll rely on the parent containersizing usually.

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ position: "relative" }}
    >
      {/* Hidden source to ensure loading and sizing */}
      <img
        src={src}
        alt={alt}
        className={`opacity-0 ${className}`}
        onLoad={() => setIsLoaded(true)}
      />

      {isLoaded && (
        <>
          {/* Layer 1: The "Sketch/Outline" Shadow */}
          <motion.div
            className={`absolute top-0 left-0 w-full h-full pointer-events-none ${className}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: 1.5, delay: delay, times: [0, 0.2, 1] }}
            style={{
              filter:
                "brightness(0) invert(1) drop-shadow(0 0 1px #00A8FF) drop-shadow(0 0 2px #00A8FF)",
              zIndex: 1,
            }}
          >
            <img
              src={src}
              alt=""
              className={`w-full h-full object-contain ${className.replace("h-", "").replace("w-", "")}`}
            />
          </motion.div>

          {/* Layer 2: The "Fill" Reveal */}
          <motion.div
            className={`absolute top-0 left-0 w-full h-full ${className}`}
            initial={{
              clipPath: "polygon(0 0, 0 100%, 0 100%, 0 0)",
              filter: "grayscale(100%)",
            }}
            animate={{
              clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
              filter: "grayscale(0%)",
            }}
            transition={{
              duration: 1.5,
              delay: delay + 0.2,
              ease: "easeInOut",
            }}
            style={{ zIndex: 2 }}
          >
            <img
              src={src}
              alt={alt}
              className={`w-full h-full object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.6)] ${className.replace("h-", "").replace("w-", "")}`}
            />
          </motion.div>

          {/* Layer 3: The "Laser/Pen" Leading Edge */}
          <motion.div
            className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_15px_white] z-10"
            initial={{ left: "0%", opacity: 0 }}
            animate={{
              left: ["0%", "100%"],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 1.5,
              delay: delay + 0.2,
              ease: "easeInOut",
            }}
          />
        </>
      )}
    </div>
  );
};

export default AnimatedLogo;
