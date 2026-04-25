/**
 * AI Modify Panel - Deepgram-Inspired Design
 *
 * Slide-in drawer for A1 sheet modifications with gradient borders
 */

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2,
  Plus,
  Layers,
  Box,
  Sparkles,
  Lock,
  Unlock,
  Clock,
  Check,
} from "lucide-react";
import { createModifyRequest } from "../types/schemas.js";
import Button from "./ui/Button.jsx";
import Card from "./ui/Card.jsx";
import GradientBorderBox from "./ui/GradientBorderBox.jsx";
import ErrorBanner from "./ui/ErrorBanner.jsx";
import { EmptyState } from "./ui/feedback/EmptyState.jsx";
import { useToastContext } from "./ui/ToastProvider.jsx";
import { slideInRight, fadeInUp } from "../styles/animations.js";

const AIModifyPanel = ({ designId, onModify }) => {
  const [userPrompt, setUserPrompt] = useState("");
  const [quickToggles, setQuickToggles] = useState({
    addSections: false,
    add3DView: false,
    addDetails: false,
  });
  const [strictLock, setStrictLock] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const { toast } = useToastContext();

  const quickActions = [
    {
      key: "addSections",
      label: "Add Sections",
      icon: <Layers className="w-5 h-5" />,
      description: "Add missing section views",
    },
    {
      key: "add3DView",
      label: "Add 3D Views",
      icon: <Box className="w-5 h-5" />,
      description: "Add perspective renders",
    },
    {
      key: "addDetails",
      label: "Add Details",
      icon: <Plus className="w-5 h-5" />,
      description: "Enhance specifications",
    },
  ];

  const handleToggle = (key) => {
    setQuickToggles((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleModify = useCallback(async () => {
    const hasQuickToggle = Object.values(quickToggles).some((v) => v);
    if (!userPrompt.trim() && !hasQuickToggle) {
      setError(
        "Please enter modification instructions or select quick actions",
      );
      return;
    }

    if (!onModify) {
      setError("Modify handler not provided");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const modifyRequest = createModifyRequest({
        designId,
        quickToggles,
        customPrompt: userPrompt,
        strictLock,
      });

      const result = await onModify(modifyRequest);

      if (result.success) {
        setLastResult(result);
        setUserPrompt("");
        setQuickToggles({
          addSections: false,
          add3DView: false,
          addDetails: false,
        });
        const consistencyText = result.consistencyScore
          ? `Consistency ${Math.round(result.consistencyScore * 100)}%`
          : "Sheet updated";
        toast.success("Modification complete", consistencyText);
      } else {
        setError(result.error || "Modification failed");
      }
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setIsGenerating(false);
    }
  }, [designId, userPrompt, quickToggles, strictLock, onModify, toast]);

  return (
    <motion.div
      variants={slideInRight}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full"
    >
      <div className="relative h-full">
        {/* Blueprint Background */}
        <div className="absolute inset-0 blueprint-grid opacity-10 rounded-2xl" />

        {/* Content */}
        <Card
          variant="glass"
          padding="lg"
          className="relative z-10 h-full flex flex-col"
        >
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-royal-600 to-royal-400 flex items-center justify-center">
                <Wand2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white font-heading">
                  AI Modify
                </h3>
                <p className="text-sm text-gray-400">Enhance your design</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-6">
            <h4 className="text-eyebrow mb-3">Quick Actions</h4>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <GradientBorderBox
                  key={action.key}
                  animated={quickToggles[action.key]}
                  rounded="lg"
                  contentClassName="p-0"
                >
                  <motion.button
                    layout
                    onClick={() => handleToggle(action.key)}
                    className={`w-full px-4 py-3 text-left transition-colors duration-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-royal-500/30 ${
                      quickToggles[action.key]
                        ? "bg-royal-600/20"
                        : "bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`transition-colors duration-200 ${
                          quickToggles[action.key]
                            ? "text-royal-300"
                            : "text-white/40"
                        }`}
                      >
                        {action.icon}
                      </div>
                      <div className="flex-1">
                        <p
                          className={`font-semibold transition-colors duration-200 ${
                            quickToggles[action.key]
                              ? "text-white"
                              : "text-white/80"
                          }`}
                        >
                          {action.label}
                        </p>
                        <p className="text-xs text-white/50">
                          {action.description}
                        </p>
                      </div>
                      {quickToggles[action.key] && (
                        <Check
                          className="w-5 h-5 text-royal-300"
                          strokeWidth={1.75}
                        />
                      )}
                    </div>
                  </motion.button>
                </GradientBorderBox>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <div className="mb-6 flex-1">
            <h4 className="text-eyebrow mb-3">Custom Instructions</h4>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Describe your modifications..."
              className="w-full h-32 px-4 py-3 bg-white/5 border border-white/10 hover:border-white/20 rounded-xl text-white placeholder-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-royal-500/20 focus:border-royal-500 transition-all duration-200"
              disabled={isGenerating}
            />
          </div>

          {/* Consistency Lock */}
          <div className="mb-6">
            <button
              onClick={() => setStrictLock(!strictLock)}
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors duration-200 flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-royal-500/30"
            >
              {strictLock ? (
                <Lock className="w-5 h-5 text-royal-300" strokeWidth={1.75} />
              ) : (
                <Unlock className="w-5 h-5 text-white/40" strokeWidth={1.75} />
              )}
              <div className="flex-1 text-left">
                <p className="text-white font-semibold">Consistency Lock</p>
                <p className="text-xs text-white/55">
                  {strictLock
                    ? "Enabled - Preserves unchanged elements"
                    : "Disabled - More creative freedom"}
                </p>
              </div>
            </button>
          </div>

          {/* Generate Button */}
          <Button
            variant="gradient"
            size="lg"
            onClick={handleModify}
            loading={isGenerating}
            disabled={
              isGenerating ||
              (!userPrompt.trim() &&
                !Object.values(quickToggles).some((v) => v))
            }
            fullWidth
            icon={<Sparkles className="w-5 h-5" />}
          >
            {isGenerating ? "Generating..." : "Apply Modifications"}
          </Button>

          {/* Error Display */}
          <div className="mt-4">
            <ErrorBanner
              variant="error"
              message={error}
              visible={!!error}
              onDismiss={() => setError(null)}
            />
          </div>

          {/* Last Result */}
          <AnimatePresence>
            {lastResult && lastResult.success && (
              <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                exit="exit"
                className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
              >
                <div className="flex items-start gap-3">
                  <Check
                    className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5"
                    strokeWidth={1.75}
                  />
                  <div className="flex-1">
                    <p className="text-sm text-white font-semibold mb-1">
                      Modification Complete
                    </p>
                    {lastResult.consistencyScore && (
                      <p className="text-xs text-white/60 tabular-nums">
                        Consistency:{" "}
                        {Math.round(lastResult.consistencyScore * 100)}%
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Version History (placeholder) */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <h4 className="text-eyebrow mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" strokeWidth={1.75} />
              Version History
            </h4>
            <EmptyState
              variant="compact"
              size="sm"
              icon={Clock}
              title="No previous versions"
              description="Modifications will appear here."
            />
          </div>
        </Card>
      </div>
    </motion.div>
  );
};

export default AIModifyPanel;
