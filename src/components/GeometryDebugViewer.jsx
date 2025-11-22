import React from 'react';
import Card from './ui/Card.jsx';

function normalizeRenders(renders) {
  if (!renders) return [];
  if (Array.isArray(renders)) {
    return renders.map((r, idx) => ({
      key: r?.type || `render_${idx}`,
      type: r?.type || `render_${idx}`,
      url: r?.url,
      model: r?.model || 'unknown'
    })).filter(r => r.url);
  }
  if (typeof renders === 'object') {
    return Object.entries(renders)
      .map(([key, r]) => ({
        key,
        type: r?.type || key,
        url: r?.url,
        model: r?.model || 'unknown'
      }))
      .filter(r => r.url);
  }
  return [];
}

const GeometryDebugViewer = ({ geometryRenders }) => {
  const items = normalizeRenders(geometryRenders);
  if (!items.length) return null;

  return (
    <Card variant="glass" padding="lg" className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-white">Geometry Renders (Debug)</h3>
        <p className="text-sm text-gray-400">Neutral/placeholder geometry views used for control.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(item => (
          <div key={item.key} className="bg-navy-900/60 border border-navy-700 rounded-xl overflow-hidden">
            <div className="aspect-video bg-navy-800">
              <img src={item.url} alt={item.type} className="w-full h-full object-cover" loading="lazy" />
            </div>
            <div className="p-3 text-sm text-white flex justify-between">
              <span className="font-semibold">{item.type}</span>
              <span className="text-gray-400">{item.model}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default GeometryDebugViewer;
