/**
 * AI MVP Component
 * Simple interface for testing OpenAI reasoning and Replicate generation
 */

import React, { useState, useEffect } from 'react';
import aiIntegrationService from '../services/aiIntegrationService';
import { getOpenAIUrl, getReplicatePredictUrl, getHealthUrl } from '../utils/apiRoutes';
import './AIMVP.css';

const AIMVP = () => {
  const [projectContext, setProjectContext] = useState({
    buildingProgram: 'residential building',
    location: { address: 'San Francisco, CA' },
    architecturalStyle: 'contemporary',
    materials: 'glass and steel',
    siteConstraints: 'urban lot',
    userPreferences: 'sustainable design',
    // New controls for consistency and overrides
    strictConsistency: true,
    promptOverride: '',
    // Blending weights (0 = all local, 1 = all portfolio)
    materialWeight: 0.5,
    characteristicWeight: 0.5
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState('checking');
  const [apiRoutes, setApiRoutes] = useState({ openai: '', replicate: '', health: '' });
  const [connectivity, setConnectivity] = useState({ status: 'checking', detail: '' });

  useEffect(() => {
    // Resolve routes
    setApiRoutes({ openai: getOpenAIUrl(), replicate: getReplicatePredictUrl(), health: getHealthUrl() });

    // Check API configuration
    const hasOpenAI = !!process.env.REACT_APP_OPENAI_API_KEY;
    const hasReplicate = !!process.env.REACT_APP_REPLICATE_API_KEY;

    if (hasOpenAI && hasReplicate) {
      setApiStatus('configured');
      console.log('✅ Both API keys configured');
    } else {
      setApiStatus('missing');
      console.warn('⚠️ API keys missing:', {
        openai: hasOpenAI ? 'configured' : 'missing',
        replicate: hasReplicate ? 'configured' : 'missing'
      });
    }

    // Initialize a unified project seed once per session
    setProjectContext(prev => {
      if (prev.projectSeed) return prev;
      const seed = Math.floor(Math.random() * 1000000);
      return { ...prev, projectSeed: seed, seed };
    });

    // Ping /api/health to verify connectivity
    const healthUrl = getHealthUrl();
    fetch(healthUrl, { method: 'GET' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Health ${res.status}`);
        const data = await res.json().catch(() => ({}));
        setConnectivity({ status: 'ok', detail: `health ok${data?.status ? ` (${data.status})` : ''}` });
      })
      .catch((err) => setConnectivity({ status: 'error', detail: err.message }));
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
      // Switch to integrated workflow for unified 2D/3D/technical outputs
      const result = await aiIntegrationService.generateIntegratedDesign(
        projectContext,
        [],
        typeof projectContext.materialWeight === 'number' ? projectContext.materialWeight : 0.5,
        typeof projectContext.characteristicWeight === 'number' ? projectContext.characteristicWeight : 0.5
      );
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
        <div className="api-connectivity" style={{
          marginBottom: '16px', padding: '10px', borderRadius: 6, background: '#eef2ff', color: '#1e40af', fontSize: '0.85rem'
        }}>
          <div><strong>API Routes</strong></div>
          <div>OpenAI: <code>{apiRoutes.openai}</code></div>
          <div>Replicate: <code>{apiRoutes.replicate}</code></div>
          <div>Health: <code>{apiRoutes.health}</code> — {connectivity.status === 'ok' ? 'Connected' : (connectivity.status === 'error' ? 'Error' : 'Checking...')} {connectivity.status === 'error' ? `( ${connectivity.detail} )` : ''}</div>
          <button
            type="button"
            style={{ marginTop: 8 }}
            onClick={() => {
              setConnectivity({ status: 'checking', detail: '' });
              const healthUrl = getHealthUrl();
              fetch(healthUrl, { method: 'GET' })
                .then(async (res) => {
                  if (!res.ok) throw new Error(`Health ${res.status}`);
                  const data = await res.json().catch(() => ({}));
                  setConnectivity({ status: 'ok', detail: `health ok${data?.status ? ` (${data.status})` : ''}` });
                })
                .catch((err) => setConnectivity({ status: 'error', detail: err.message }));
            }}
          >Recheck</button>
        </div>
        <div className="project-inputs">
          <h2>Project Context</h2>
          
          <div className="input-group">
            <label>Style Blend Weights</label>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Materials: {Math.round((1 - (projectContext.materialWeight ?? 0.5)) * 100)}% local / {Math.round((projectContext.materialWeight ?? 0.5) * 100)}% portfolio</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(((projectContext.materialWeight ?? 0.5) * 100))}
                  onChange={(e) => handleInputChange('materialWeight', Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100)))}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Characteristics: {Math.round((1 - (projectContext.characteristicWeight ?? 0.5)) * 100)}% local / {Math.round((projectContext.characteristicWeight ?? 0.5) * 100)}% portfolio</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(((projectContext.characteristicWeight ?? 0.5) * 100))}
                  onChange={(e) => handleInputChange('characteristicWeight', Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100)))}
                />
              </div>
            </div>
          </div>

          <div className="input-group">
            <label>Strict Consistency (3D):</label>
            <input
              type="checkbox"
              checked={!!projectContext.strictConsistency}
              onChange={(e) => handleInputChange('strictConsistency', e.target.checked)}
            />
          </div>

          <div className="input-group">
            <label>Prompt Override (applied to all outputs):</label>
            <textarea
              rows={3}
              value={projectContext.promptOverride}
              onChange={(e) => handleInputChange('promptOverride', e.target.value)}
              placeholder="e.g., use local brick, pitched roof at 30°, align all views with same entrance orientation"
            />
          </div>

          <div className="input-group">
            <label>Project Seed:</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                value={projectContext.projectSeed || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value || '');
                  if (!isNaN(val)) {
                    setProjectContext(prev => ({ ...prev, projectSeed: val, seed: val }));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setProjectContext(prev => { const s = Math.floor(Math.random()*1000000); return { ...prev, projectSeed: s, seed: s }; })}
              >Randomize</button>
            </div>
          </div>

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

                {/* Integrated results (floor plans, technical drawings, 3D views) */}
                {results.floorPlans && (
                  <div className="floorplans-section">
                    <h3>Floor Plans</h3>
                    <div className="visualization-content">
                      {Object.entries(results.floorPlans.floorPlans || {}).map(([level, data]) => (
                        (data?.images || []).map((img, idx) => (
                          <div key={`${level}-${idx}`} className="image-container">
                            <img src={img} alt={`${level} floor plan`} className="generated-image" />
                          </div>
                        ))
                      ))}
                    </div>
                  </div>
                )}

                {results.technicalDrawings && (
                  <div className="technical-section">
                    <h3>Technical Drawings (Elevations/Sections)</h3>
                    <div className="visualization-content">
                      {Object.entries(results.technicalDrawings.technicalDrawings || {}).map(([key, data]) => (
                        (data?.images || []).map((img, idx) => (
                          <div key={`${key}-${idx}`} className="image-container">
                            <img src={img} alt={key} className="generated-image" />
                          </div>
                        ))
                      ))}
                    </div>
                  </div>
                )}

                {results.visualizations?.views && (
                  <div className="views-section">
                    <h3>3D Views</h3>
                    <div className="visualization-content">
                      {Object.entries(results.visualizations.views || {}).map(([view, data]) => (
                        (data?.images || []).map((img, idx) => (
                          <div key={`${view}-${idx}`} className="image-container">
                            <img src={img} alt={`${view} view`} className="generated-image" />
                          </div>
                        ))
                      ))}
                    </div>
                  </div>
                )}

                {/* MVP single visualization (quick design) */}
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
