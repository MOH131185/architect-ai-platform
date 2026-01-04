/**
 * Animated Background Component
 * 
 * Multi-layer gradient background with parallax and zoom effects
 * Inspired by Deepgram's dynamic backgrounds
 */

import React, { useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { zoomRotateBackground, architecturalGrid } from '../../styles/animations.js';

const AnimatedBackground = ({ variant = 'default', enableParallax = true, intensity = 0.5 }) => {
  const containerRef = useRef(null);
  
  // Mouse position tracking
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Smooth spring animation for mouse movement
  const springConfig = { damping: 25, stiffness: 150 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);
  
  // Transform mouse position to parallax movement
  const parallaxX1 = useTransform(smoothMouseX, [-1, 1], [-20 * intensity, 20 * intensity]);
  const parallaxY1 = useTransform(smoothMouseY, [-1, 1], [-20 * intensity, 20 * intensity]);
  const parallaxX2 = useTransform(smoothMouseX, [-1, 1], [-40 * intensity, 40 * intensity]);
  const parallaxY2 = useTransform(smoothMouseY, [-1, 1], [-40 * intensity, 40 * intensity]);
  
  // Track mouse movement
  useEffect(() => {
    if (!enableParallax) return;
    
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      
      mouseX.set(x);
      mouseY.set(y);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [enableParallax, mouseX, mouseY]);
  
  // Variant-specific gradients
  const gradients = {
    default: {
      layer1: 'from-navy-950 via-navy-900 to-navy-950',
      layer2: 'from-royal-900/20 via-royal-800/10 to-transparent',
      layer3: 'from-transparent via-royal-600/5 to-transparent',
    },
    blueprint: {
      layer1: 'from-navy-950 via-slate-900 to-navy-950',
      layer2: 'from-blue-900/20 via-blue-800/10 to-transparent',
      layer3: 'from-transparent via-cyan-600/5 to-transparent',
    },
    generate: {
      layer1: 'from-navy-950 via-purple-950 to-navy-950',
      layer2: 'from-royal-900/30 via-purple-800/15 to-transparent',
      layer3: 'from-transparent via-royal-500/10 to-transparent',
    },
    results: {
      layer1: 'from-navy-950 via-emerald-950 to-navy-950',
      layer2: 'from-emerald-900/20 via-emerald-800/10 to-transparent',
      layer3: 'from-transparent via-emerald-600/5 to-transparent',
    },
  };
  
  const currentGradients = gradients[variant] || gradients.default;
  
  return (
    <div ref={containerRef} className="fixed inset-0 -z-10 overflow-hidden">
      {/* Base layer with zoom/rotate */}
      <motion.div
        className={`absolute inset-0 bg-gradient-to-br ${currentGradients.layer1}`}
        variants={zoomRotateBackground}
        initial="initial"
        animate="animate"
      />
      
      {/* Parallax layer 1 */}
      {enableParallax && (
        <motion.div
          className={`absolute inset-0 bg-gradient-to-tr ${currentGradients.layer2}`}
          style={{ x: parallaxX1, y: parallaxY1 }}
        />
      )}
      
      {/* Parallax layer 2 */}
      {enableParallax && (
        <motion.div
          className={`absolute inset-0 bg-gradient-radial ${currentGradients.layer3}`}
          style={{ x: parallaxX2, y: parallaxY2 }}
        />
      )}
      
      {/* Architectural grid overlay */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
        variants={architecturalGrid}
        initial="initial"
        animate="animate"
      />
      
      {/* Noise texture */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
        }}
      />
      
      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/40" />
    </div>
  );
};

export default AnimatedBackground;

