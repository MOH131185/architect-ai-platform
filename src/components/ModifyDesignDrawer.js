/**
 * Modify A1 Sheet Drawer Component
 * UI for modifying A1 sheets with prompt edits, dimension changes, and consistency lock
 * A1-Only Mode: Modifies the entire A1 sheet while maintaining consistency with original design
 */

import React, { useState, useEffect } from 'react';
import { X, Edit3, CheckSquare, Loader2, Wand2, Plus } from 'lucide-react';
import aiModificationService from '../services/aiModificationService.js';
import designHistoryService from '../services/designHistoryService.js';
import { sanitizePromptInput, sanitizeDimensions } from '../utils/promptSanitizer.js';
import logger from '../utils/logger.js';

export default function ModifyDesignDrawer({
  isOpen,
  onClose,
  designId,
  currentDNA,
  currentPrompt,
  projectContext,
  onModificationComplete,
  mapRef,
  location,
  baselineA1Url,
  generatedDesigns
}) {
  const [mainPrompt, setMainPrompt] = useState(currentPrompt || '');
  const [dimensions, setDimensions] = useState({
    length: currentDNA?.dimensions?.length || '',
    width: currentDNA?.dimensions?.width || '',
    height: currentDNA?.dimensions?.height || ''
  });
  const [quickToggles, setQuickToggles] = useState({
    addSections: false,
    add3DView: false,
    addDetails: false,
    addSitePlan: false,
    addInterior3D: false,
    addFloorPlans: false
  });
  const [isModifying, setIsModifying] = useState(false);
  const [design, setDesign] = useState(null);

  useEffect(() => {
    const loadDesignData = async () => {
      if (isOpen && designId) {
        // Load design data for consistency lock
        const designData = await designHistoryService.getDesign(designId);
        if (designData) {
          setDesign(designData);
          if (designData.basePrompt || designData.mainPrompt) {
            setMainPrompt(designData.basePrompt || designData.mainPrompt);
          }
          if (designData.masterDNA?.dimensions) {
            setDimensions({
              length: designData.masterDNA.dimensions.length || '',
              width: designData.masterDNA.dimensions.width || '',
              height: designData.masterDNA.dimensions.height || ''
            });
          }
        } else if (currentPrompt) {
          setMainPrompt(currentPrompt);
        }
        // Also check currentDNA dimensions
        if (currentDNA?.dimensions) {
          setDimensions({
            length: currentDNA.dimensions.length || '',
            width: currentDNA.dimensions.width || '',
            height: currentDNA.dimensions.height || ''
          });
        }
      }
    };
    loadDesignData();
  }, [isOpen, designId, currentPrompt, currentDNA]);

  const toggleQuickAction = (key) => {
    setQuickToggles(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleApplyModification = async () => {
    // Validate that user has entered a prompt or selected quick actions
    if (!mainPrompt.trim() && !quickToggles.addSections && !quickToggles.add3DView &&
        !quickToggles.addDetails && !quickToggles.addSitePlan && !quickToggles.addInterior3D && !quickToggles.addFloorPlans) {
      alert('Please enter modification instructions or select quick actions.');
      return;
    }

    // Sanitize user inputs for security
    const sanitizedPrompt = sanitizePromptInput(mainPrompt, {
      maxLength: 2000,
      allowNewlines: true,
      stripHtml: true
    });

    const sanitizedDimensions = sanitizeDimensions(dimensions);

    // Validate sanitized inputs
    if (mainPrompt.trim() && !sanitizedPrompt) {
      alert('Invalid characters detected in prompt. Please use only standard text.');
      return;
    }

    // Ensure design history exists before modifying (handled by aiModificationService)
    // No need to create here - aiModificationService.getOrCreateDesign will handle it

    // Build delta prompt from dimensions if changed
    let deltaPrompt = sanitizedPrompt;
    const dimChanges = [];

    if (sanitizedDimensions.length && sanitizedDimensions.length !== (design?.masterDNA?.dimensions?.length || currentDNA?.dimensions?.length || '')) {
      dimChanges.push(`Update length to ${sanitizedDimensions.length}m`);
    }
    if (sanitizedDimensions.width && sanitizedDimensions.width !== (design?.masterDNA?.dimensions?.width || currentDNA?.dimensions?.width || '')) {
      dimChanges.push(`Update width to ${sanitizedDimensions.width}m`);
    }
    if (sanitizedDimensions.height && sanitizedDimensions.height !== (design?.masterDNA?.dimensions?.height || currentDNA?.dimensions?.height || '')) {
      dimChanges.push(`Update height to ${sanitizedDimensions.height}m`);
    }

    if (dimChanges.length > 0) {
      deltaPrompt = (deltaPrompt ? deltaPrompt + '\n\n' : '') + dimChanges.join('\n');
    }

    setIsModifying(true);
    try {
      // Use aiModificationService.modifyA1Sheet() for proper A1 consistency lock
      const result = await aiModificationService.modifyA1Sheet({
        designId,
        deltaPrompt: deltaPrompt || null,
        quickToggles,
        userPrompt: sanitizedPrompt || null,
        baselineUrl: baselineA1Url || null, // Pass baseline URL for getOrCreateDesign fallback
        masterDNA: currentDNA || design?.masterDNA || null,
        mainPrompt: sanitizedPrompt || currentPrompt || null
      });

      if (!result.success) {
        throw new Error(result.error || 'A1 sheet modification failed');
      }

      logger.success('A1 sheet modified successfully', {
        url: result.url,
        seed: result.seed,
        versionId: result.versionId,
        consistencyScore: result.consistencyScore ? `${(result.consistencyScore * 100).toFixed(1)}%` : 'N/A'
      });

      // Notify parent component with modified A1 sheet URL
      if (onModificationComplete) {
        onModificationComplete({
          success: true,
          url: result.url,
          a1SheetUrl: result.url,
          seed: result.seed,
          versionId: result.versionId,
          consistencyScore: result.consistencyScore,
          designId
        });
      }

      // Close drawer
      onClose();

    } catch (error) {
      logger.error('A1 sheet modification failed', error);
      alert(`Modification failed: ${error.message}`);
    } finally {
      setIsModifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Edit3 className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-800">Modify A1 Sheet</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Main Prompt
            </label>
            <textarea
              value={mainPrompt}
              onChange={(e) => setMainPrompt(e.target.value)}
              className="w-full h-32 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your modification request... (e.g., 'Change exterior materials to red brick', 'Add an additional bedroom')"
            />
            <p className="text-xs text-gray-500 mt-1">
              This prompt will be used to update the A1 sheet while maintaining consistency with the original design using the same seed and DNA lock.
            </p>
          </div>

          {/* Quick Actions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quick Actions
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

          {/* Dimensions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Dimensions (meters)
            </label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Length</label>
                <input
                  type="number"
                  value={dimensions.length}
                  onChange={(e) => setDimensions({ ...dimensions, length: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="15.25"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Width</label>
                <input
                  type="number"
                  value={dimensions.width}
                  onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="10.15"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Height</label>
                <input
                  type="number"
                  value={dimensions.height}
                  onChange={(e) => setDimensions({ ...dimensions, height: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="7.40"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Changing dimensions will update the A1 sheet while maintaining visual consistency.
            </p>
          </div>

          {/* Consistency Info */}
          {design && (design.masterDNA || design.seed) && (
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
                    <p>🎲 Seed: {design.seed || design.seedsByView?.a1Sheet || 'N/A'}</p>
                    <p className="text-xs text-purple-600 mt-2">
                      All modifications will maintain original design consistency using the same seed and DNA lock.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApplyModification}
            disabled={isModifying || (!mainPrompt.trim() && !quickToggles.addSections && !quickToggles.add3DView && !quickToggles.addDetails && !quickToggles.addSitePlan && !quickToggles.addInterior3D && !quickToggles.addFloorPlans)}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isModifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Modified A1 Sheet...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Apply Modification
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

