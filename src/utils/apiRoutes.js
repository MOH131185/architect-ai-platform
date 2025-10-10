// Runtime API route resolver for local dev vs Vercel production
// - Local: uses Express proxy (server.js) on http://localhost:3001
// - Production: uses Vercel serverless functions under /api

const isBrowser = typeof window !== 'undefined';
const host = isBrowser ? window.location.hostname : '';
const port = isBrowser ? window.location.port : '';
const isLoopback = host === 'localhost' || host === '127.0.0.1';
const isPrivateIPv4 = /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
const isLocalDomain = host.endsWith('.local');
const isCRADevPort = port === '3000';
const isLocalHost = isLoopback || isPrivateIPv4 || isLocalDomain || isCRADevPort;

const FORCE_LOCAL = (process.env.REACT_APP_FORCE_LOCAL_PROXY || '').toLowerCase() === 'true';
const API_BASE = process.env.REACT_APP_API_BASE || (isLocalHost || FORCE_LOCAL ? 'http://localhost:3001' : '');

export function getOpenAIUrl() {
  // Local proxy uses /api/openai/chat; Vercel function is /api/openai-chat
  if (API_BASE) return `${API_BASE}/api/openai/chat`;
  return '/api/openai-chat';
}

export function getReplicatePredictUrl() {
  // Local proxy uses /api/replicate/predictions; Vercel function is /api/replicate-predictions
  if (API_BASE) return `${API_BASE}/api/replicate/predictions`;
  return '/api/replicate-predictions';
}

export function getReplicateStatusUrl(predictionId) {
  // Local proxy uses /api/replicate/predictions/:id; Vercel function is /api/replicate-status?id=...
  if (API_BASE) return `${API_BASE}/api/replicate/predictions${predictionId ? '/' + predictionId : ''}`;
  return `/api/replicate-status${predictionId ? `?id=${predictionId}` : ''}`;
}

export function getHealthUrl() {
  // Health endpoint exists in both dev proxy and Vercel
  if (API_BASE) return `${API_BASE}/api/health`;
  return '/api/health';
}
