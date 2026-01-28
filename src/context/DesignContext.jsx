import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import logger from '../utils/logger.js';

/**
 * DesignContext - Global State Management for Architect AI Platform
 *
 * Manages all application state previously housed in ArchitectAIEnhanced.js
 * Provides centralized state management with Context API for better performance and maintainability
 */

const DesignContext = createContext(null);

export const useDesignContext = () => {
  const context = useContext(DesignContext);
  if (!context) {
    throw new Error('useDesignContext must be used within a DesignProvider');
  }
  return context;
};

export const DesignProvider = ({ children }) => {
  // ===== NAVIGATION STATE =====
  const [currentStep, setCurrentStep] = useState(0);

  // ===== LOCATION DATA =====
  const [locationData, setLocationData] = useState(null);
  const [address, setAddress] = useState('');
  const [sitePolygon, setSitePolygon] = useState(null);
  const [siteMetrics, setSiteMetrics] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null); // { accuracy: number, qualityScore: number }

  // ===== PORTFOLIO & STYLE =====
  const [portfolioFiles, setPortfolioFiles] = useState([]);
  const [materialWeight, setMaterialWeight] = useState(0.5);
  const [characteristicWeight, setCharacteristicWeight] = useState(0.5);
  const [projectStyleSignature, setProjectStyleSignature] = useState(null);

  // ===== PROJECT SPECIFICATIONS =====
  const [projectDetails, setProjectDetails] = useState({
    area: '',
    program: '',
    entranceDirection: ''
  });
  const [programSpaces, setProgramSpaces] = useState([]);

  // ===== LEVEL COUNT CONTROL =====
  // null = auto-detect based on site/program area, number = manually locked
  const [lockedLevelCount, setLockedLevelCount] = useState(null);
  // Stores the auto-calculated value for UI display even when locked
  const [autoDetectedLevelCount, setAutoDetectedLevelCount] = useState(null);
  // Stores floor metrics for UI display (footprint, coverage, etc.)
  const [levelMetrics, setLevelMetrics] = useState(null);

  // ===== GENERATION RESULTS =====
  const [generatedDesigns, setGeneratedDesigns] = useState(null);
  const [currentDesignId, setCurrentDesignId] = useState(() => {
    try {
      return sessionStorage.getItem('currentDesignId') || null;
    } catch {
      return null;
    }
  });
  const [currentProjectId, setCurrentProjectId] = useState(null);

  // ===== UI STATE =====
  const [isLoading, setIsLoading] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingSpaces, setIsGeneratingSpaces] = useState(false);
  const [showModifyDrawer, setShowModifyDrawer] = useState(false);
  const [showModificationPanel, setShowModificationPanel] = useState(false);

  // ===== PROGRESS TRACKING =====
  const [generationProgress, setGenerationProgress] = useState({
    currentPhase: '',
    phasesComplete: 0,
    totalPhases: 0,
    currentView: '',
    viewsComplete: 0,
    totalViews: 0
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [generationStartTime, setGenerationStartTime] = useState(null);
  const [isGenerationComplete, setIsGenerationComplete] = useState(false);
  const [rateLimitPause, setRateLimitPause] = useState({
    active: false,
    remainingSeconds: 0,
    reason: ''
  });

  // ===== MODAL & IMAGE STATE =====
  const [modalImage, setModalImage] = useState(null);
  const [modalImageTitle, setModalImageTitle] = useState('');
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // ===== NOTIFICATIONS & MISC =====
  const [toastMessage, setToastMessage] = useState('');
  const [downloadCount, setDownloadCount] = useState(0);

  // ===== REFS (Non-State Persistent Data) =====
  const sessionStartTime = useRef(Date.now());
  const hasDetectedLocation = useRef(false);

  // ===== PERSIST currentDesignId TO SESSION STORAGE =====
  useEffect(() => {
    if (currentDesignId) {
      try {
        sessionStorage.setItem('currentDesignId', currentDesignId);
      } catch (error) {
        logger.error('Failed to persist currentDesignId', error);
      }
    }
  }, [currentDesignId]);

  // ===== NAVIGATION ACTIONS =====
  const goToStep = useCallback((step) => {
    if (step >= 0 && step <= 6) {
      setCurrentStep(step);
      logger.info('Navigated to step', { step }, '🧭');
    }
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, 6));
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  // ===== RESET ACTIONS =====
  const resetState = useCallback(() => {
    setCurrentStep(0);
    setLocationData(null);
    setAddress('');
    setSitePolygon(null);
    setSiteMetrics(null);
    setLocationAccuracy(null);
    setPortfolioFiles([]);
    setMaterialWeight(0.5);
    setCharacteristicWeight(0.5);
    setProjectStyleSignature(null);
    setProjectDetails({ area: '', program: '', entranceDirection: '' });
    setProgramSpaces([]);
    setLockedLevelCount(null);
    setAutoDetectedLevelCount(null);
    setLevelMetrics(null);
    setGeneratedDesigns(null);
    setCurrentDesignId(null);
    setCurrentProjectId(null);
    setIsLoading(false);
    setIsDetectingLocation(false);
    setIsUploading(false);
    setIsGeneratingSpaces(false);
    setShowModifyDrawer(false);
    setShowModificationPanel(false);
    setGenerationProgress({
      currentPhase: '',
      phasesComplete: 0,
      totalPhases: 0,
      currentView: '',
      viewsComplete: 0,
      totalViews: 0
    });
    setElapsedTime(0);
    setGenerationStartTime(null);
    setIsGenerationComplete(false);
    setRateLimitPause({ active: false, remainingSeconds: 0, reason: '' });
    setModalImage(null);
    setModalImageTitle('');
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setToastMessage('');
    setDownloadCount(0);

    logger.info('State reset', null, '🔄');
  }, []);

  // ===== TOAST HELPER =====
  const showToast = useCallback((message, duration = 3000) => {
    setToastMessage(message);
    logger.info('Toast shown', { message }, '📢');

    setTimeout(() => {
      setToastMessage('');
    }, duration);
  }, []);

  // ===== IMAGE MODAL ACTIONS =====
  const openImageModal = useCallback((url, title = '') => {
    setModalImage(url);
    setModalImageTitle(title);
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  }, []);

  const closeImageModal = useCallback(() => {
    setModalImage(null);
    setModalImageTitle('');
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
  }, []);

  // ===== CONTEXT VALUE =====
  const value = {
    // Navigation
    currentStep,
    setCurrentStep,
    goToStep,
    nextStep,
    prevStep,

    // Location
    locationData,
    setLocationData,
    address,
    setAddress,
    sitePolygon,
    setSitePolygon,
    siteMetrics,
    setSiteMetrics,
    locationAccuracy,
    setLocationAccuracy,

    // Portfolio & Style
    portfolioFiles,
    setPortfolioFiles,
    materialWeight,
    setMaterialWeight,
    characteristicWeight,
    setCharacteristicWeight,
    projectStyleSignature,
    setProjectStyleSignature,

    // Project Specifications
    projectDetails,
    setProjectDetails,
    programSpaces,
    setProgramSpaces,

    // Level Count Control
    lockedLevelCount,
    setLockedLevelCount,
    autoDetectedLevelCount,
    setAutoDetectedLevelCount,
    levelMetrics,
    setLevelMetrics,

    // Generation Results
    generatedDesigns,
    setGeneratedDesigns,
    currentDesignId,
    setCurrentDesignId,
    currentProjectId,
    setCurrentProjectId,

    // UI State
    isLoading,
    setIsLoading,
    isDetectingLocation,
    setIsDetectingLocation,
    isUploading,
    setIsUploading,
    isGeneratingSpaces,
    setIsGeneratingSpaces,
    showModifyDrawer,
    setShowModifyDrawer,
    showModificationPanel,
    setShowModificationPanel,

    // Progress Tracking
    generationProgress,
    setGenerationProgress,
    elapsedTime,
    setElapsedTime,
    generationStartTime,
    setGenerationStartTime,
    isGenerationComplete,
    setIsGenerationComplete,
    rateLimitPause,
    setRateLimitPause,

    // Modal & Image
    modalImage,
    modalImageTitle,
    imageZoom,
    setImageZoom,
    imagePan,
    setImagePan,
    isDragging,
    setIsDragging,
    dragStart,
    setDragStart,
    openImageModal,
    closeImageModal,

    // Notifications
    toastMessage,
    setToastMessage,
    showToast,
    downloadCount,
    setDownloadCount,

    // Refs
    sessionStartTime,
    hasDetectedLocation,

    // Actions
    resetState
  };

  return (
    <DesignContext.Provider value={value}>
      {children}
    </DesignContext.Provider>
  );
};

export default DesignContext;
