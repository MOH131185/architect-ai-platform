import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import DNAAnimation from "../animations/DNAAnimation";
import SiteAnalysisAnimation from "../animations/SiteAnalysisAnimation";
import LayoutAnimation from "../animations/LayoutAnimation";
import RenderingAnimation from "../animations/RenderingAnimation";
import FinalizingAnimation from "../animations/FinalizingAnimation";

const ActivityVisualizer = ({ stage, className = "" }) => {
  const renderAnimation = () => {
    switch (stage) {
      case "analysis":
        return <SiteAnalysisAnimation />;
      case "dna":
        return <DNAAnimation />;
      case "layout":
        return <LayoutAnimation />;
      case "rendering":
        return <RenderingAnimation />;
      case "finalizing":
        return <FinalizingAnimation />;
      default:
        return <SiteAnalysisAnimation />;
    }
  };

  return (
    <div
      className={`w-full h-48 bg-navy-900/50 rounded-xl border border-navy-700 backdrop-blur-sm flex items-center justify-center relative overflow-hidden ${className}`}
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-transparent to-transparent opacity-80" />

      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="w-full h-full flex items-center justify-center p-4"
        >
          {renderAnimation()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default ActivityVisualizer;
