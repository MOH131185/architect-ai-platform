import React, { useState, useEffect } from 'react';
import { Clock, Zap, AlertTriangle } from 'lucide-react';

const PerformanceMonitor = ({ isGenerating, generationStartTime, currentStep }) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [performanceWarning, setPerformanceWarning] = useState(false);

  useEffect(() => {
    let interval;
    
    if (isGenerating && generationStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - generationStartTime) / 1000);
        setElapsedTime(elapsed);
        
        // Show warning if taking too long
        if (elapsed > 60) {
          setPerformanceWarning(true);
        }
      }, 1000);
    } else {
      setElapsedTime(0);
      setPerformanceWarning(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating, generationStartTime]);

  if (!isGenerating) return null;

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getStepMessage = () => {
    switch (currentStep) {
      case 'reasoning':
        return 'Generating design reasoning...';
      case 'visualizations':
        return 'Creating architectural visualizations...';
      case 'alternatives':
        return 'Generating design alternatives...';
      case 'feasibility':
        return 'Analyzing feasibility...';
      default:
        return 'Processing your request...';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-4 max-w-sm border-l-4 border-blue-500">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-gray-900">
          {formatTime(elapsedTime)}
        </span>
        {performanceWarning && (
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
        )}
      </div>
      
      <p className="text-sm text-gray-600 mb-2">
        {getStepMessage()}
      </p>
      
      {performanceWarning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
          <Zap className="w-3 h-3 inline mr-1" />
          Taking longer than usual. This might indicate missing API keys or network issues.
        </div>
      )}
      
      <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
        <div 
          className="bg-blue-600 h-1 rounded-full transition-all duration-300"
          style={{ 
            width: `${Math.min((elapsedTime / 120) * 100, 100)}%` 
          }}
        />
      </div>
    </div>
  );
};

export default PerformanceMonitor;
