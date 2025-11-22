import React from 'react';
import { DesignProvider } from './context/DesignContext.jsx';
import { useArchitectWorkflow } from './hooks/useArchitectWorkflow.js';
import LandingPage from './pages/LandingPage.jsx';
import LocationAnalysis from './pages/LocationAnalysis.jsx';
import IntelligenceReport from './pages/IntelligenceReport.jsx';
import PortfolioUpload from './pages/PortfolioUpload.jsx';
import ProjectSpecifications from './pages/ProjectSpecifications.jsx';
import AIGeneration from './pages/AIGeneration.jsx';
import ResultsAndModify from './pages/ResultsAndModify.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Toast from './components/Toast.jsx';
import { useDesignContext } from './context/DesignContext.jsx';
import { Check } from 'lucide-react';

/**
 * ArchitectAIEnhanced - Main Application Component (Refactored)
 *
 * Reduced from 5,646 lines → ~100 lines (98% reduction!)
 *
 * Architecture:
 * - Global state managed by DesignContext
 * - Business logic extracted to custom hooks
 * - Each step is a separate page component
 * - Clean separation of concerns
 *
 * @component
 */
const ArchitectAIEnhancedCore = () => {
  const { currentStep, steps } = useArchitectWorkflow();
  const { toastMessage } = useDesignContext();

  const renderStep = () => {
    switch(currentStep) {
      case 0:
        return <LandingPage />;
      case 1:
        return <LocationAnalysis />;
      case 2:
        return <IntelligenceReport />;
      case 3:
        return <PortfolioUpload />;
      case 4:
        return <ProjectSpecifications />;
      case 5:
        return <AIGeneration />;
      case 6:
        return <ResultsAndModify />;
      default:
        return <LandingPage />;
    }
  };

  return (
    <ErrorBoundary>
      <div className={`min-h-screen ${currentStep === 0 ? '' : 'bg-gray-50'} transition-colors duration-500`}>
        {/* Step Indicator - Only show after landing page */}
        {currentStep > 0 && (
          <div className="bg-white border-b border-gray-200 py-4 sticky top-0 z-40 shadow-sm">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex items-center justify-between">
                {steps.slice(1).map((item, idx) => (
                  <React.Fragment key={item.step}>
                    <div className="flex items-center">
                      <div
                        className={`
                          w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all
                          ${currentStep >= item.step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}
                        `}
                      >
                        {currentStep > item.step ? <Check className="w-4 h-4" /> : item.step}
                      </div>
                      <span
                        className={`ml-3 font-medium text-sm ${
                          currentStep >= item.step ? 'text-gray-900' : 'text-gray-500'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    {idx < steps.length - 2 && (
                      <div className={`w-12 h-0.5 mx-1 ${currentStep > item.step ? 'bg-blue-600' : 'bg-gray-300'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className={currentStep > 0 ? 'max-w-7xl mx-auto px-4 py-8' : ''}>
          {renderStep()}
        </div>

        {/* Toast Notifications */}
        {toastMessage && <Toast message={toastMessage} />}
      </div>
    </ErrorBoundary>
  );
};

// Wrap with DesignProvider
const ArchitectAIEnhanced = () => (
  <DesignProvider>
    <ArchitectAIEnhancedCore />
  </DesignProvider>
);

export default ArchitectAIEnhanced;
