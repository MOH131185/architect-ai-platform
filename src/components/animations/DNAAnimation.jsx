
import React from 'react';
import { motion } from 'framer-motion';

const DNAAnimation = ({ className = "w-full h-32" }) => {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
      {/* Background Glow */}
      <div className="absolute inset-0 bg-royal-500/5 blur-3xl rounded-full" />
      
      <svg
        viewBox="0 0 200 60"
        className="w-full h-full max-w-[400px]"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="dnaGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(37, 99, 235, 0)" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="rgba(37, 99, 235, 0)" />
          </linearGradient>
          <linearGradient id="dnaGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(96, 165, 250, 0)" />
            <stop offset="50%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
          </linearGradient>
        </defs>

        {/* Strand 1 */}
        <motion.path
          d="M0,30 Q25,5 50,30 T100,30 T150,30 T200,30"
          fill="none"
          stroke="url(#dnaGradient1)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathOffset: 0 }}
          animate={{ 
            d: [
              "M0,30 Q25,5 50,30 T100,30 T150,30 T200,30",
              "M0,30 Q25,55 50,30 T100,30 T150,30 T200,30", 
              "M0,30 Q25,5 50,30 T100,30 T150,30 T200,30"
            ] 
          }}
          transition={{ 
            duration: 2, 
            ease: "linear", 
            repeat: Infinity 
          }}
        />

        {/* Strand 2 (Opposite Phase) */}
        <motion.path
          d="M0,30 Q25,55 50,30 T100,30 T150,30 T200,30"
          fill="none"
          stroke="url(#dnaGradient2)"
          strokeWidth="3"
          strokeLinecap="round"
          animate={{ 
            d: [
              "M0,30 Q25,55 50,30 T100,30 T150,30 T200,30", 
              "M0,30 Q25,5 50,30 T100,30 T150,30 T200,30",
              "M0,30 Q25,55 50,30 T100,30 T150,30 T200,30"
            ] 
          }}
          transition={{ 
            duration: 2, 
            ease: "linear", 
            repeat: Infinity 
          }}
        />

        {/* Connecting Base Pairs (Particles) */}
        {[...Array(6)].map((_, i) => (
          <motion.circle
            key={i}
            r="2"
            fill="#60a5fa"
            initial={{ cx: 25 + i * 30, cy: 30, opacity: 0 }}
            animate={{ 
              cy: [5, 55, 5],
              opacity: [0, 1, 0]
            }}
            transition={{ 
              duration: 2, 
              ease: "easeInOut", 
              repeat: Infinity,
              delay: i * 0.2
            }}
          />
        ))}
      </svg>
    </div>
  );
};

export default DNAAnimation;
