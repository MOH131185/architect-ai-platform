/**
 * AI Modification Panel Component
 *
 * Allows users to:
 * - Add missing floor plans, elevations, sections, or 3D views
 * - Modify existing A1 sheet
 * - View generation history
 * - Maintain consistency with original DNA
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, History, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import designGenerationHistory from '../services/designGenerationHistory';
import aiModificationService from '../services/aiModificationService';

const AIModificationPanel = ({ sessionId, currentDesign, onModificationComplete }) => {
  const [missingViews, setMissingViews] = useState([]);
  const [modifications, setModifications] = useState([]);
  const [activeTab, setActiveTab] = useState('missing'); // 'missing', 'modify', 'history'
  const [generatingView, setGeneratingView] = useState(null);
  const [modificationPrompt, setModificationPrompt] = useState('');
  const [session, setSession] = useState(null);

  const loadSessionData = useCallback(() => {
    const sessionData = designGenerationHistory.getSession(sessionId);
    setSession(sessionData);

    const missing = designGenerationHistory.getMissingViews(sessionId);
    setMissingViews(missing);

    setModifications(sessionData?.modifications || []);
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) {
      loadSessionData();
    }
  }, [sessionId, loadSessionData]);


  const handleAddView = async (viewType) => {
    setGeneratingView(viewType);

    try {
      const result = await aiModificationService.addMissingView({
        sessionId: sessionId,
        viewType: viewType,
        useOriginalDNA: true
      });

      if (result.success) {
        console.log(`✅ Successfully added ${viewType}`);
        loadSessionData(); // Refresh data

        // Notify parent component
        if (onModificationComplete) {
          onModificationComplete({
            type: 'view-added',
            viewType: viewType,
            result: result
          });
        }
      } else {
        alert(`Failed to add ${viewType}: ${result.error}`);
      }
    } catch (error) {
      console.error('Error adding view:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setGeneratingView(null);
    }
  };

  const handleModifyA1Sheet = async () => {
    if (!modificationPrompt.trim()) {
      alert('Please enter modification instructions');
      return;
    }

    setGeneratingView('a1-sheet-modify');

    try {
      const result = await aiModificationService.modifyA1Sheet({
        sessionId: sessionId,
        userPrompt: modificationPrompt,
        keepElements: [] // Can be customized
      });

      if (result.success) {
        console.log('✅ Successfully modified A1 sheet');
        loadSessionData();

        if (onModificationComplete) {
          onModificationComplete({
            type: 'a1-modified',
            result: result
          });
        }

        setModificationPrompt('');
      } else {
        alert(`Failed to modify A1 sheet: ${result.error}`);
      }
    } catch (error) {
      console.error('Error modifying A1 sheet:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setGeneratingView(null);
    }
  };

  const getViewCategoryLabel = (category) => {
    const labels = {
      floorPlans: 'Floor Plans',
      technicalDrawings: 'Technical Drawings',
      threeD: '3D Views'
    };
    return labels[category] || category;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  // Group missing views by category
  const groupedMissingViews = missingViews.reduce((acc, view) => {
    if (!acc[view.category]) {
      acc[view.category] = [];
    }
    acc[view.category].push(view);
    return acc;
  }, {});

  if (!sessionId || !session) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800 text-sm">
          No active session. Generate a design first to use modification features.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <h3 className="text-xl font-bold text-gray-800 flex items-center space-x-2">
          <Edit className="w-6 h-6 text-indigo-600" />
          <span>AI Modification & Enhancement</span>
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Add missing views or modify your design while maintaining consistency
        </p>
      </div>

      {/* DNA Consistency Indicator */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="bg-indigo-100 rounded-full p-2">
            <CheckCircle className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-800 mb-1">Original Design DNA Locked</h4>
            <div className="text-sm text-gray-700 space-y-1">
              <p>📏 Dimensions: {session.original.dna?.dimensions?.length}m × {session.original.dna?.dimensions?.width}m × {session.original.dna?.dimensions?.height}m</p>
              <p>🎨 Style: {session.original.dna?.style || 'Modern'}</p>
              <p>🎲 Seed: {session.original.seed}</p>
              <p className="text-xs text-indigo-600 mt-2">All new generations will maintain these exact specifications for consistency</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b">
        <button
          onClick={() => setActiveTab('missing')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'missing'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <span className="flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Add Missing Views ({missingViews.length})</span>
          </span>
        </button>
        <button
          onClick={() => setActiveTab('modify')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'modify'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <span className="flex items-center space-x-2">
            <Edit className="w-4 h-4" />
            <span>Modify A1 Sheet</span>
          </span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <span className="flex items-center space-x-2">
            <History className="w-4 h-4" />
            <span>History ({modifications.length})</span>
          </span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {/* Missing Views Tab */}
        {activeTab === 'missing' && (
          <div className="space-y-4">
            {missingViews.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                <p className="text-green-800 font-semibold">All views generated!</p>
                <p className="text-green-700 text-sm mt-1">
                  Your design includes all standard architectural drawings.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  Click on any missing view below to generate it using the original design DNA:
                </p>

                {Object.keys(groupedMissingViews).map(category => (
                  <div key={category} className="space-y-2">
                    <h4 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
                      {getViewCategoryLabel(category)}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupedMissingViews[category].map(view => (
                        <button
                          key={view.type}
                          onClick={() => handleAddView(view.type)}
                          disabled={generatingView === view.type}
                          className="flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                        >
                          <span className="text-sm font-medium text-gray-800 group-hover:text-indigo-700">
                            {view.label}
                          </span>
                          {generatingView === view.type ? (
                            <Clock className="w-5 h-5 text-blue-600 animate-spin" />
                          ) : (
                            <Plus className="w-5 h-5 text-gray-400 group-hover:text-indigo-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Modify A1 Sheet Tab */}
        {activeTab === 'modify' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Describe your modifications:
              </label>
              <textarea
                value={modificationPrompt}
                onChange={(e) => setModificationPrompt(e.target.value)}
                placeholder="Example: Make the entrance more prominent, add more windows on the south facade, change roof color to dark grey..."
                className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 text-sm mb-2">Consistency Guarantee</h4>
              <p className="text-blue-800 text-xs">
                The modified A1 sheet will maintain the same building dimensions, materials, and style as your original design.
                Only the requested changes will be applied.
              </p>
            </div>

            <button
              onClick={handleModifyA1Sheet}
              disabled={!modificationPrompt.trim() || generatingView === 'a1-sheet-modify'}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {generatingView === 'a1-sheet-modify' ? (
                <>
                  <Clock className="w-5 h-5 animate-spin" />
                  <span>Generating Modified Sheet...</span>
                </>
              ) : (
                <>
                  <Edit className="w-5 h-5" />
                  <span>Generate Modified A1 Sheet</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {modifications.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                <History className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-semibold">No modifications yet</p>
                <p className="text-gray-500 text-sm mt-1">
                  Your modification history will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {modifications.map((mod, index) => (
                  <div key={mod.id} className="border border-gray-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(mod.status)}
                        <span className="font-semibold text-gray-800 text-sm">
                          {mod.type === 'add-view' ? 'Added View' : 'Modified A1 Sheet'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(mod.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-sm text-gray-700">{mod.description}</p>

                    {mod.request?.userPrompt && (
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-xs text-gray-600 italic">"{mod.request.userPrompt}"</p>
                      </div>
                    )}

                    {mod.status === 'completed' && mod.response?.data?.url && (
                      <div className="pt-2">
                        <img
                          src={mod.response.data.url}
                          alt={mod.description}
                          className="w-full h-32 object-cover rounded border border-gray-200"
                        />
                      </div>
                    )}

                    {mod.status === 'failed' && (
                      <div className="bg-red-50 border border-red-200 rounded p-2">
                        <p className="text-xs text-red-700">Error: {mod.error}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="border-t pt-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-2xl font-bold text-indigo-600">
            {session.metadata.totalGenerations}
          </p>
          <p className="text-xs text-gray-600">Total Generations</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-purple-600">
            {session.metadata.totalModifications}
          </p>
          <p className="text-xs text-gray-600">Modifications</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-green-600">
            {12 - missingViews.length}/12
          </p>
          <p className="text-xs text-gray-600">Views Complete</p>
        </div>
      </div>
    </div>
  );
};

export default AIModificationPanel;
