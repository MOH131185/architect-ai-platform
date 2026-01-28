import React, { useEffect } from 'react';
import { Sparkles, ChevronLeft, Clock, AlertCircle, Check, Search, MapPin } from 'lucide-react';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow.js';
import { useGeneration } from '../hooks/useGeneration.js';
import { motion } from 'framer-motion';

// DNA Helix Animation Component
const DNAHelix = ({ className = "" }) => (
  <div className={`flex items-center justify-center space-x-1 ${className}`}>
    {[...Array(8)].map((_, i) => (
      <motion.div
        key={i}
        className="w-2 h-8 bg-indigo-500 rounded-full opacity-60"
        animate={{
          scaleY: [0.5, 1.5, 0.5],
          opacity: [0.5, 1, 0.5],
          backgroundColor: ["#6366f1", "#a855f7", "#6366f1"]
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          delay: i * 0.15,
          ease: "easeInOut"
        }}
      />
    ))}
  </div>
);

// Magnifier Analysis Animation Component
const MagnifierScan = () => (
  <div className="relative w-16 h-16 flex items-center justify-center">
    <MapPin className="w-8 h-8 text-gray-400" />
    <motion.div
      className="absolute top-0 left-0"
      animate={{
        x: [0, 20, 0, -20, 0],
        y: [0, -20, 0, 20, 0],
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "linear"
      }}
    >
      <Search className="w-10 h-10 text-indigo-600 fill-indigo-100/50" />
    </motion.div>
  </div>
);

/**
 * AIGeneration - Step 5: AI design generation with progress tracking
 *
 * Features:
 * - Generate button to start AI workflow
 * - Multi-phase progress tracking with DNA & Analysis animations
 * - Elapsed time display
 * - Phase-by-phase status messages
 */
const AIGeneration = () => {
  const { prevStep } = useArchitectWorkflow();
  const {
    isLoading,
    generationProgress,
    elapsedTime,
    generateDesigns
  } = useGeneration();

  // Track elapsed time
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      // Elapsed time is managed by useGeneration hook
    }, 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const progressPercentage = generationProgress.percentage || 0;
  const phases = ['Initialization', 'Setup', 'Validation', 'Analysis', 'Workflow', 'Generation', 'Complete'];

  // Determine current active animation
  const currentStepName = phases[generationProgress.step] || 'Init';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center mb-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mr-4">
            <Sparkles className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">AI Design Generation</h2>
            <p className="text-gray-600">Generate comprehensive architectural designs with AI</p>
          </div>
        </div>

        {!isLoading ? (
          <>
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">What AI will generate:</h3>
              <div className="grid md:grid-cols-2 gap-3 text-sm text-gray-700">
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 mr-2"></div>
                  <span>Complete A1 architectural sheet with all views</span>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 mr-2"></div>
                  <span>Floor plans (ground and upper levels)</span>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 mr-2"></div>
                  <span>Elevations (all four facades)</span>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 mr-2"></div>
                  <span>Section views (longitudinal & transverse)</span>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 mr-2"></div>
                  <span>3D perspectives and axonometric views</span>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 mr-2"></div>
                  <span>Design DNA for consistent modifications</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900 mb-1">Generation Time</p>
                  <p className="text-sm text-blue-800">
                    Expected time: 45-60 seconds for complete A1 sheet.
                    Please wait while AI analyzes your requirements and generates the design.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={generateDesigns}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 flex items-center justify-center font-semibold text-lg shadow-lg hover:shadow-xl"
            >
              <Sparkles className="w-6 h-6 mr-3" />
              Generate AI Designs
            </button>
          </>
        ) : (
          <div className="space-y-8">
            {/* Visual Animation Area */}
            <div className="flex items-center justify-center py-8 min-h-[120px]">
              {currentStepName === 'Analysis' ? (
                <MagnifierScan />
              ) : (
                <DNAHelix className="h-16" />
              )}
            </div>

            {/* Progress Bar with DNA Styling */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  {currentStepName === 'Analysis' ? <Search className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  {generationProgress.message || 'Processing...'}
                </span>
                <span className="text-sm font-semibold text-indigo-600">
                  {progressPercentage}%
                </span>
              </div>

              {/* DNA Chain Background for Progress Bar */}
              <div className="w-full h-4 bg-gray-100 rounded-full relative overflow-hidden ring-1 ring-gray-200">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #6366f1 0, #6366f1 10px, transparent 10px, transparent 20px)' }}></div>

                {/* Active Progress */}
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 relative"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ type: "spring", stiffness: 50 }}
                >
                  <div className="absolute inset-0 w-full h-full animate-pulse opacity-50 bg-white/20"></div>
                </motion.div>
              </div>
            </div>

            {/* Visual Phases List */}
            <div className="space-y-3">
              {phases.map((phase, index) => {
                const isComplete = index < generationProgress.step;
                const isCurrent = index === generationProgress.step;

                return (
                  <div
                    key={phase}
                    className={`flex items-center p-3 rounded-xl transition-all border ${isCurrent
                        ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                        : isComplete
                          ? 'bg-white border-green-100 text-green-700'
                          : 'bg-white border-transparent opacity-50'
                      }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 transition-colors ${isCurrent
                          ? 'bg-indigo-100 text-indigo-600'
                          : isComplete
                            ? 'bg-green-100 text-green-600'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                    >
                      {isComplete ? (
                        <Check className="w-4 h-4" />
                      ) : isCurrent ? (
                        // Small DNA or active indicator
                        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-ping" />
                      ) : (
                        <div className="w-2 h-2 bg-gray-300 rounded-full" />
                      )}
                    </div>

                    <span className={`font-medium ${isCurrent ? 'text-indigo-900' : ''}`}>
                      {phase}
                    </span>

                    {isCurrent && phase === 'Analysis' && (
                      <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full animate-pulse">
                        Scanning Location...
                      </span>
                    )}

                    {isCurrent && (phase === 'Workflow' || phase === 'Generation') && (
                      <span className="ml-auto text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full animate-pulse">
                        Generating DNA...
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Elapsed Time */}
            <div className="flex items-center justify-center text-sm text-gray-500">
              <Clock className="w-4 h-4 mr-2" />
              <span>Elapsed time: {elapsedTime}s</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      {!isLoading && (
        <div className="flex justify-between">
          <button
            onClick={prevStep}
            className="flex items-center px-6 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </button>
        </div>
      )}
    </div>
  );
};

export default AIGeneration;
