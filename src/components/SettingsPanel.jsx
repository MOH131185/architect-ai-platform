/**
 * Settings Panel
 * Allows users to toggle feature flags and preferences
 */

import React, { useState, useEffect } from 'react';
import { getAllFeatureFlags, setFeatureFlag } from '../config/featureFlags.js';

const SettingsPanel = ({ isOpen, onClose }) => {
  const [flags, setFlags] = useState({});

  useEffect(() => {
    if (isOpen) {
      setFlags(getAllFeatureFlags());
    }
  }, [isOpen]);

  const handleToggle = (flagName, value) => {
    setFeatureFlag(flagName, value);
    setFlags(prev => ({ ...prev, [flagName]: value }));
  };

  if (!isOpen) return null;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <h2>⚙️ Settings</h2>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        <div style={contentStyle}>
          {/* Core Features */}
          <section style={sectionStyle}>
            <h3>🏗️ Core Features</h3>

            <ToggleSwitch
              label="Hybrid A1 Mode (RECOMMENDED)"
              description="Generate A1 sheet with individual panels for better quality. Includes all floor plans, elevations, sections, and 3D views."
              checked={flags.hybridA1Mode}
              onChange={(val) => handleToggle('hybridA1Mode', val)}
            />

            <ToggleSwitch
              label="AI Stylization"
              description="Apply photorealistic AI enhancement to renders"
              checked={flags.aiStylization}
              onChange={(val) => handleToggle('aiStylization', val)}
            />
          </section>

          {/* Phase 2 Features */}
          <section style={sectionStyle}>
            <h3>🚀 Phase 2 Features</h3>

            <ToggleSwitch
              label="Spatial Layout Algorithm"
              description="Auto-optimize room placement with constraints"
              checked={flags.spatialLayoutAlgorithm}
              onChange={(val) => handleToggle('spatialLayoutAlgorithm', val)}
            />

            <ToggleSwitch
              label="Advanced Openings"
              description="Generate doors and windows with proper placement"
              checked={flags.advancedOpenings}
              onChange={(val) => handleToggle('advancedOpenings', val)}
            />

            <ToggleSwitch
              label="Roof Geometry"
              description="Generate gable/hip/flat roofs from DNA"
              checked={flags.roofGeometry}
              onChange={(val) => handleToggle('roofGeometry', val)}
            />
          </section>

          {/* Export Options */}
          <section style={sectionStyle}>
            <h3>📦 Export Options</h3>

            <ToggleSwitch
              label="SVG Export"
              description="Export floor plans and elevations as vector SVG"
              checked={flags.svgExport}
              onChange={(val) => handleToggle('svgExport', val)}
            />

            <ToggleSwitch
              label="glTF Export"
              description="Export 3D model for Blender, Unity, etc."
              checked={flags.glTFExport}
              onChange={(val) => handleToggle('glTFExport', val)}
            />
          </section>

          {/* Debug Options */}
          <section style={sectionStyle}>
            <h3>🐛 Debug Options</h3>

            <ToggleSwitch
              label="Show Validation Errors"
              description="Display validation errors in console and UI"
              checked={flags.showValidationErrors}
              onChange={(val) => handleToggle('showValidationErrors', val)}
            />

          </section>
        </div>

        <div style={footerStyle}>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            Settings are saved automatically and persist across sessions
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Toggle Switch Component
 */
const ToggleSwitch = ({ label, description, checked, onChange }) => {
  return (
    <div style={toggleContainerStyle}>
      <div style={{ flex: 1 }}>
        <div style={labelStyle}>{label}</div>
        {description && <div style={descriptionStyle}>{description}</div>}
      </div>
      <label style={switchLabelStyle}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ display: 'none' }}
        />
        <span style={{
          ...switchStyle,
          backgroundColor: checked ? '#4CAF50' : '#ccc'
        }}>
          <span style={{
            ...sliderStyle,
            transform: checked ? 'translateX(20px)' : 'translateX(0)'
          }} />
        </span>
      </label>
    </div>
  );
};

// Styles
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999
};

const panelStyle = {
  backgroundColor: 'white',
  borderRadius: '12px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  width: '90%',
  maxWidth: '600px',
  maxHeight: '80vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column'
};

const headerStyle = {
  padding: '20px',
  borderBottom: '1px solid #e0e0e0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  fontSize: '24px',
  cursor: 'pointer',
  color: '#666',
  padding: '0',
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  transition: 'background 0.2s'
};

const contentStyle = {
  padding: '20px',
  overflowY: 'auto',
  flex: 1
};

const sectionStyle = {
  marginBottom: '30px'
};

const toggleContainerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '15px',
  padding: '15px',
  backgroundColor: '#f9f9f9',
  borderRadius: '8px',
  marginBottom: '10px'
};

const labelStyle = {
  fontWeight: '600',
  fontSize: '14px',
  color: '#333',
  marginBottom: '4px'
};

const descriptionStyle = {
  fontSize: '12px',
  color: '#666',
  lineHeight: '1.4'
};

const switchLabelStyle = {
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center'
};

const switchStyle = {
  position: 'relative',
  width: '44px',
  height: '24px',
  borderRadius: '12px',
  transition: 'background-color 0.3s',
  display: 'flex',
  alignItems: 'center',
  padding: '2px'
};

const sliderStyle = {
  width: '20px',
  height: '20px',
  borderRadius: '50%',
  backgroundColor: 'white',
  transition: 'transform 0.3s',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
};

const footerStyle = {
  padding: '15px 20px',
  borderTop: '1px solid #e0e0e0',
  textAlign: 'center'
};

export default SettingsPanel;
