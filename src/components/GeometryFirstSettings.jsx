/**
 * Geometry-First Settings Component
 *
 * Provides UI toggle for geometry-first feature flag
 * and displays current rendering mode.
 */

import React, { useState, useEffect } from 'react';
import {
  isFeatureEnabled,
  setFeatureFlag,
  getAllFeatureFlags
} from '../config/featureFlags';

export default function GeometryFirstSettings({ className = '' }) {
  const [geometryFirst, setGeometryFirst] = useState(isFeatureEnabled('geometryFirst'));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allFlags, setAllFlags] = useState(getAllFeatureFlags());

  useEffect(() => {
    // Update local state when flags change
    setGeometryFirst(isFeatureEnabled('geometryFirst'));
    setAllFlags(getAllFeatureFlags());
  }, []);

  const handleToggleGeometryFirst = () => {
    const newValue = !geometryFirst;
    setFeatureFlag('geometryFirst', newValue);
    setGeometryFirst(newValue);
    setAllFlags(getAllFeatureFlags());

    // Show toast notification
    const mode = newValue ? 'Geometry-First' : 'Legacy AI-Only';
    console.log(`🚩 Switched to ${mode} mode`);
  };

  const handleToggleFlag = (flagName) => {
    const newValue = !allFlags[flagName];
    setFeatureFlag(flagName, newValue);
    setAllFlags(getAllFeatureFlags());
  };

  return (
    <div className={`geometry-first-settings ${className}`}>
      <style>{`
        .geometry-first-settings {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .settings-title {
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .settings-mode-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .mode-geometry {
          background: #10b981;
          color: white;
        }

        .mode-legacy {
          background: #f59e0b;
          color: white;
        }

        .settings-section {
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .settings-section:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .setting-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
        }

        .setting-label {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .setting-name {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 4px;
        }

        .setting-description {
          font-size: 12px;
          color: #6b7280;
          line-height: 1.4;
        }

        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
          margin-left: 16px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #cbd5e1;
          transition: 0.3s;
          border-radius: 24px;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }

        input:checked + .toggle-slider {
          background-color: #3b82f6;
        }

        input:checked + .toggle-slider:before {
          transform: translateX(20px);
        }

        .toggle-slider:hover {
          opacity: 0.8;
        }

        .advanced-toggle {
          text-align: center;
          padding: 8px;
          cursor: pointer;
          color: #3b82f6;
          font-size: 13px;
          font-weight: 500;
          user-select: none;
        }

        .advanced-toggle:hover {
          text-decoration: underline;
        }

        .info-box {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          padding: 12px;
          margin-top: 12px;
        }

        .info-box-title {
          font-size: 13px;
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 6px;
        }

        .info-box-text {
          font-size: 12px;
          color: #1e3a8a;
          line-height: 1.5;
        }

        .info-box-list {
          margin: 8px 0 0 16px;
          font-size: 12px;
          color: #1e3a8a;
        }

        .info-box-list li {
          margin-bottom: 4px;
        }
      `}</style>

      <div className="settings-header">
        <h3 className="settings-title">Rendering Mode</h3>
        <span className={`settings-mode-badge ${geometryFirst ? 'mode-geometry' : 'mode-legacy'}`}>
          {geometryFirst ? '🏗️ Geometry-First' : '🎨 Legacy AI'}
        </span>
      </div>

      <div className="settings-section">
        <div className="setting-item">
          <div className="setting-label">
            <span className="setting-name">Geometry-First Pipeline</span>
            <span className="setting-description">
              Generate precise 3D geometry, then render technical views.
              {geometryFirst ? ' Currently active.' : ' Using legacy AI-only generation.'}
            </span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={geometryFirst}
              onChange={handleToggleGeometryFirst}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {geometryFirst && (
          <div className="info-box">
            <div className="info-box-title">Geometry-First Benefits</div>
            <ul className="info-box-list">
              <li>✅ 99.5%+ dimensional consistency (vs 98% AI-only)</li>
              <li>✅ Exact measurements from validated spatial layout</li>
              <li>✅ Technical drawings (plans, elevations) from true 3D geometry</li>
              <li>✅ Faster generation (geometry renders instantly)</li>
            </ul>
          </div>
        )}

        {!geometryFirst && (
          <div className="info-box">
            <div className="info-box-title">Legacy AI-Only Mode</div>
            <div className="info-box-text">
              All 13 views generated by FLUX.1 AI with DNA consistency system.
              Current consistency: 98%. Generation time: ~3 minutes.
            </div>
          </div>
        )}
      </div>

      {/* Advanced Settings Toggle */}
      <div className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? '▼' : '▶'} Advanced Settings
      </div>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="settings-section" style={{ marginTop: '16px' }}>
          <div className="setting-item">
            <div className="setting-label">
              <span className="setting-name">Show Geometry Preview</span>
              <span className="setting-description">
                Display spatial layout before final generation
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={allFlags.showGeometryPreview}
                onChange={() => handleToggleFlag('showGeometryPreview')}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="setting-name">Cache Geometry</span>
              <span className="setting-description">
                Store geometry calculations for faster regeneration
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={allFlags.cacheGeometry}
                onChange={() => handleToggleFlag('cacheGeometry')}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="setting-name">Parallel Generation</span>
              <span className="setting-description">
                Generate 2D and 3D views simultaneously
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={allFlags.parallelGeneration}
                onChange={() => handleToggleFlag('parallelGeneration')}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="setting-name">Enhanced Consistency Checks</span>
              <span className="setting-description">
                Validate dimensions across all views
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={allFlags.enhancedConsistencyChecks}
                onChange={() => handleToggleFlag('enhancedConsistencyChecks')}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="setting-name">Debug Mode</span>
              <span className="setting-description">
                Log detailed geometry calculations to console
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={allFlags.debugGeometry}
                onChange={() => handleToggleFlag('debugGeometry')}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
