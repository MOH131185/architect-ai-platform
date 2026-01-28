import { useState } from 'react';

export const useWizardState = () => {
    // Step navigation
    const [currentStep, setCurrentStep] = useState(0);

    // Location state
    const [address, setAddress] = useState('');
    const [isDetectingLocation, setIsDetectingLocation] = useState(false);
    const [locationData, setLocationData] = useState(null);
    const [sitePolygon, setSitePolygon] = useState([]);
    const [siteMetrics, setSiteMetrics] = useState(null);
    const [locationAccuracy, setLocationAccuracy] = useState(null);
    const [drawingMode, setDrawingMode] = useState(false);
    const [precisionMode, setPrecisionMode] = useState(false);

    // Portfolio state
    const [portfolioFiles, setPortfolioFiles] = useState([]);
    const [materialWeight, setMaterialWeight] = useState(0.7);
    const [characteristicWeight, setCharacteristicWeight] = useState(0.7);
    const [isUploading, setIsUploading] = useState(false);

    // Project specs state
    const [projectDetails, setProjectDetails] = useState({
        category: '',
        subType: '',
        customNotes: '',
        area: '',
        floorCount: 2,
        floorCountLocked: false,
        autoDetectedFloorCount: null,
        floorMetrics: null,
        footprintArea: '',
        entranceDirection: 'N',
        entranceAutoDetected: false,
        entranceConfidence: 0,
        program: '', // Maintain backward compatibility
    });
    const [programSpaces, setProgramSpaces] = useState([]);
    const [programWarnings, setProgramWarnings] = useState([]);
    const [isGeneratingSpaces, setIsGeneratingSpaces] = useState(false);
    const [isDetectingEntrance, setIsDetectingEntrance] = useState(false);
    const [autoDetectResult, setAutoDetectResult] = useState(null);

    // Generated design ID
    const [generatedDesignId, setGeneratedDesignId] = useState(null);

    return {
        // Step
        currentStep,
        setCurrentStep,

        // Location
        address,
        setAddress,
        isDetectingLocation,
        setIsDetectingLocation,
        locationData,
        setLocationData,
        sitePolygon,
        setSitePolygon,
        siteMetrics,
        setSiteMetrics,
        locationAccuracy,
        setLocationAccuracy,
        drawingMode,
        setDrawingMode,
        precisionMode,
        setPrecisionMode,

        // Portfolio
        portfolioFiles,
        setPortfolioFiles,
        materialWeight,
        setMaterialWeight,
        characteristicWeight,
        setCharacteristicWeight,
        isUploading,
        setIsUploading,

        // Specs
        projectDetails,
        setProjectDetails,
        programSpaces,
        setProgramSpaces,
        programWarnings,
        setProgramWarnings,
        isGeneratingSpaces,
        setIsGeneratingSpaces,
        isDetectingEntrance,
        setIsDetectingEntrance,
        autoDetectResult,
        setAutoDetectResult,

        // Result
        generatedDesignId,
        setGeneratedDesignId,
    };
};
