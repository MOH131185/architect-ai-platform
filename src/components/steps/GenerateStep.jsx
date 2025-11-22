/**
 * Generate Step - Deepgram-Inspired Design
 * 
 * Step 5: AI generation with cinematic loading
 */

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, Check } from 'lucide-react';
import Card from '../ui/Card.jsx';
import IconWrapper from '../ui/IconWrapper.jsx';
import StepContainer from '../layout/StepContainer.jsx';
import { fadeInUp, staggerChildren, pulse } from '../../styles/animations.js';
import logger from '../../utils/logger.js';


const GenerateStep = ({
  loading,
  isGenerating, // Alternative prop name
  progress,
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
    if (!hasTriggered.current && !isLoading && !generationComplete && onGenerate) {
      hasTriggered.current = true;
      logger.info('🚀 Auto-triggering generation...');
      onGenerate();
    }
  }, [isLoading, generationComplete, onGenerate]);
  
  const stages = [
    { label: 'Analyzing site context', key: 'analysis' },
    { label: 'Generating Design DNA', key: 'dna' },
    { label: 'Creating A1 sheet layout', key: 'layout' },
    { label: 'Rendering architectural views', key: 'rendering' },
    { label: 'Finalizing design', key: 'finalizing' },
  ];
  
  const currentStage = progress?.stage || 'analysis';
  const percentage = progress?.percentage || 0;
  
  return (
    <StepContainer backgroundVariant="generate" enableParallax={true} maxWidth="4xl">
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
          {isLoading ? 'Generating Your Design' : generationComplete ? 'Design Complete' : 'Ready to Generate'}
        </h2>
        <p className="text-xl text-gray-400">
          {isLoading
            ? 'AI is creating your professional A1 architectural sheet...'
            : generationComplete
            ? 'Your design is ready to view and modify'
            : 'Click the button below to start generation'}
        </p>
      </motion.div>

      {/* Progress Card */}
      <motion.div variants={fadeInUp}>
        <Card variant="glass" padding="xl" className="relative overflow-hidden">
          {/* Animated Background */}
          <div className="absolute inset-0 blueprint-grid opacity-10" />
          
          <div className="relative z-10 space-y-8">
            {/* Progress Bar */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Progress</span>
                <span className="text-white font-semibold">{percentage}%</span>
              </div>
              <div className="h-3 bg-navy-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-royal-600 to-royal-400"
                  initial={{ width: '0%' }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Stage List */}
            <div className="space-y-4">
              {stages.map((stage, index) => {
                const isActive = stage.key === currentStage;
                const isCompleted = stages.findIndex(s => s.key === currentStage) > index;
                
                return (
                  <motion.div
                    key={stage.key}
                    className="flex items-center gap-4"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isCompleted
                        ? 'bg-royal-600'
                        : isActive
                        ? 'bg-gradient-to-br from-royal-600 to-royal-400'
                        : 'bg-navy-800'
                    }`}>
                      {isCompleted ? (
                        <Check className="w-5 h-5 text-white" />
                      ) : isActive ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <span className="text-gray-500 text-sm">{index + 1}</span>
                      )}
                    </div>
                    <span className={`text-lg ${
                      isActive ? 'text-white font-semibold' : 'text-gray-400'
                    }`}>
                      {stage.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* Estimated Time */}
            {isLoading && (
              <div className="pt-6 border-t border-navy-700">
                <p className="text-center text-gray-400">
                  Estimated time: <span className="text-white font-semibold">~60 seconds</span>
                </p>
              </div>
            )}
            
            {/* Manual Generate Button (if not auto-started) */}
            {!isLoading && !generationComplete && onGenerate && (
              <div className="pt-6 border-t border-navy-700">
                <button
                  onClick={() => {
                    logger.info('🚀 Manual generation triggered');
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
          <Card variant="elevated" padding="lg" className="bg-red-900/50 border-red-700">
            <p className="text-white text-center font-semibold mb-2">Generation Error</p>
            <p className="text-white text-center">{error}</p>
            {onGenerate && (
              <button
                onClick={onGenerate}
                className="mt-4 w-full px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Retry Generation
              </button>
            )}
          </Card>
        </motion.div>
      )}
      </motion.div>
    </StepContainer>
  );
};

export default GenerateStep;
