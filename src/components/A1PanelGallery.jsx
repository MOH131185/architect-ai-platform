import React from 'react';
import Card from './ui/Card.jsx';

function extractPanels(result) {
  if (!result) return [];

  const rawPanels =
    result.panels ||
    result.panelMap ||
    result.a1Sheet?.panels ||
    result.a1Sheet?.panelMap ||
    result.metadata?.panelMap ||
    result.metadata?.panels ||
    result.a1Sheet?.metadata?.panels ||
    {};

  if (Array.isArray(rawPanels)) {
    return rawPanels
      .map((panel, idx) => ({
        key: panel?.id || panel?.type || `panel_${idx}`,
        label: panel?.label || panel?.name || panel?.type || `Panel ${idx + 1}`,
        imageUrl: panel?.imageUrl || panel?.url,
        seed: panel?.seed,
        prompt: panel?.prompt,
        width: panel?.width,
        height: panel?.height
      }))
      .filter(p => p.imageUrl);
  }

  if (rawPanels && typeof rawPanels === 'object') {
    return Object.entries(rawPanels)
      .map(([key, panel]) => ({
        key,
        label: panel?.name || panel?.label || key,
        imageUrl: panel?.imageUrl || panel?.url,
        seed: panel?.seed,
        prompt: panel?.prompt,
        width: panel?.width,
        height: panel?.height
      }))
      .filter(p => p.imageUrl);
  }

  return [];
}

const A1PanelGallery = ({ result }) => {
  const panels = extractPanels(result);

  if (!panels.length) {
    return (
      <Card variant="glass" padding="lg" className="text-center">
        <p className="text-gray-400">No individual panels available.</p>
      </Card>
    );
  }

  return (
    <Card variant="glass" padding="lg" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">A1 Panel Gallery</h3>
          <p className="text-sm text-gray-400">{panels.length} panels</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {panels.map((panel) => (
          <div
            key={panel.key}
            className="bg-navy-900/60 border border-navy-700 rounded-xl overflow-hidden shadow-md"
          >
            <div className="aspect-video bg-navy-800">
              <img
                src={panel.imageUrl}
                alt={panel.label}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="p-3 space-y-1">
              <p className="text-sm font-semibold text-white truncate">{panel.label}</p>
              {panel.seed !== undefined && (
                <p className="text-xs text-gray-400">Seed: {panel.seed}</p>
              )}
              {panel.width && panel.height && (
                <p className="text-xs text-gray-500">
                  {panel.width} x {panel.height}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default A1PanelGallery;
