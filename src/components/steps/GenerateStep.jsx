/**
 * Generate Step — Pro-Level Polish
 *
 * AI generation surface: stage timeline, elapsed/ETA timer, calm hero
 * animation. Uses shared Button + display typography. Announces progress
 * to screen readers via aria-live.
 */

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, Loader2, Check, ArrowRight } from "lucide-react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import IconWrapper from "../ui/IconWrapper.jsx";
import ErrorBanner from "../ui/ErrorBanner.jsx";
import StepContainer from "../layout/StepContainer.jsx";
import { fadeInUp, staggerChildren } from "../../styles/animations.js";
import logger from "../../utils/logger.js";
import ActivityVisualizer from "./ActivityVisualizer.jsx";

const STAGES = [
  { label: "Analyzing site conditions and requirements", key: "analysis" },
  {
    label: "Generating Design DNA — dimensions, materials, rooms",
    key: "dna",
  },
  {
    label: "Planning A1 sheet — floor plans, elevations, sections",
    key: "layout",
  },
  { label: "Rendering panels", key: "rendering" },
  { label: "Composing final A1 architectural sheet", key: "finalizing" },
];

const formatElapsedTime = (seconds) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const formatEta = (seconds) => {
  if (seconds === null) return null;
  if (seconds < 60) return `~${seconds}s remaining`;
  const mins = Math.floor(seconds / 60);
  return `~${mins}m ${seconds % 60}s remaining`;
};

const GenerateStep = ({
  loading,
  isGenerating,
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

  const currentStage = progress?.stage || "analysis";
  const percentage = progress?.percentage || 0;

  // ETA: derive remaining time from elapsed × (100/percentage).
  // Returns null while too low to be meaningful, or once done.
  // Clamp at 0 so a stalled run never shows a negative ETA.
  const etaSeconds =
    percentage > 5 && percentage < 100
      ? Math.max(
          0,
          Math.round((elapsedSeconds * 100) / percentage - elapsedSeconds),
        )
      : null;

  const heroTitle = isLoading
    ? "Generating your design"
    : generationComplete
      ? "Design complete"
      : "Ready to generate";

  const heroSubtitle = isLoading
    ? "AI is creating your professional A1 architectural sheet…"
    : generationComplete
      ? "Your design is ready to view and modify"
      : "Click below to start generation";

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
        aria-busy={isLoading || undefined}
      >
        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center">
          <div className="mb-6 flex justify-center">
            <IconWrapper size="lg" variant="gradient">
              <Sparkles className="h-8 w-8" strokeWidth={1.75} />
            </IconWrapper>
          </div>
          <h2 className="text-display-sm md:text-display-md mb-3 text-balance text-white">
            {heroTitle}
          </h2>
          <p className="mx-auto max-w-xl text-base text-white/65">
            {heroSubtitle}
          </p>
        </motion.div>

        {/* Progress Card */}
        <motion.div variants={fadeInUp}>
          <Card
            variant="glass"
            padding="xl"
            className="relative overflow-hidden"
          >
            <div className="relative z-10 space-y-8">
              {(isLoading || generationComplete) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <ActivityVisualizer
                    stage={generationComplete ? "finalizing" : currentStage}
                  />
                </motion.div>
              )}

              {/* Progress Bar */}
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-eyebrow">Progress</span>
                  <span className="text-2xl font-semibold tabular-nums text-white">
                    {percentage}%
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-white/8"
                  role="progressbar"
                  aria-valuenow={percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-royal-500 to-royal-300"
                    initial={{ width: "0%" }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>

              {/* Stage Timeline (vertical, calmer borders, single accent dot) */}
              <ol
                className="relative space-y-2"
                aria-live="polite"
                aria-label="Generation stages"
              >
                <div
                  aria-hidden="true"
                  className="absolute left-4 top-3 bottom-3 w-px bg-white/8"
                />

                {STAGES.map((stage, index) => {
                  const isActive = stage.key === currentStage;
                  const isCompleted =
                    STAGES.findIndex((s) => s.key === currentStage) > index;

                  return (
                    <motion.li
                      key={stage.key}
                      className={`relative flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors duration-200 ${
                        isActive ? "bg-royal-500/10" : ""
                      }`}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div
                        className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                          isCompleted
                            ? "bg-royal-500 text-white"
                            : isActive
                              ? "bg-royal-500/20 ring-2 ring-royal-400/60"
                              : "bg-navy-900 ring-1 ring-white/10"
                        }`}
                      >
                        {isCompleted ? (
                          <Check className="h-4 w-4" strokeWidth={2.25} />
                        ) : isActive ? (
                          <Loader2
                            className="h-4 w-4 animate-spin text-royal-200"
                            strokeWidth={2}
                          />
                        ) : (
                          <span className="text-xs tabular-nums text-white/45">
                            {index + 1}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          isActive
                            ? "font-semibold text-white"
                            : isCompleted
                              ? "text-white/70"
                              : "text-white/45"
                        }`}
                      >
                        {stage.label}
                      </span>
                    </motion.li>
                  );
                })}
              </ol>

              {/* Elapsed Time + ETA */}
              {isLoading && (
                <div className="flex items-center justify-center gap-8 border-t border-white/8 pt-6 text-sm">
                  <div className="text-center">
                    <div className="text-eyebrow mb-0.5">Elapsed</div>
                    <div className="text-base font-semibold tabular-nums text-white">
                      {formatElapsedTime(elapsedSeconds)}
                    </div>
                  </div>
                  <div aria-hidden="true" className="h-8 w-px bg-white/10" />
                  <div className="text-center">
                    <div className="text-eyebrow mb-0.5">Remaining</div>
                    <div className="text-base font-semibold tabular-nums text-royal-200">
                      {etaSeconds === null
                        ? "~ —"
                        : formatEta(etaSeconds).replace(" remaining", "")}
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Generate Button (if not auto-started) */}
              {!isLoading && !generationComplete && onGenerate && (
                <div className="border-t border-white/8 pt-6">
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => {
                      logger.info("🚀 Manual generation triggered");
                      onGenerate();
                    }}
                    icon={<Sparkles className="h-5 w-5" />}
                  >
                    Start generation
                  </Button>
                  <p className="mt-3 text-center text-xs text-white/45">
                    Generation will start automatically, or click above
                  </p>
                </div>
              )}

              {/* View Results Button (if complete) */}
              {generationComplete && onViewResults && (
                <div className="border-t border-white/8 pt-6">
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={onViewResults}
                    icon={<ArrowRight className="h-5 w-5" />}
                    iconPosition="right"
                  >
                    View your design
                  </Button>
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
              title="Generation error"
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
