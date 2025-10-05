import React from 'react';

/**
 * Environment Variables Diagnostic Component
 * Shows which env vars are loaded (for debugging)
 */
const EnvCheck = () => {
  const envVars = {
    'Google Maps': process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    'OpenWeather': process.env.REACT_APP_OPENWEATHER_API_KEY,
    'OpenAI': process.env.REACT_APP_OPENAI_API_KEY,
    'Replicate': process.env.REACT_APP_REPLICATE_API_KEY,
  };

  const maskKey = (key) => {
    if (!key || key.length === 0) return '❌ NOT SET';
    return `✅ ${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
  };

  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      background: '#1f2937',
      color: '#10b981',
      padding: '15px',
      borderRadius: '8px',
      fontSize: '12px',
      zIndex: 9999,
      maxWidth: '300px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#60a5fa' }}>
        🔧 Environment Variables
      </div>
      {Object.entries(envVars).map(([name, value]) => (
        <div key={name} style={{ marginBottom: '5px' }}>
          <strong>{name}:</strong> {maskKey(value)}
        </div>
      ))}
      <div style={{ marginTop: '10px', fontSize: '10px', color: '#9ca3af' }}>
        NODE_ENV: {process.env.NODE_ENV}
      </div>
    </div>
  );
};

export default EnvCheck;
