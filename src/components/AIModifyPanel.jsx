/**
 * AI Modify Panel Component (A1-Only Mode)
 *
 * Allows users to modify A1 sheet with consistency lock:
 * - Add missing sections (quick toggle)
 * - Add missing 3D views (quick toggle)
 * - Add technical details (quick toggle)
 * - Free-form prompt modifications
 * - View version history
 * - Compare versions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Wand2, Plus, CheckSquare, History, Clock, AlertCircle, Layers } from 'lucide-react';
import aiModificationService from '../services/aiModificationService';
import designHistoryService from '../services/designHistoryService';
import a1SheetValidator from '../services/a1SheetValidator';
import { isFeatureEnabled } from '../config/featureFlags';
import useToast from '../hooks/useToast';
import Toast from './Toast';

const AIModifyPanel = ({ designId, currentDesign, onModificationComplete }) => {
  const toast = useToast();
  const [userPrompt, setUserPrompt] = useState('');
  const [quickToggles, setQuickToggles] = useState({
    addSections: false,
    add3DView: false,
    addDetails: false,
    addSitePlan: false,
    addInterior3D: false,
    addFloorPlans: false
  });
  const [strictLock, setStrictLock] = useState(true); // 🆕 Strict lock enabled by default (0.18→0.12 img2img)
  const [isGenerating, setIsGenerating] = useState(false);
  const [versions, setVersions] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [design, setDesign] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [hybridModeEnabled, setHybridModeEnabled] = useState(false);
  const [selectedPanels, setSelectedPanels] = useState([]);
  const [panelProgress, setPanelProgress] = useState({});
  
  // Panel options for Hybrid mode
  const panelOptions = [
    { key: 'site', label: 'Site Plan' },
    { key: 'plan_ground', label: 'Ground Floor Plan' },
    { key: 'plan_upper', label: 'Upper Floor Plan' },
    { key: 'elev_north', label: 'North Elevation' },
    { key: 'elev_south', label: 'South Elevation' },
    { key: 'elev_east', label: 'East Elevation' },
    { key: 'elev_west', label: 'West Elevation' },
    { key: 'sect_long', label: 'Section A-A (Longitudinal)' },
    { key: 'sect_trans', label: 'Section B-B (Transverse)' },
    { key: 'v_exterior', label: '3D Exterior View' },
    { key: 'v_axon', label: 'Axonometric View' },
    { key: 'v_interior', label: 'Interior 3D View' }
  ];

  const loadDesignData = useCallback(() => {
    const designData = designHistoryService.getDesign(designId);
    if (designData) {
      setDesign(designData);
      setVersions(designData.versions || []);

      // Run validation on current design (only if A1 sheet data exists)
      if (designData.a1SheetUrl || designData.resultUrl) {
        const validation = a1SheetValidator.validateA1Sheet(
          { url: designData.a1SheetUrl || designData.resultUrl, prompt: designData.mainPrompt, metadata: {} },
          designData.masterDNA,
          designData.blendedStyle
        );
        setValidationResult(validation);
        setShowValidationErrors(validation && (validation.issues.length > 0 || validation.warnings.length > 0));
      }
    }
  }, [designId]);

  useEffect(() => {
    if (designId) {
      loadDesignData();
    }
    
    // Check if Hybrid mode is enabled
    setHybridModeEnabled(isFeatureEnabled('hybridA1Mode'));
    
    // Check if design has panel map (Hybrid mode design)
    if (design) {
      const hasPanelMap = !!(design.a1Sheet?.panels || design.panelMap);
      if (hasPanelMap && !hybridModeEnabled) {
        // Design was created in Hybrid mode, suggest enabling it
        console.log('Design has panel map - Hybrid mode recommended for modifications');
      }
    }
  }, [designId, loadDesignData, design, hybridModeEnabled]);

  const handleModify = async () => {
    if (!userPrompt.trim() && !quickToggles.addSections && !quickToggles.add3DView && !quickToggles.addDetails && !quickToggles.addSitePlan && !quickToggles.addInterior3D && !quickToggles.addFloorPlans) {
      toast.warning('Please enter modification instructions or select quick actions');
      return;
    }

    setIsGenerating(true);
    setPanelProgress({}); // Reset panel progress

    try {
      const result = await aiModificationService.modifyA1Sheet({
        designId,
        deltaPrompt: userPrompt,
        quickToggles,
        userPrompt: userPrompt || null,
        strictLock: strictLock,
        targetPanels: hybridModeEnabled && selectedPanels.length > 0 ? selectedPanels : null // 🆕 Pass selected panels for Hybrid mode
      });

      if (result.success) {
        console.log('✅ Modification complete:', result);
        
        // Refresh design data and re-validate
        loadDesignData();
        
        // Clear form
        setUserPrompt('');
        setQuickToggles({ addSections: false, add3DView: false, addDetails: false, addSitePlan: false, addInterior3D: false, addFloorPlans: false });

        // Show consistency score if available
        if (result.consistencyScore !== null && result.consistencyScore < 0.95) {
          toast.warning(`Modification complete with ${(result.consistencyScore * 100).toFixed(1)}% consistency. Some elements may have changed.`);
        } else {
          toast.success(hybridModeEnabled && result.modifiedPanels 
            ? `Modified ${result.modifiedPanels.length} panel(s) successfully!`
            : 'A1 sheet modified successfully!');
        }
        
        // Show zone validation results if available (Hybrid mode)
        if (result.zoneValidation && !result.zoneValidation.consistent) {
          toast.warning(`Zone consistency: ${(result.zoneValidation.overallScore * 100).toFixed(1)}% - Some unchanged zones may have drifted`);
        }

        // Notify parent
        if (onModificationComplete) {
          onModificationComplete(result);
        }
      } else {
        toast.error(`Modification failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error modifying A1 sheet:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleQuickAction = (key) => {
    setQuickToggles(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const loadVersion = (versionId) => {
    const version = designHistoryService.getVersion(designId, versionId);
    if (version && onModificationComplete) {
      onModificationComplete({
        success: true,
        url: version.resultUrl,
        versionId: version.versionId,
        consistencyScore: version.consistencyScore
      });
    }
    // Version selection UI removed for simplicity
  };

  if (!designId || !design) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 text-sm">
          Design history not found. Generate a design first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Validation Errors Display */}
      {showValidationErrors && validationResult && (validationResult.issues.length > 0 || validationResult.warnings.length > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-red-800 mb-2">
                A1 Sheet Validation ({validationResult.score}% score)
              </h4>
              {validationResult.issues.length > 0 && (
                <>
                  <p className="text-xs text-red-600 font-semibold mb-1">Critical Issues:</p>
                  <ul className="text-sm text-red-700 space-y-1 mb-3">
                    {validationResult.issues.map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </>
              )}
              {validationResult.warnings.length > 0 && (
                <>
                  <p className="text-xs text-yellow-700 font-semibold mb-1">Warnings:</p>
                  <ul className="text-sm text-yellow-700 space-y-1 mb-3">
                    {validationResult.warnings.map((warning, idx) => (
                      <li key={idx}>• {warning}</li>
                    ))}
                  </ul>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setQuickToggles({ addSections: true, add3DView: false, addDetails: false });
                    setUserPrompt('Add missing sections and ensure all required views are present');
                  }}
                  className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 transition-colors"
                >
                  Quick Fix: Add Sections
                </button>
                <button
                  onClick={() => {
                    setQuickToggles({ addSections: false, add3DView: true, addDetails: false });
                    setUserPrompt('Add missing 3D views and ensure all views are complete');
                  }}
                  className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 transition-colors"
                >
                  Quick Fix: Add 3D Views
                </button>
                <button
                  onClick={() => {
                    setQuickToggles({ addSections: false, add3DView: false, addDetails: true });
                    setUserPrompt('Add missing technical details and dimension lines');
                  }}
                  className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 transition-colors"
                >
                  Quick Fix: Add Details
                </button>
                <button
                  onClick={() => setShowValidationErrors(false)}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Quick Actions:
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <button
            onClick={() => toggleQuickAction('addSections')}
            className={`flex items-center space-x-2 p-3 rounded-lg border-2 transition-all ${
              quickToggles.addSections
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <CheckSquare className={`w-5 h-5 ${quickToggles.addSections ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className="text-sm font-medium">Add Sections</span>
          </button>

          <button
            onClick={() => toggleQuickAction('add3DView')}
            className={`flex items-center space-x-2 p-3 rounded-lg border-2 transition-all ${
              quickToggles.add3DView
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <Plus className={`w-5 h-5 ${quickToggles.add3DView ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className="text-sm font-medium">Add 3D Views</span>
          </button>

          <button
            onClick={() => toggleQuickAction('addDetails')}
            className={`flex items-center space-x-2 p-3 rounded-lg border-2 transition-all ${
              quickToggles.addDetails
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <CheckSquare className={`w-5 h-5 ${quickToggles.addDetails ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className="text-sm font-medium">Add Details</span>
          </button>

          <button
            onClick={() => toggleQuickAction('addSitePlan')}
            className={`flex items-center space-x-2 p-3 rounded-lg border-2 transition-all ${
              quickToggles.addSitePlan
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <Plus className={`w-5 h-5 ${quickToggles.addSitePlan ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className="text-sm font-medium">Add Site Plan</span>
          </button>

          <button
            onClick={() => toggleQuickAction('addInterior3D')}
            className={`flex items-center space-x-2 p-3 rounded-lg border-2 transition-all ${
              quickToggles.addInterior3D
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <Plus className={`w-5 h-5 ${quickToggles.addInterior3D ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className="text-sm font-medium">Add Interior 3D</span>
          </button>

          <button
            onClick={() => toggleQuickAction('addFloorPlans')}
            className={`flex items-center space-x-2 p-3 rounded-lg border-2 transition-all ${
              quickToggles.addFloorPlans
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <Plus className={`w-5 h-5 ${quickToggles.addFloorPlans ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className="text-sm font-medium">Add Floor Plans</span>
          </button>
        </div>
      </div>

      {/* Hybrid Mode Panel Selection */}
      {hybridModeEnabled && (
        <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
          <div className="flex items-center space-x-2 mb-3">
            <Layers className="w-5 h-5 text-purple-600" />
            <label className="block text-sm font-medium text-purple-900">
              Hybrid Mode: Select Panels to Modify
            </label>
          </div>
          <p className="text-xs text-purple-700 mb-3">
            Only selected panels will be regenerated. Other panels remain unchanged for faster modifications.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
            {panelOptions.map((panel) => (
              <label
                key={panel.key}
                className="flex items-center space-x-2 p-2 rounded border cursor-pointer hover:bg-purple-100 transition-colors"
                style={{
                  borderColor: selectedPanels.includes(panel.key) ? '#9333ea' : '#e9d5ff',
                  backgroundColor: selectedPanels.includes(panel.key) ? '#f3e8ff' : 'white'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedPanels.includes(panel.key)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPanels([...selectedPanels, panel.key]);
                    } else {
                      setSelectedPanels(selectedPanels.filter(p => p !== panel.key));
                    }
                  }}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  disabled={isGenerating}
                />
                <span className="text-xs text-gray-700">{panel.label}</span>
                {panelProgress[panel.key] && (
                  <span className="text-xs text-purple-600 ml-auto">
                    {panelProgress[panel.key] === 'generating' ? '⏳' : 
                     panelProgress[panel.key] === 'completed' ? '✅' : 
                     panelProgress[panel.key] === 'failed' ? '❌' : ''}
                  </span>
                )}
              </label>
            ))}
          </div>
          {selectedPanels.length === 0 && (
            <p className="text-xs text-purple-600 mt-2 italic">
              No panels selected - all panels will be regenerated (or auto-detected from prompt)
            </p>
          )}
        </div>
      )}

      {/* Custom Prompt */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Custom Modifications (optional):
        </label>
        <textarea
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder={hybridModeEnabled 
            ? "Example: Fix north elevation windows, add missing sections..." 
            : "Example: Add missing sections A-A and B-B, ensure all dimension lines are visible..."}
          className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
          disabled={isGenerating}
        />
      </div>

      {/* Strict Lock Toggle */}
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <label htmlFor="strictLock" className="text-sm font-medium text-gray-700 cursor-pointer">
                Strict Lock (Recommended)
              </label>
              <div className="group relative">
                <svg className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10">
                  Uses low-strength img2img (0.18→0.12) to preserve original sheet. Ensures SSIM ≥ 0.92 with automatic retry.
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {strictLock
                ? '🔒 Preserves original design with minimal changes (img2img strength: 0.18→0.12)'
                : '⚡ Allows more flexibility (img2img strength: 0.28)'}
            </p>
          </div>
          <div className="flex items-center">
            <button
              id="strictLock"
              onClick={() => setStrictLock(!strictLock)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                strictLock ? 'bg-purple-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  strictLock ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Consistency Info */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="bg-purple-100 rounded-full p-2">
            <CheckSquare className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-800 mb-1">Consistency Lock Active</h4>
            <div className="text-sm text-gray-700 space-y-1">
              {design.masterDNA?.dimensions && (
                <p>📏 Dimensions: {design.masterDNA.dimensions.length || 15}m × {design.masterDNA.dimensions.width || 10}m × {design.masterDNA.dimensions.height || 7}m</p>
              )}
              {design.masterDNA?.architecturalStyle && (
                <p>🎨 Style: {design.masterDNA.architecturalStyle}</p>
              )}
              <p>🎲 Seed: {design.seed}</p>
              <p className="text-xs text-purple-600 mt-2">
                All modifications will maintain original design consistency using the same seed and DNA lock.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Site Map Snapshot Info */}
      {design.siteSnapshot && (
        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-blue-900 flex items-center space-x-2">
              <span>🗺️ Site Map Snapshot</span>
            </h4>
            {/* Future: Add re-capture button
            <button
              onClick={handleRecaptureSnapshot}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Re-capture
            </button>
            */}
          </div>
          <div className="text-xs text-blue-800 space-y-1">
            <p>📍 Center: {design.siteSnapshot.center?.lat.toFixed(4)}, {design.siteSnapshot.center?.lng.toFixed(4)}</p>
            <p>🔍 Zoom: {design.siteSnapshot.zoom} | Type: {design.siteSnapshot.mapType}</p>
            <p>📐 Size: {design.siteSnapshot.size?.width}×{design.siteSnapshot.size?.height}px</p>
            {design.siteSnapshot.sha256 && (
              <p>🔒 Hash: {design.siteSnapshot.sha256.substring(0, 12)}...</p>
            )}
            {design.siteSnapshot.polygon && (
              <p>🔷 Polygon: {design.siteSnapshot.polygon.length} points</p>
            )}
            <p className="text-blue-600 font-medium mt-2">
              ✓ Pixel-exact map parity maintained across all modifications
            </p>
          </div>
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleModify}
        disabled={isGenerating || (!userPrompt.trim() && !quickToggles.addSections && !quickToggles.add3DView && !quickToggles.addDetails && !quickToggles.addSitePlan && !quickToggles.addInterior3D && !quickToggles.addFloorPlans)}
        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
      >
        {isGenerating ? (
          <>
            <Clock className="w-5 h-5 animate-spin" />
            <span>Generating Modified A1 Sheet...</span>
          </>
        ) : (
          <>
            <Wand2 className="w-5 h-5" />
            <span>Generate Modified A1 Sheet</span>
          </>
        )}
      </button>

      {/* Version History */}
      {versions.length > 0 && (
        <div className="border-t pt-4">
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="flex items-center space-x-2 text-gray-700 hover:text-purple-600 transition-colors"
          >
            <History className="w-4 h-4" />
            <span className="text-sm font-medium">Version History ({versions.length})</span>
          </button>

          {showVersions && (
            <div className="mt-3 space-y-2">
              {versions.map((version) => (
                <div
                  key={version.versionId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-purple-300 transition-colors cursor-pointer"
                  onClick={() => loadVersion(version.versionId)}
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-800">{version.versionId}</span>
                      {version.consistencyScore && (
                        <span className="text-xs text-green-600">
                          {(version.consistencyScore * 100).toFixed(1)}% consistent
                        </span>
                      )}
                    </div>
                    {version.userPrompt && (
                      <p className="text-xs text-gray-600 mt-1">{version.userPrompt.substring(0, 60)}...</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(version.createdAt || version.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <CheckSquare className="w-4 h-4 text-gray-400" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast Notifications */}
      {toast.toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          type={t.type}
          duration={t.duration}
          onClose={() => toast.removeToast(t.id)}
        />
      ))}
    </div>
  );
};

export default AIModifyPanel;

