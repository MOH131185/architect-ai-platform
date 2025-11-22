/**
 * Design Reasoning Panel
 * 
 * Displays live design reasoning and AI insights
 * Shows style rationale, spatial organization, materials, environmental strategies, and cost notes
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, Info } from 'lucide-react';

const DesignReasoningPanel = ({ reasoning, visible = true, onClose }) => {
  const [expanded, setExpanded] = useState(true);
  const [activeSection, setActiveSection] = useState('overview');

  if (!visible || !reasoning) {
    return null;
  }

  const sections = [
    { id: 'overview', label: 'Design Philosophy', icon: '🎨' },
    { id: 'style', label: 'Style Rationale', icon: '🏛️' },
    { id: 'spatial', label: 'Spatial Organization', icon: '📐' },
    { id: 'materials', label: 'Materials', icon: '🧱' },
    { id: 'environmental', label: 'Environmental', icon: '🌿' },
    { id: 'compliance', label: 'Code Compliance', icon: '✓' },
    { id: 'cost', label: 'Cost Strategies', icon: '💰' }
  ];

  const renderSectionContent = (sectionId) => {
    switch (sectionId) {
      case 'overview':
        return (
          <div className="space-y-2">
            <p className="text-sm text-gray-700 leading-relaxed">
              {reasoning.designPhilosophy || 'Design philosophy will appear here after generation.'}
            </p>
            {reasoning.metadata && (
              <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-500">
                <Cpu className="w-3 h-3" />
                <span>Model: {reasoning.metadata.model || reasoning.model || 'N/A'}</span>
                {reasoning.metadata.latencyMs && (
                  <span>• {reasoning.metadata.latencyMs}ms</span>
                )}
              </div>
            )}
          </div>
        );

      case 'style':
        const styleRationale = reasoning.styleRationale || {};
        return (
          <div className="space-y-3 text-sm">
            {styleRationale.overview && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Overview</div>
                <p className="text-gray-600">{styleRationale.overview}</p>
              </div>
            )}
            {styleRationale.localStyleImpact && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Local Context</div>
                <p className="text-gray-600">{styleRationale.localStyleImpact}</p>
              </div>
            )}
            {styleRationale.portfolioStyleImpact && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Portfolio Influence</div>
                <p className="text-gray-600">{styleRationale.portfolioStyleImpact}</p>
              </div>
            )}
            {styleRationale.climateIntegration && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Climate Response</div>
                <p className="text-gray-600">{styleRationale.climateIntegration}</p>
              </div>
            )}
          </div>
        );

      case 'spatial':
        const spatial = reasoning.spatialOrganization || {};
        return (
          <div className="space-y-3 text-sm">
            {spatial.strategy && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Strategy</div>
                <p className="text-gray-600">{spatial.strategy}</p>
              </div>
            )}
            {spatial.circulation && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Circulation</div>
                <p className="text-gray-600">{spatial.circulation}</p>
              </div>
            )}
            {spatial.keySpaces && Array.isArray(spatial.keySpaces) && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Key Spaces</div>
                <ul className="list-disc list-inside text-gray-600 space-y-1">
                  {spatial.keySpaces.map((space, idx) => (
                    <li key={idx}>{space}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case 'materials':
        const materials = reasoning.materialRecommendations || {};
        return (
          <div className="space-y-3 text-sm">
            {materials.primary && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Primary Materials</div>
                <p className="text-gray-600">{materials.primary}</p>
              </div>
            )}
            {materials.secondary && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Secondary Materials</div>
                <p className="text-gray-600">{materials.secondary}</p>
              </div>
            )}
            {materials.sustainable && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Sustainability</div>
                <p className="text-gray-600">{materials.sustainable}</p>
              </div>
            )}
          </div>
        );

      case 'environmental':
        const environmental = reasoning.environmentalConsiderations || {};
        return (
          <div className="space-y-3 text-sm">
            {environmental.passiveStrategies && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Passive Strategies</div>
                {Array.isArray(environmental.passiveStrategies) ? (
                  <ul className="list-disc list-inside text-gray-600 space-y-1">
                    {environmental.passiveStrategies.map((strategy, idx) => (
                      <li key={idx}>{strategy}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-600">{environmental.passiveStrategies}</p>
                )}
              </div>
            )}
            {environmental.activeStrategies && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Active Systems</div>
                {Array.isArray(environmental.activeStrategies) ? (
                  <ul className="list-disc list-inside text-gray-600 space-y-1">
                    {environmental.activeStrategies.map((strategy, idx) => (
                      <li key={idx}>{strategy}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-600">{environmental.activeStrategies}</p>
                )}
              </div>
            )}
            {environmental.climateResponse && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Climate Response</div>
                <p className="text-gray-600">{environmental.climateResponse}</p>
              </div>
            )}
          </div>
        );

      case 'compliance':
        const compliance = reasoning.codeCompliance || {};
        return (
          <div className="space-y-3 text-sm">
            {compliance.zoning && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Zoning</div>
                <p className="text-gray-600">{compliance.zoning}</p>
              </div>
            )}
            {compliance.building && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Building Code</div>
                <p className="text-gray-600">{compliance.building}</p>
              </div>
            )}
            {compliance.accessibility && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Accessibility</div>
                <p className="text-gray-600">{compliance.accessibility}</p>
              </div>
            )}
          </div>
        );

      case 'cost':
        const cost = reasoning.costStrategies || {};
        return (
          <div className="space-y-3 text-sm">
            {cost.valueEngineering && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Value Engineering</div>
                <p className="text-gray-600">{cost.valueEngineering}</p>
              </div>
            )}
            {cost.phasingOpportunities && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Phasing</div>
                <p className="text-gray-600">{cost.phasingOpportunities}</p>
              </div>
            )}
            {cost.lifecycle && (
              <div>
                <div className="font-semibold text-gray-700 mb-1">Lifecycle Costs</div>
                <p className="text-gray-600">{cost.lifecycle}</p>
              </div>
            )}
          </div>
        );

      default:
        return <p className="text-sm text-gray-500">No content available</p>;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div 
        className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5" />
          <h3 className="font-semibold text-lg">Design Reasoning</h3>
          {reasoning.isFallback && (
            <span className="text-xs bg-yellow-500 text-yellow-900 px-2 py-1 rounded">Fallback</span>
          )}
        </div>
        <button className="hover:bg-blue-800 rounded p-1 transition-colors">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {/* Content */}
      {expanded && (
        <div className="p-4">
          {/* Section Tabs */}
          <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b border-gray-200">
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="mr-1">{section.icon}</span>
                {section.label}
              </button>
            ))}
          </div>

          {/* Section Content */}
          <div className="min-h-[200px]">
            {renderSectionContent(activeSection)}
          </div>

          {/* Footer */}
          {reasoning.source && (
            <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-500">
              Source: {reasoning.source} {reasoning.model && `(${reasoning.model})`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DesignReasoningPanel;

