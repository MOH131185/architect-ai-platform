import React, { useEffect } from 'react';
import { Sparkles, ChevronLeft, Loader2, Clock, AlertCircle } from 'lucide-react';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow.js';
import { useGeneration } from '../hooks/useGeneration.js';

/**
 * AIGeneration - Step 5: AI design generation with progress tracking
 *
 * Features:
 * - Generate button to start AI workflow
 * - Multi-phase progress tracking
 * - Elapsed time display
 * - Phase-by-phase status messages
 * - Rate limit notifications
 * - Generation statistics
 *
 * @component
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
          <div className="space-y-6">
            {/* Progress Bar */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {generationProgress.message || 'Initializing...'}
                </span>
                <span className="text-sm font-semibold text-indigo-600">
                  {progressPercentage}%
                </span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>

            {/* Phase Indicators */}
            <div className="space-y-2">
              {phases.map((phase, index) => {
                const isComplete = index < generationProgress.step;
                const isCurrent = index === generationProgress.step;
                const isPending = index > generationProgress.step;

                return (
                  <div
                    key={phase}
                    className={`flex items-center p-3 rounded-xl transition-all ${
                      isCurrent
                        ? 'bg-indigo-50 border-2 border-indigo-300'
                        : isComplete
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                        isCurrent
                          ? 'bg-indigo-600 text-white'
                          : isComplete
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-300 text-gray-600'
                      }`}
                    >
                      {isComplete ? (
                        '✓'
                      ) : isCurrent ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span
                      className={`font-medium ${
                        isCurrent
                          ? 'text-indigo-900'
                          : isComplete
                          ? 'text-green-900'
                          : 'text-gray-500'
                      }`}
                    >
                      {phase}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Elapsed Time */}
            <div className="flex items-center justify-center text-sm text-gray-600 pt-4">
              <Clock className="w-4 h-4 mr-2" />
              <span>Elapsed time: {elapsedTime}s</span>
            </div>

            {/* Info Message */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Please wait...</span> AI is analyzing your requirements,
                generating design DNA, and creating your comprehensive A1 architectural sheet.
                Do not close this window.
              </p>
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
