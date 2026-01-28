/**
 * AI Modify Panel - Deepgram-Inspired Design
 * 
 * Slide-in drawer for A1 sheet modifications with gradient borders
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  AlertCircle,
} from 'lucide-react';
import { createModifyRequest } from '../types/schemas.js';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import GradientBorderBox from './ui/GradientBorderBox.jsx';
import { slideInRight, fadeInUp } from '../styles/animations.js';

const AIModifyPanel = ({
  designId,
  onModify,
}) => {
  const [userPrompt, setUserPrompt] = useState('');
  const [quickToggles, setQuickToggles] = useState({
    addSections: false,
    add3DView: false,
    addDetails: false,
  });
  const [strictLock, setStrictLock] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  
  const quickActions = [
    {
      key: 'addSections',
      label: 'Add Sections',
      icon: <Layers className="w-5 h-5" />,
      description: 'Add missing section views',
    },
    {
      key: 'add3DView',
      label: 'Add 3D Views',
      icon: <Box className="w-5 h-5" />,
      description: 'Add perspective renders',
    },
    {
      key: 'addDetails',
      label: 'Add Details',
      icon: <Plus className="w-5 h-5" />,
      description: 'Enhance specifications',
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
      setError('Please enter modification instructions or select quick actions');
      return;
    }
    
    if (!onModify) {
      setError('Modify handler not provided');
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
        setUserPrompt('');
        setQuickToggles({
          addSections: false,
          add3DView: false,
          addDetails: false,
        });
      } else {
        setError(result.error || 'Modification failed');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsGenerating(false);
    }
  }, [designId, userPrompt, quickToggles, strictLock, onModify]);
  
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
        <Card variant="glass" padding="lg" className="relative z-10 h-full flex flex-col">
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
                <p className="text-sm text-gray-400">
                  Enhance your design
                </p>
              </div>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
              Quick Actions
            </h4>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <GradientBorderBox
                  key={action.key}
                  animated={quickToggles[action.key]}
                  rounded="lg"
                  contentClassName="p-0"
                >
                  <button
                    onClick={() => handleToggle(action.key)}
                    className={`w-full p-4 text-left transition-all duration-300 rounded-lg ${
                      quickToggles[action.key]
                        ? 'bg-royal-600/20'
                        : 'bg-navy-900/50 hover:bg-navy-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`transition-colors duration-300 ${
                        quickToggles[action.key] ? 'text-royal-400' : 'text-gray-500'
                      }`}>
                        {action.icon}
                      </div>
                      <div className="flex-1">
                        <p className={`font-semibold transition-colors duration-300 ${
                          quickToggles[action.key] ? 'text-white' : 'text-gray-300'
                        }`}>
                          {action.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          {action.description}
                        </p>
                      </div>
                      {quickToggles[action.key] && (
                        <Check className="w-5 h-5 text-royal-400" />
                      )}
                    </div>
                  </button>
                </GradientBorderBox>
              ))}
            </div>
          </div>
          
          {/* Custom Prompt */}
          <div className="mb-6 flex-1">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
              Custom Instructions
            </h4>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Describe your modifications..."
              className="w-full h-32 px-4 py-3 bg-navy-900/50 border border-navy-700 rounded-xl text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-royal-500 focus:border-royal-500 transition-all duration-200"
              disabled={isGenerating}
            />
          </div>
          
          {/* Consistency Lock */}
          <div className="mb-6">
            <button
              onClick={() => setStrictLock(!strictLock)}
              className="w-full p-4 rounded-xl bg-navy-900/50 border border-navy-700 hover:border-navy-600 transition-all duration-300 flex items-center gap-3"
            >
              {strictLock ? (
                <Lock className="w-5 h-5 text-royal-400" />
              ) : (
                <Unlock className="w-5 h-5 text-gray-500" />
              )}
              <div className="flex-1 text-left">
                <p className="text-white font-semibold">
                  Consistency Lock
                </p>
                <p className="text-xs text-gray-500">
                  {strictLock ? 'Enabled - Preserves unchanged elements' : 'Disabled - More creative freedom'}
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
            disabled={isGenerating || (!userPrompt.trim() && !Object.values(quickToggles).some(v => v))}
            fullWidth
            icon={<Sparkles className="w-5 h-5" />}
          >
            {isGenerating ? 'Generating...' : 'Apply Modifications'}
          </Button>
          
          {/* Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                exit="exit"
                className="mt-4 p-4 rounded-xl bg-red-900/50 border border-red-700"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Last Result */}
          <AnimatePresence>
            {lastResult && lastResult.success && (
              <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                exit="exit"
                className="mt-4 p-4 rounded-xl bg-royal-600/10 border border-royal-600/20"
              >
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-royal-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-white font-semibold mb-1">
                      Modification Complete
                    </p>
                    {lastResult.consistencyScore && (
                      <p className="text-xs text-gray-400">
                        Consistency: {Math.round(lastResult.consistencyScore * 100)}%
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Version History (placeholder) */}
          <div className="mt-6 pt-6 border-t border-navy-700">
            <h4 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Version History
            </h4>
            <p className="text-sm text-gray-500 text-center py-4">
              No previous versions
            </p>
          </div>
        </Card>
      </div>
    </motion.div>
  );
};

export default AIModifyPanel;
