/**
 * Geometry Integration Wrapper
 * Bridges legacy AI flow with new geometry-first pipeline
 * Handles feature flag routing and distinct view URLs
 */

import React, { useState, useEffect } from 'react';
import { isFeatureEnabled } from '../config/featureFlags';
import { convertAndSaveLegacyDNA } from '../core/designState';
import { validateDesign, applyAutoFixes } from '../core/designValidator';
import GeometryViewsComponent from './GeometryViewsComponent';
import { exportAllTechnicalDrawings } from '../exports/vectorExporter';
import { stylizeGeometryViews } from '../services/aiStylizationService';

const GeometryIntegrationWrapper = ({
  masterDNA,
  projectContext,
  locationData,
  siteMetrics,
  aiGeneratedViews, // Legacy AI views
  onGeometryReady // Callback with geometry URLs
}) => {
  const [designState, setDesignState] = useState(null);
  const [validation, setValidation] = useState(null);
  const [geometryViews, setGeometryViews] = useState(null);
  const [stylizedViews, setStylizedViews] = useState(null);
  const [sceneRef, setSceneRef] = useState(null);
  const [exports, setExports] = useState([]);
  const [exportingStatus, setExportingStatus] = useState('');
  const [stylizingStatus, setStylizingStatus] = useState('');
  const [useGeometry, setUseGeometry] = useState(isFeatureEnabled('geometryFirst'));
  const [showValidation, setShowValidation] = useState(isFeatureEnabled('showValidationErrors'));
  const [aiStylizationEnabled, setAiStylizationEnabled] = useState(isFeatureEnabled('aiStylization'));

  useEffect(() => {
    if (!masterDNA) return;

    // Convert legacy DNA to design.json
    console.log('🔄 Converting DNA to geometry format...');
    const design = convertAndSaveLegacyDNA(masterDNA, projectContext, locationData, siteMetrics);
    setDesignState(design);

    // Validate
    console.log('🔍 Validating design...');
    const validationResult = validateDesign(design);
    setValidation(validationResult);

    if (!validationResult.valid && validationResult.autoFixes.length > 0) {
      console.log('🔧 Applying auto-fixes...');
      const fixedDesign = applyAutoFixes(design, validationResult.autoFixes);
      setDesignState(fixedDesign);
    }

    if (validationResult.errors.length > 0 && showValidation) {
      console.error('❌ Validation errors:', validationResult.errors);
    }

    if (validationResult.warnings.length > 0 && showValidation) {
      console.warn('⚠️  Validation warnings:', validationResult.warnings);
    }

    console.log('✅ Design ready for geometry rendering');
  }, [masterDNA, projectContext, locationData, siteMetrics, showValidation]);

  // Smoke test for distinct URLs
  const runSmokeTest = (urls) => {
    const { axon, persp, interior } = urls;

    console.log('🧪 Running smoke test for distinct URLs...');

    if (!axon || !persp || !interior) {
      console.error('❌ Smoke test FAILED: Missing URLs');
      return false;
    }

    if (axon === persp) {
      console.error('❌ Smoke test FAILED: Axon == Persp (duplicate bug detected!)');
      return false;
    }

    if (axon === interior) {
      console.error('❌ Smoke test FAILED: Axon == Interior');
      return false;
    }

    if (persp === interior) {
      console.error('❌ Smoke test FAILED: Persp == Interior');
      return false;
    }

    // Check byte sizes (data URLs have different lengths if images are different)
    if (axon.length === persp.length && axon.length === interior.length) {
      console.warn('⚠️  Smoke test WARNING: All URLs have same byte size (may be duplicates)');
    } else {
      console.log('✅ Smoke test PASSED: All URLs have different byte sizes');
    }

    console.log('✅ Smoke test PASSED: All URLs are distinct');
    return true;
  };

  // Handle geometry view generation
  const handleGeometryGenerated = (urls, scene) => {
    setGeometryViews(urls);
    if (scene) {
      setSceneRef(scene);
    }

    // Run smoke test
    runSmokeTest(urls);

    // Notify parent component
    if (onGeometryReady) {
      onGeometryReady(urls);
    }
  };

  // Handle technical drawing exports
  const handleExportTechnicalDrawings = async () => {
    if (!designState) {
      console.error('No design to export');
      return;
    }

    setExportingStatus('Generating exports...');

    try {
      const exportResults = await exportAllTechnicalDrawings(designState, sceneRef);
      setExports(exportResults);
      setExportingStatus(`✅ Exported ${exportResults.length} files`);

      setTimeout(() => {
        setExportingStatus('');
      }, 5000);
    } catch (error) {
      console.error('Export failed:', error);
      setExportingStatus('❌ Export failed');

      setTimeout(() => {
        setExportingStatus('');
      }, 5000);
    }
  };

  // Handle AI stylization
  const handleStylizeViews = async () => {
    if (!geometryViews || !designState) {
      console.error('No geometry views to stylize');
      return;
    }

    setStylizingStatus('🎨 Applying AI photorealistic rendering...');

    try {
      const stylized = await stylizeGeometryViews(geometryViews, designState, masterDNA);

      if (stylized) {
        setStylizedViews(stylized);
        setStylizingStatus('✅ AI stylization complete');

        setTimeout(() => {
          setStylizingStatus('');
        }, 5000);
      } else {
        setStylizingStatus('⚠️ Stylization feature not available');

        setTimeout(() => {
          setStylizingStatus('');
        }, 5000);
      }
    } catch (error) {
      console.error('Stylization failed:', error);
      setStylizingStatus('❌ Stylization failed');

      setTimeout(() => {
        setStylizingStatus('');
      }, 5000);
    }
  };

  if (!useGeometry) {
    // Feature flag disabled - use legacy AI views
    return (
      <div style={containerStyle}>
        <div style={infoBoxStyle}>
          <span>💡</span>
          <span>
            Using legacy AI-only pipeline. Enable "Geometry-First" in Settings for 100% consistent views.
          </span>
        </div>
        {aiGeneratedViews && <div>{aiGeneratedViews}</div>}
      </div>
    );
  }

  if (!designState) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>
          <span>⏳</span>
          <span>Converting to geometry format...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Validation Status */}
      {validation && showValidation && (
        <div style={validationContainerStyle}>
          {validation.errors.length > 0 && (
            <div style={errorBoxStyle}>
              <strong>❌ Validation Errors ({validation.errors.length}):</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                {validation.errors.slice(0, 3).map((err, idx) => (
                  <li key={idx} style={{ fontSize: '13px' }}>{err.message}</li>
                ))}
              </ul>
              {validation.errors.length > 3 && (
                <p style={{ fontSize: '12px', margin: '5px 0 0 0' }}>
                  ...and {validation.errors.length - 3} more
                </p>
              )}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div style={warningBoxStyle}>
              <strong>⚠️  Validation Warnings ({validation.warnings.length}):</strong>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                {validation.warnings.slice(0, 2).map((warn, idx) => (
                  <li key={idx} style={{ fontSize: '13px' }}>{warn.message}</li>
                ))}
              </ul>
            </div>
          )}

          {validation.valid && validation.errors.length === 0 && (
            <div style={successBoxStyle}>
              ✅ Design validated successfully - geometry is consistent and buildable
            </div>
          )}
        </div>
      )}

      {/* Geometry Views */}
      <div style={viewsHeaderStyle}>
        <h2>🏗️ Geometry-First Views (100% Consistent)</h2>
        <p style={{ fontSize: '14px', color: '#666', margin: '5px 0 0 0' }}>
          All views generated from same 3D model - geometrically impossible to be inconsistent
        </p>
      </div>

      <GeometryViewsComponent
        design={designState}
        onViewsReady={handleGeometryGenerated}
      />

      {/* AI Stylization (Optional) */}
      {aiStylizationEnabled && geometryViews && (
        <div style={stylizationContainerStyle}>
          <h3 style={{ marginBottom: '10px' }}>🎨 AI Photorealistic Rendering (Optional)</h3>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
            Apply AI-powered photorealistic rendering to geometry views using ControlNet
          </p>

          <button
            onClick={handleStylizeViews}
            disabled={stylizingStatus.includes('...')}
            style={stylizeButtonStyle(!stylizingStatus.includes('...'))}
          >
            {stylizingStatus.includes('...') ? '⏳ Stylizing...' : '✨ Photoreal (AI Stylize)'}
          </button>

          {stylizingStatus && (
            <div style={exportStatusStyle(stylizingStatus.includes('✅'))}>
              {stylizingStatus}
            </div>
          )}

          {stylizedViews && (
            <div style={stylizedViewsContainerStyle}>
              <h4 style={{ marginTop: '20px', marginBottom: '15px' }}>Stylized Views:</h4>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {stylizedViews.axonometric && (
                  <div style={viewCardStyle}>
                    <h5>Axonometric (Photorealistic)</h5>
                    <img src={stylizedViews.axonometric.url} alt="Stylized Axonometric" style={{ width: '100%', borderRadius: '8px' }} />
                    <p style={{ fontSize: '11px', color: '#999', marginTop: '5px' }}>
                      ControlNet: {stylizedViews.axonometric.controlType}
                    </p>
                  </div>
                )}

                {stylizedViews.perspective && (
                  <div style={viewCardStyle}>
                    <h5>Perspective (Photorealistic)</h5>
                    <img src={stylizedViews.perspective.url} alt="Stylized Perspective" style={{ width: '100%', borderRadius: '8px' }} />
                    <p style={{ fontSize: '11px', color: '#999', marginTop: '5px' }}>
                      ControlNet: {stylizedViews.perspective.controlType}
                    </p>
                  </div>
                )}

                {stylizedViews.interior && (
                  <div style={viewCardStyle}>
                    <h5>Interior (Photorealistic)</h5>
                    <img src={stylizedViews.interior.url} alt="Stylized Interior" style={{ width: '100%', borderRadius: '8px' }} />
                    <p style={{ fontSize: '11px', color: '#999', marginTop: '5px' }}>
                      ControlNet: {stylizedViews.interior.controlType}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Technical Drawing Exports */}
      <div style={exportContainerStyle}>
        <h3 style={{ marginBottom: '10px' }}>📦 Technical Drawings Export</h3>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
          Export vector-based floor plans, elevations, sections (SVG/DXF) and 3D model (glTF)
        </p>

        <button
          onClick={handleExportTechnicalDrawings}
          disabled={!geometryViews || exportingStatus.includes('...')}
          style={exportButtonStyle(geometryViews && !exportingStatus.includes('...'))}
        >
          {exportingStatus.includes('...') ? '⏳ Exporting...' : '📥 Export All Technical Drawings'}
        </button>

        {exportingStatus && (
          <div style={exportStatusStyle(exportingStatus.includes('✅'))}>
            {exportingStatus}
          </div>
        )}

        {exports.length > 0 && (
          <div style={exportListStyle}>
            <strong>Exported files ({exports.length}):</strong>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '13px' }}>
              {exports.map((exp, idx) => (
                <li key={idx}>
                  {exp.type === 'floor_plan' && `Floor Plan - Level ${exp.level}`}
                  {exp.type === 'elevation' && `Elevation - ${exp.direction.toUpperCase()}`}
                  {exp.type === 'section' && `Section ${exp.name}`}
                  {exp.type === 'dxf' && 'DXF Floor Plan'}
                  {exp.type === 'gltf' && '3D Model (glTF/GLB)'}
                  {' - '}
                  <code style={{ fontSize: '11px', color: '#666' }}>{exp.filename}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Legacy AI Views for Comparison (optional) */}
      {aiGeneratedViews && (
        <details style={legacyContainerStyle}>
          <summary style={legacySummaryStyle}>
            Show Legacy AI Views (for comparison)
          </summary>
          <div style={{ marginTop: '15px' }}>
            {aiGeneratedViews}
          </div>
        </details>
      )}
    </div>
  );
};

// Styles
const containerStyle = {
  marginTop: '30px',
  padding: '20px',
  backgroundColor: '#f9f9f9',
  borderRadius: '12px',
  border: '1px solid #e0e0e0'
};

const loadingStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '20px',
  fontSize: '16px',
  color: '#666'
};

const validationContainerStyle = {
  marginBottom: '20px'
};

const errorBoxStyle = {
  padding: '15px',
  backgroundColor: '#fee',
  border: '1px solid #fcc',
  borderRadius: '8px',
  marginBottom: '10px',
  fontSize: '14px',
  color: '#c00'
};

const warningBoxStyle = {
  padding: '15px',
  backgroundColor: '#ffd',
  border: '1px solid #fc0',
  borderRadius: '8px',
  marginBottom: '10px',
  fontSize: '14px',
  color: '#660'
};

const successBoxStyle = {
  padding: '15px',
  backgroundColor: '#efe',
  border: '1px solid #cfc',
  borderRadius: '8px',
  marginBottom: '10px',
  fontSize: '14px',
  color: '#060'
};

const infoBoxStyle = {
  padding: '15px',
  backgroundColor: '#e7f3ff',
  border: '1px solid #b3d9ff',
  borderRadius: '8px',
  display: 'flex',
  gap: '10px',
  fontSize: '14px',
  color: '#0066cc',
  marginBottom: '15px'
};

const viewsHeaderStyle = {
  marginBottom: '20px'
};

const legacyContainerStyle = {
  marginTop: '30px',
  padding: '15px',
  backgroundColor: 'white',
  borderRadius: '8px',
  border: '1px solid #ddd'
};

const legacySummaryStyle = {
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '600',
  color: '#666',
  padding: '5px',
  userSelect: 'none'
};

const exportContainerStyle = {
  marginTop: '30px',
  padding: '20px',
  backgroundColor: '#f0f8ff',
  borderRadius: '12px',
  border: '1px solid #b3d9ff'
};

const exportButtonStyle = (enabled) => ({
  padding: '12px 24px',
  fontSize: '16px',
  fontWeight: '600',
  backgroundColor: enabled ? '#4CAF50' : '#ccc',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: enabled ? 'pointer' : 'not-allowed',
  transition: 'all 0.3s ease',
  opacity: enabled ? 1 : 0.6
});

const exportStatusStyle = (isSuccess) => ({
  marginTop: '15px',
  padding: '12px',
  backgroundColor: isSuccess ? '#d4edda' : '#f8d7da',
  border: `1px solid ${isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
  borderRadius: '8px',
  color: isSuccess ? '#155724' : '#721c24',
  fontSize: '14px',
  fontWeight: '500'
});

const exportListStyle = {
  marginTop: '15px',
  padding: '15px',
  backgroundColor: 'white',
  borderRadius: '8px',
  border: '1px solid #ddd',
  fontSize: '14px'
};

const stylizationContainerStyle = {
  marginTop: '30px',
  padding: '20px',
  backgroundColor: '#fff5f8',
  borderRadius: '12px',
  border: '1px solid #ffb3d9'
};

const stylizeButtonStyle = (enabled) => ({
  padding: '12px 24px',
  fontSize: '16px',
  fontWeight: '600',
  backgroundColor: enabled ? '#e91e63' : '#ccc',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: enabled ? 'pointer' : 'not-allowed',
  transition: 'all 0.3s ease',
  opacity: enabled ? 1 : 0.6,
  boxShadow: enabled ? '0 4px 12px rgba(233, 30, 99, 0.3)' : 'none'
});

const stylizedViewsContainerStyle = {
  marginTop: '20px',
  padding: '20px',
  backgroundColor: 'white',
  borderRadius: '12px',
  border: '1px solid #eee'
};

const viewCardStyle = {
  padding: '15px',
  border: '1px solid #ddd',
  borderRadius: '12px',
  background: 'white',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  textAlign: 'center',
  minWidth: '250px',
  maxWidth: '350px'
};

export default GeometryIntegrationWrapper;
