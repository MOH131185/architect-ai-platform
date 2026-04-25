/**
 * Generate Step - Deepgram-Inspired Design
 *
 * Step 5: AI generation with cinematic loading
 */

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, Loader2, Check } from "lucide-react";
import Card from "../ui/Card.jsx";
import IconWrapper from "../ui/IconWrapper.jsx";
import ErrorBanner from "../ui/ErrorBanner.jsx";
import StepContainer from "../layout/StepContainer.jsx";
import { fadeInUp, staggerChildren, pulse } from "../../styles/animations.js";
import logger from "../../utils/logger.js";
import ActivityVisualizer from "./ActivityVisualizer.jsx";

const GenerateStep = ({
  loading,
  isGenerating, // Alternative prop name
  progress,
  elapsedSeconds = 0,
  error,
  onGenerate,
  generationComplete,
  onBack,
  onViewResults,
}) => {
  const hasTriggered = useRef(false);
  const isLoading = loading || isGenerating;

  // Auto-trigger generation when step loads
  useEffect(() => {
    if (
      !hasTriggered.current &&
      !isLoading &&
      !generationComplete &&
      onGenerate
    ) {
      hasTriggered.current = true;
      logger.info("🚀 Auto-triggering generation...");
      onGenerate();
    }
  }, [isLoading, generationComplete, onGenerate]);

  const stages = [
    { label: "Analyzing site conditions and requirements", key: "analysis" },
    {
      label: "Generating Design DNA — dimensions, materials, rooms",
      key: "dna",
    },
    {
      label: "Planning A1 sheet — floor plans, elevations, sections",
      key: "layout",
    },
    { label: "Rendering panels with FLUX AI (2-3 minutes)", key: "rendering" },
    { label: "Composing final A1 architectural sheet", key: "finalizing" },
  ];

  const currentStage = progress?.stage || "analysis";
  const percentage = progress?.percentage || 0;
  const formatElapsedTime = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  // ETA estimate: derive remaining time from elapsed × (100/percentage).
  // Returns null while percentage is too low to be meaningful, or once done.
  const etaSeconds =
    percentage > 5 && percentage < 100
      ? Math.max(
          0,
          Math.round((elapsedSeconds * 100) / percentage - elapsedSeconds),
        )
      : null;
  const formatEta = (seconds) => {
    if (seconds === null) return null;
    if (seconds < 60) return `~${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    return `~${mins}m ${seconds % 60}s remaining`;
  };

  return (
    <StepContainer
      backgroundVariant="generate"
      enableParallax={true}
      maxWidth="4xl"
    >
      <motion.div
        className="space-y-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center">
          <motion.div
            className="flex justify-center mb-6"
            variants={pulse}
            animate="animate"
          >
            <IconWrapper size="xl" variant="gradient" glow>
              <Sparkles className="w-12 h-12" />
            </IconWrapper>
          </motion.div>
          <h2 className="text-4xl font-bold text-white mb-4 font-heading">
            {isLoading
              ? "Generating Your Design"
              : generationComplete
                ? "Design Complete"
                : "Ready to Generate"}
          </h2>
          <p className="text-xl text-gray-400">
            {isLoading
              ? "AI is creating your professional A1 architectural sheet..."
              : generationComplete
                ? "Your design is ready to view and modify"
                : "Click the button below to start generation"}
          </p>
        </motion.div>

        {/* Progress Card */}
        <motion.div variants={fadeInUp}>
          <Card
            variant="glass"
            padding="xl"
            className="relative overflow-hidden"
          >
            {/* Animated Background */}
            <div className="absolute inset-0 blueprint-grid opacity-10" />

            <div className="relative z-10 space-y-8">
              {/* Activity Visualizer - Hero Animation Area */}
              {/* Activity Visualizer - Hero Animation Area */}
              {(isLoading || generationComplete) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <ActivityVisualizer
                    stage={generationComplete ? "finalizing" : currentStage}
                  />
                </motion.div>
              )}

              {/* Progress Bar */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Progress</span>
                  <span className="text-white font-semibold">
                    {percentage}%
                  </span>
                </div>
                <div className="h-3 bg-navy-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-royal-600 to-royal-400"
                    initial={{ width: "0%" }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              {/* Stage Timeline (vertical, with connecting rail + active glow) */}
              <div className="relative space-y-3">
                {/* Vertical rail behind the nodes */}
                <div
                  className="absolute left-4 top-3 bottom-3 w-px bg-white/10"
                  aria-hidden="true"
                />

                {stages.map((stage, index) => {
                  const isActive = stage.key === currentStage;
                  const isCompleted =
                    stages.findIndex((s) => s.key === currentStage) > index;

                  return (
                    <motion.div
                      key={stage.key}
                      className={`relative flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors duration-200 ${
                        isActive
                          ? "bg-royal-600/10 border-l-2 border-royal-500"
                          : "border-l-2 border-transparent"
                      }`}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.08 }}
                    >
                      <div
                        className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isCompleted
                            ? "bg-royal-600 shadow-md shadow-royal-600/30"
                            : isActive
                              ? "bg-gradient-to-br from-royal-600 to-royal-400 shadow-md shadow-royal-500/40"
                              : "bg-navy-800 border border-white/10"
                        }`}
                      >
                        {isCompleted ? (
                          <Check
                            className="w-4 h-4 text-white"
                            strokeWidth={2}
                          />
                        ) : isActive ? (
                          <Loader2
                            className="w-4 h-4 text-white animate-spin"
                            strokeWidth={1.75}
                          />
                        ) : (
                          <span className="text-white/40 text-sm tabular-nums">
                            {index + 1}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-base ${
                          isActive
                            ? "text-white font-semibold"
                            : isCompleted
                              ? "text-white/70"
                              : "text-white/45"
                        }`}
                      >
                        {stage.label}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Elapsed Time + ETA */}
              {isLoading && (
                <div className="pt-6 border-t border-white/10 flex items-center justify-center gap-6 text-sm">
                  <p className="text-white/55">
                    Elapsed:{" "}
                    <span className="text-white font-semibold tabular-nums">
                      {formatElapsedTime(elapsedSeconds)}
                    </span>
                  </p>
                  {etaSeconds !== null && (
                    <p className="text-royal-300 tabular-nums">
                      {formatEta(etaSeconds)}
                    </p>
                  )}
                </div>
              )}

              {/* Manual Generate Button (if not auto-started) */}
              {!isLoading && !generationComplete && onGenerate && (
                <div className="pt-6 border-t border-navy-700">
                  <button
                    onClick={() => {
                      logger.info("🚀 Manual generation triggered");
                      onGenerate();
                    }}
                    className="w-full px-6 py-3 bg-gradient-to-r from-royal-600 to-royal-500 text-white rounded-lg font-semibold hover:from-royal-700 hover:to-royal-600 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-royal-500/50"
                  >
                    <Sparkles className="w-5 h-5" />
                    Start Generation
                  </button>
                  <p className="text-center text-sm text-gray-500 mt-3">
                    Generation will start automatically or click above
                  </p>
                </div>
              )}

              {/* View Results Button (if complete) */}
              {generationComplete && onViewResults && (
                <div className="pt-6 border-t border-navy-700">
                  <button
                    onClick={onViewResults}
                    className="w-full px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-600 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-emerald-500/50"
                  >
                    <Check className="w-5 h-5" />
                    View Your Design
                  </button>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Error Display */}
        {error && (
          <motion.div variants={fadeInUp}>
            <ErrorBanner
              variant="error"
              title="Generation Error"
              message={error}
              onRetry={onGenerate}
              visible={true}
            />
          </motion.div>
        )}
      </motion.div>
    </StepContainer>
  );
};

export default GenerateStep;
