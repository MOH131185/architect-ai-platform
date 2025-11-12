/**
 * ControlNet Results Display Component
 *
 * Displays the complete multi-view architectural visualization package
 * with consistency validation and building specifications.
 */

import React, { useState } from 'react';
import '../styles/controlnet-results.css';

function ControlNetResultsDisplay({ result, onDownloadAll, onClose }) {
  const [selectedView, setSelectedView] = useState('exterior_front');
  const [showValidation, setShowValidation] = useState(false);
  const [showSpecs, setShowSpecs] = useState(false);

  if (!result || !result.generated_views) {
    return null;
  }

  const views = result.generated_views;
  const validation = result.consistency_validation;
  const dna = result.building_core_description;
  const metadata = result.metadata;

  // Helper functions
  const downloadAllViews = () => {
    Object.entries(views).forEach(([key, view]) => {
      if (view.success && view.images && view.images[0]) {
        const a = document.createElement('a');
        a.href = view.images[0];
        a.download = view.output_file || `${key}.png`;
        a.click();
      }
    });
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.project.replace(/\s+/g, '_')}_controlnet_package.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingleView = (view) => {
    if (view.success && view.images && view.images[0]) {
      const a = document.createElement('a');
      a.href = view.images[0];
      a.download = view.output_file || 'view.png';
      a.click();
    }
  };

  const currentView = views[selectedView];

  return (
    <div className="controlnet-results">
      {/* Header */}
      <div className="results-header">
        <div className="header-content">
          <h2 className="project-title">
            🏗️ {result.project}
          </h2>
          <div className="header-badges">
            <div className={`consistency-badge ${validation.passed ? 'success' : 'warning'}`}>
              {validation.passed ? '✅ Perfect Consistency' : '⚠️ Review Required'}
            </div>
            <div className="seed-badge">
              🌱 Seed: {result.seed}
            </div>
            <div className="views-badge">
              📊 {metadata.successful_views}/{metadata.total_views} views
            </div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="close-button" type="button">
            ✕
          </button>
        )}
      </div>

      {/* Main View Display */}
      <div className="main-view-section">
        <div className="main-view-container">
          {currentView?.success ? (
            <>
              <img
                src={currentView.images[0]}
                alt={currentView.view}
                className="main-view-image"
              />
              <div className="view-overlay">
                <div className="view-title">{currentView.view}</div>
                <button
                  onClick={() => downloadSingleView(currentView)}
                  className="download-single-button"
                  type="button"
                >
                  ⬇ Download
                </button>
              </div>
            </>
          ) : (
            <div className="error-placeholder">
              <div className="error-icon">❌</div>
              <p className="error-title">Generation Failed</p>
              <p className="error-message">{currentView?.view}</p>
              {currentView?.error && (
                <small className="error-details">{currentView.error}</small>
              )}
            </div>
          )}
        </div>
      </div>

      {/* View Selector Tabs */}
      <div className="view-tabs">
        {Object.entries(views).map(([key, view]) => (
          <button
            key={key}
            onClick={() => view.success && setSelectedView(key)}
            className={`view-tab ${selectedView === key ? 'active' : ''} ${!view.success ? 'failed' : ''}`}
            disabled={!view.success}
            type="button"
          >
            <span className="status-icon">{view.success ? '✅' : '❌'}</span>
            <span className="view-tab-text">{view.view}</span>
          </button>
        ))}
      </div>

      {/* Thumbnail Grid */}
      <div className="thumbnail-grid">
        {Object.entries(views).map(([key, view]) => (
          <div
            key={key}
            className={`thumbnail ${selectedView === key ? 'selected' : ''} ${!view.success ? 'failed' : ''}`}
            onClick={() => view.success && setSelectedView(key)}
          >
            {view.success ? (
              <img src={view.images[0]} alt={view.view} className="thumbnail-image" />
            ) : (
              <div className="thumbnail-error">❌</div>
            )}
            <span className="thumbnail-label">{view.view}</span>
          </div>
        ))}
      </div>

      {/* Expandable Sections */}
      <div className="expandable-sections">
        {/* Building Specifications */}
        <div className="expandable-section">
          <button
            onClick={() => setShowSpecs(!showSpecs)}
            className="section-toggle"
            type="button"
          >
            <span className="toggle-icon">{showSpecs ? '▼' : '▶'}</span>
            <span className="toggle-title">🏠 Building Specifications</span>
          </button>

          {showSpecs && (
            <div className="section-content">
              <div className="spec-grid">
                <div className="spec-item">
                  <label>Dimensions</label>
                  <div className="spec-value">
                    {dna.geometry.length}m × {dna.geometry.width}m × {dna.geometry.height}m
                  </div>
                </div>
                <div className="spec-item">
                  <label>Floors</label>
                  <div className="spec-value">{dna.geometry.floor_count} floors</div>
                </div>
                <div className="spec-item">
                  <label>Floor Height</label>
                  <div className="spec-value">{dna.geometry.floor_height}m</div>
                </div>
                <div className="spec-item">
                  <label>Floor Area</label>
                  <div className="spec-value">
                    {result.building_core_description.project_name?.includes('m²')
                      ? result.building_core_description.project_name.match(/\d+/)?.[0]
                      : 'N/A'}m²
                  </div>
                </div>
                <div className="spec-item">
                  <label>Wall Materials</label>
                  <div className="spec-value">{dna.materials.walls}</div>
                  {dna.materials.walls_color_hex && (
                    <div className="color-swatch" style={{ backgroundColor: dna.materials.walls_color_hex }}></div>
                  )}
                </div>
                <div className="spec-item">
                  <label>Roof</label>
                  <div className="spec-value">
                    {dna.roof.type} - {dna.roof.material}
                  </div>
                  {dna.roof.color && (
                    <div className="spec-detail">{dna.roof.color}</div>
                  )}
                </div>
                <div className="spec-item">
                  <label>Windows</label>
                  <div className="spec-value">{dna.openings.window_type}</div>
                  <div className="spec-detail">{dna.openings.window_pattern}</div>
                </div>
                <div className="spec-item">
                  <label>Main Entrance</label>
                  <div className="spec-value">{dna.openings.door_position}</div>
                  <div className="spec-detail">{dna.openings.door_type}</div>
                </div>
              </div>

              {dna.consistency_rules && dna.consistency_rules.length > 0 && (
                <div className="consistency-rules">
                  <h4>Consistency Rules</h4>
                  <ul>
                    {dna.consistency_rules.map((rule, idx) => (
                      <li key={idx}>{rule}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Consistency Validation Report */}
        <div className="expandable-section">
          <button
            onClick={() => setShowValidation(!showValidation)}
            className="section-toggle"
            type="button"
          >
            <span className="toggle-icon">{showValidation ? '▼' : '▶'}</span>
            <span className="toggle-title">
              {validation.passed ? '✅' : '⚠️'} Consistency Validation Report
            </span>
          </button>

          {showValidation && (
            <div className="section-content">
              <div className="validation-summary">
                <strong>Summary:</strong> {validation.summary}
              </div>

              <div className="validation-checks">
                {validation.checks.map((check, idx) => (
                  <div key={idx} className={`check ${check.passed ? 'passed' : 'failed'}`}>
                    <span className="check-icon">{check.passed ? '✅' : '❌'}</span>
                    <div className="check-content">
                      <div className="check-test">{check.test}</div>
                      <div className="check-details">{check.details}</div>
                    </div>
                  </div>
                ))}
              </div>

              {validation.notes && validation.notes.length > 0 && (
                <div className="validation-notes">
                  {validation.notes.map((note, idx) => (
                    <div key={idx} className="note">{note}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button
          onClick={onDownloadAll || downloadAllViews}
          className="action-button primary"
          type="button"
        >
          ⬇ Download All Views ({metadata.successful_views})
        </button>
        <button
          onClick={downloadJSON}
          className="action-button secondary"
          type="button"
        >
          📄 Download JSON Package
        </button>
      </div>

      {/* Workflow Steps */}
      {result.workflow_steps && (
        <div className="workflow-steps">
          <h4>Generation Workflow</h4>
          <div className="steps-list">
            {result.workflow_steps.map((step, idx) => (
              <div key={idx} className="workflow-step">
                {step}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ControlNetResultsDisplay;
