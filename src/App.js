import React, { useEffect, useState } from 'react';
import ArchitectAIEnhanced from './ArchitectAIEnhanced';
import { getOpenAIUrl, getReplicatePredictUrl, getHealthUrl } from './utils/apiRoutes';
import './App.css';

function App() {
  const [routes, setRoutes] = useState({ openai: '', replicate: '', health: '' });
  const [health, setHealth] = useState({ status: 'checking', detail: '' });

  useEffect(() => {
    const r = { openai: getOpenAIUrl(), replicate: getReplicatePredictUrl(), health: getHealthUrl() };
    setRoutes(r);
    fetch(r.health)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Health ${res.status}`);
        const data = await res.json().catch(() => ({}));
        setHealth({ status: 'ok', detail: data?.status || 'ok' });
      })
      .catch((err) => setHealth({ status: 'error', detail: err.message }));
  }, []);

  return (
    <div>
      <div style={{ padding: 8, background: '#eef2ff', color: '#1e40af', fontSize: '0.85rem' }}>
        <strong>API</strong> — OpenAI: <code>{routes.openai}</code> | Replicate: <code>{routes.replicate}</code> | Health: <code>{routes.health}</code> — {health.status === 'ok' ? 'Connected' : (health.status === 'error' ? `Error (${health.detail})` : 'Checking...')}
      </div>
      <ArchitectAIEnhanced />
    </div>
  );
}

export default App;
