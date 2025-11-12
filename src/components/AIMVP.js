/**
 * AI MVP Component
 * Simple interface for testing OpenAI reasoning and Replicate generation
 */

import React, { useState, useEffect } from 'react';
import aiIntegrationService from '../services/aiIntegrationService';
import './AIMVP.css';

const AIMVP = () => {
  const [projectContext, setProjectContext] = useState({
    buildingProgram: 'residential building',
    location: { address: 'San Francisco, CA' },
    architecturalStyle: 'contemporary',
    materials: 'glass and steel',
    siteConstraints: 'urban lot',
    userPreferences: 'sustainable design'
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    // SECURITY: API keys are now handled server-side only
    // Always assume APIs are configured - server will handle availability
    setApiStatus('configured');
    console.log('✅ Using server-side API proxy (secure)');
  }, []);

  const handleInputChange = (field, value) => {
    setProjectContext(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLocationChange = (field, value) => {
    setProjectContext(prev => ({
      ...prev,
      location: {
        ...prev.location,
        [field]: value
      }
    }));
  };

  const generateDesign = async () => {
    setIsGenerating(true);
    setError(null);
    setResults(null);

    try {
      console.log('Starting AI design generation...');
      console.log('Project context:', projectContext);
      const result = await aiIntegrationService.quickDesign(projectContext);
      console.log('Generation result:', result);
      setResults(result);
    } catch (err) {
      console.error('Generation error:', err);
      setError(`${err.message}\n\nStack: ${err.stack}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCompleteDesign = async () => {
    setIsGenerating(true);
    setError(null);
    setResults(null);

    try {
      console.log('Starting complete AI design workflow...');
      const result = await aiIntegrationService.generateCompleteDesign(projectContext);
      setResults(result);
    } catch (err) {
      console.error('Complete generation error:', err);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="ai-mvp">
      <div className="ai-mvp-header">
        <h1>ArchiAI MVP - AI-Powered Design</h1>
        <p>Test OpenAI reasoning and Replicate generation for architectural design</p>

        <div className="api-status" style={{
          marginTop: '15px',
          padding: '10px',
          borderRadius: '6px',
          backgroundColor: apiStatus === 'configured' ? '#d4edda' : '#fff3cd',
          color: apiStatus === 'configured' ? '#155724' : '#856404',
          fontSize: '0.9rem'
        }}>
          {apiStatus === 'configured' ? (
            <>✅ API Keys Configured (OpenAI + Replicate)</>
          ) : (
            <>⚠️ API Keys Missing - Check .env file</>
          )}
        </div>

        <div className="cors-notice" style={{
          marginTop: '10px',
          padding: '10px',
          borderRadius: '6px',
          backgroundColor: '#d1ecf1',
          color: '#0c5460',
          fontSize: '0.85rem'
        }}>
          ⚠️ Note: Direct API calls from browser may fail due to CORS. Consider setting up a backend proxy for production.
        </div>
      </div>

      <div className="ai-mvp-content">
        <div className="project-inputs">
          <h2>Project Context</h2>
          
          <div className="input-group">
            <label>Building Program:</label>
            <select 
              value={projectContext.buildingProgram}
              onChange={(e) => handleInputChange('buildingProgram', e.target.value)}
            >
              <option value="residential building">Residential Building</option>
              <option value="commercial building">Commercial Building</option>
              <option value="office building">Office Building</option>
              <option value="mixed-use building">Mixed-Use Building</option>
              <option value="cultural building">Cultural Building</option>
            </select>
          </div>

          <div className="input-group">
            <label>Location:</label>
            <input
              type="text"
              value={projectContext.location.address}
              onChange={(e) => handleLocationChange('address', e.target.value)}
              placeholder="Enter project location"
            />
          </div>

          <div className="input-group">
            <label>Architectural Style:</label>
            <select 
              value={projectContext.architecturalStyle}
              onChange={(e) => handleInputChange('architecturalStyle', e.target.value)}
            >
              <option value="contemporary">Contemporary</option>
              <option value="modern">Modern</option>
              <option value="traditional">Traditional</option>
              <option value="sustainable">Sustainable</option>
              <option value="futuristic">Futuristic</option>
            </select>
          </div>

          <div className="input-group">
            <label>Materials:</label>
            <input
              type="text"
              value={projectContext.materials}
              onChange={(e) => handleInputChange('materials', e.target.value)}
              placeholder="e.g., glass and steel, concrete and wood"
            />
          </div>

          <div className="input-group">
            <label>Site Constraints:</label>
            <input
              type="text"
              value={projectContext.siteConstraints}
              onChange={(e) => handleInputChange('siteConstraints', e.target.value)}
              placeholder="e.g., urban lot, waterfront, hillside"
            />
          </div>

          <div className="input-group">
            <label>User Preferences:</label>
            <input
              type="text"
              value={projectContext.userPreferences}
              onChange={(e) => handleInputChange('userPreferences', e.target.value)}
              placeholder="e.g., sustainable design, cost-effective, innovative"
            />
          </div>
        </div>

        <div className="generation-controls">
          <h2>AI Generation</h2>
          
          <div className="button-group">
            <button 
              onClick={generateDesign}
              disabled={isGenerating}
              className="btn btn-primary"
            >
              {isGenerating ? 'Generating...' : 'Quick Design (MVP)'}
            </button>
            
            <button 
              onClick={generateCompleteDesign}
              disabled={isGenerating}
              className="btn btn-secondary"
            >
              {isGenerating ? 'Generating...' : 'Complete Design Workflow'}
            </button>
          </div>

          {error && (
            <div className="error-message">
              <h3>Error:</h3>
              <p>{error}</p>
            </div>
          )}
        </div>

        {results && (
          <div className="results">
            <h2>AI Design Results</h2>
            
            {results.success ? (
              <div className="results-content">
                {results.reasoning && (
                  <div className="reasoning-section">
                    <h3>Design Reasoning</h3>
                    <div className="reasoning-content">
                      <div className="reasoning-item">
                        <strong>Design Philosophy:</strong>
                        <p>{results.reasoning.designPhilosophy}</p>
                      </div>
                      <div className="reasoning-item">
                        <strong>Spatial Organization:</strong>
                        <p>{results.reasoning.spatialOrganization}</p>
                      </div>
                      <div className="reasoning-item">
                        <strong>Material Recommendations:</strong>
                        <p>{results.reasoning.materialRecommendations}</p>
                      </div>
                      <div className="reasoning-item">
                        <strong>Environmental Considerations:</strong>
                        <p>{results.reasoning.environmentalConsiderations}</p>
                      </div>
                    </div>
                  </div>
                )}

                {results.visualization && (
                  <div className="visualization-section">
                    <h3>Generated Visualization</h3>
                    <div className="visualization-content">
                      {results.visualization.images && results.visualization.images.map((image, index) => (
                        <div key={index} className="image-container">
                          <img 
                            src={image} 
                            alt={`Generated design ${index + 1}`}
                            className="generated-image"
                          />
                          {results.visualization.isFallback && (
                            <p className="fallback-notice">Placeholder image - API unavailable</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.alternatives && (
                  <div className="alternatives-section">
                    <h3>Design Alternatives</h3>
                    <div className="alternatives-content">
                      {Object.entries(results.alternatives).map(([approach, alternative]) => (
                        <div key={approach} className="alternative-item">
                          <h4>{approach.replace('_', ' ').toUpperCase()}</h4>
                          {alternative.reasoning && (
                            <p><strong>Approach:</strong> {alternative.reasoning.designPhilosophy}</p>
                          )}
                          {alternative.visualization && alternative.visualization.images && (
                            <div className="alternative-images">
                              {alternative.visualization.images.map((image, index) => (
                                <img 
                                  key={index}
                                  src={image} 
                                  alt={`${approach} alternative`}
                                  className="alternative-image"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {results.feasibility && (
                  <div className="feasibility-section">
                    <h3>Feasibility Analysis</h3>
                    <div className="feasibility-content">
                      <p><strong>Feasibility:</strong> {results.feasibility.feasibility}</p>
                      <p><strong>Constraints:</strong> {results.feasibility.constraints}</p>
                      <p><strong>Recommendations:</strong> {results.feasibility.recommendations}</p>
                    </div>
                  </div>
                )}

                <div className="results-meta">
                  <p><strong>Workflow:</strong> {results.workflow}</p>
                  <p><strong>Generated:</strong> {new Date(results.timestamp).toLocaleString()}</p>
                  {results.isFallback && <p className="fallback-notice">Using fallback data - AI services unavailable</p>}
                </div>
              </div>
            ) : (
              <div className="error-results">
                <h3>Generation Failed</h3>
                <p>{results.error}</p>
                {results.fallback && (
                  <div className="fallback-results">
                    <h4>Fallback Results:</h4>
                    <pre>{JSON.stringify(results.fallback, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIMVP;
