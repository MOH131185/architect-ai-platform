import { useCallback } from 'react';
import { useDesignContext } from '../context/DesignContext.jsx';
import logger from '../utils/logger.js';

/**
 * useArchitectWorkflow - Navigation & Workflow Management Hook
 *
 * Provides navigation controls and workflow validation for the 7-step process:
 * 0. Landing Page
 * 1. Location Analysis
 * 2. Intelligence Report
 * 3. Portfolio Upload
 * 4. Project Specifications
 * 5. AI Generation
 * 6. Results & Modify
 *
 * @returns {Object} Navigation state and actions
 */
export const useArchitectWorkflow = () => {
  const {
    currentStep,
    goToStep,
    nextStep: contextNextStep,
    prevStep: contextPrevStep,
    locationData,
    portfolioFiles,
    projectDetails,
    programSpaces
  } = useDesignContext();

  // Step metadata
  const steps = [
    { step: 0, name: 'Landing', label: 'Welcome', icon: 'Home' },
    { step: 1, name: 'Location', label: 'Location', icon: 'MapPin' },
    { step: 2, name: 'Intelligence', label: 'Intelligence', icon: 'Sun' },
    { step: 3, name: 'Portfolio', label: 'Portfolio', icon: 'Upload' },
    { step: 4, name: 'Specifications', label: 'Specs', icon: 'Building' },
    { step: 5, name: 'Generation', label: 'Generate', icon: 'Sparkles' },
    { step: 6, name: 'Results', label: 'Results', icon: 'Eye' }
  ];

  // Validation rules for each step
  const canProceedToStep = useCallback((step) => {
    switch (step) {
      case 0:
        return true; // Landing page always accessible

      case 1:
        return true; // Location analysis always accessible

      case 2:
        // Can proceed to intelligence if location is analyzed
        return locationData !== null;

      case 3:
        // Can proceed to portfolio if location is analyzed
        return locationData !== null;

      case 4:
        // Can proceed to specifications (portfolio optional)
        return locationData !== null;

      case 5:
        // Can proceed to generation if project details are filled
        return (
          locationData !== null &&
          projectDetails.area !== '' &&
          projectDetails.program !== '' &&
          programSpaces.length > 0
        );

      case 6:
        // Results step accessible only after generation or if there's a design
        return false; // Should only be reached programmatically after generation

      default:
        return false;
    }
  }, [locationData, projectDetails, programSpaces]);

  // Navigate to next step with validation
  const nextStep = useCallback(() => {
    const targetStep = currentStep + 1;

    if (targetStep > 6) {
      logger.warn('Cannot proceed beyond results step');
      return false;
    }

    if (!canProceedToStep(targetStep)) {
      logger.warn('Cannot proceed to step - requirements not met', {
        currentStep,
        targetStep,
        stepName: steps[targetStep]?.name
      });
      return false;
    }

    logger.info('Advancing to next step', {
      from: steps[currentStep]?.name,
      to: steps[targetStep]?.name
    }, '➡️');

    contextNextStep();
    return true;
  }, [currentStep, canProceedToStep, contextNextStep, steps]);

  // Navigate to previous step
  const prevStep = useCallback(() => {
    if (currentStep === 0) {
      logger.warn('Cannot go back from landing page');
      return false;
    }

    logger.info('Returning to previous step', {
      from: steps[currentStep]?.name,
      to: steps[currentStep - 1]?.name
    }, '⬅️');

    contextPrevStep();
    return true;
  }, [currentStep, contextPrevStep, steps]);

  // Navigate to specific step with validation
  const navigateToStep = useCallback((step) => {
    if (step < 0 || step > 6) {
      logger.error('Invalid step number', { step });
      return false;
    }

    if (!canProceedToStep(step)) {
      logger.warn('Cannot navigate to step - requirements not met', {
        targetStep: step,
        stepName: steps[step]?.name
      });
      return false;
    }

    logger.info('Navigating to step', {
      from: steps[currentStep]?.name,
      to: steps[step]?.name
    }, '🧭');

    goToStep(step);
    return true;
  }, [canProceedToStep, goToStep, currentStep, steps]);

  // Get current step info
  const getCurrentStepInfo = useCallback(() => {
    return steps[currentStep] || steps[0];
  }, [currentStep, steps]);

  // Check if a specific step is accessible
  const isStepAccessible = useCallback((step) => {
    return canProceedToStep(step);
  }, [canProceedToStep]);

  // Get progress percentage (0-100)
  const getProgressPercentage = useCallback(() => {
    return Math.round((currentStep / 6) * 100);
  }, [currentStep]);

  return {
    // Current state
    currentStep,
    steps,
    currentStepInfo: getCurrentStepInfo(),
    progressPercentage: getProgressPercentage(),

    // Navigation actions
    nextStep,
    prevStep,
    navigateToStep,
    goToStep,

    // Validation
    canProceedToStep,
    isStepAccessible,

    // Convenience flags
    isLandingPage: currentStep === 0,
    isLocationStep: currentStep === 1,
    isIntelligenceStep: currentStep === 2,
    isPortfolioStep: currentStep === 3,
    isSpecsStep: currentStep === 4,
    isGenerationStep: currentStep === 5,
    isResultsStep: currentStep === 6,

    canGoBack: currentStep > 0,
    canGoForward: currentStep < 6 && canProceedToStep(currentStep + 1)
  };
};

export default useArchitectWorkflow;
