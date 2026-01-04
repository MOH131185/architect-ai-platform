import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getTogetherPacingDiagnostics } from '../services/togetherAIService.js';

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString();
};

const DevDiagnosticsPanel = ({ onClose }) => {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const update = () => {
      try {
        const diagnostics = getTogetherPacingDiagnostics?.();
        setMetrics(diagnostics || null);
      } catch (error) {
        console.warn('Unable to read Together pacing diagnostics:', error);
      }
    };

    update();
    const intervalId = setInterval(update, 2000);
    return () => clearInterval(intervalId);
  }, []);

  if (!metrics) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-blue-500/30 bg-slate-900/95 p-4 text-white shadow-2xl shadow-blue-900/40 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">
            Together Pacing Diagnostics
          </p>
          <p className="text-xs text-slate-300">Ctrl+Shift+D to toggle</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="space-y-1 text-xs text-slate-100">
        <div className="flex justify-between">
          <dt>Min interval (ms)</dt>
          <dd>{metrics.minIntervalMs ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Avg interval (ms)</dt>
          <dd>{metrics.avgInterval ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Last interval (ms)</dt>
          <dd>{metrics.lastInterval ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Samples</dt>
          <dd>{metrics.sampleCount ?? 0}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Violations</dt>
          <dd>{metrics.minIntervalViolations ?? 0}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Last violation</dt>
          <dd>{formatTimestamp(metrics.lastViolationAt)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Last 429</dt>
          <dd>{formatTimestamp(metrics.last429At)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Retry-after (ms)</dt>
          <dd>{metrics.lastRetryAfterMs ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Consecutive 429s</dt>
          <dd>{metrics.consecutiveRateLimits ?? 0}</dd>
        </div>
      </dl>
    </div>
  );
};

export default DevDiagnosticsPanel;

