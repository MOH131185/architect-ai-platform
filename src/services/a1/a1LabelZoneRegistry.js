function humanizePanelKey(key = "") {
  return String(key || "")
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toBoundsFromCoordinate(coordinate = {}) {
  return {
    x: Number(coordinate.x || 0),
    y: Number(coordinate.y || 0),
    width: Number(coordinate.width || 0),
    height: Number(coordinate.height || 0),
  };
}

export function buildA1LabelZoneRegistry({
  expectedLabels = [],
  coordinates = {},
  panelLabelMap = {},
} = {}) {
  const zones = [
    {
      id: "title-block",
      type: "title_block",
      required: false,
      expectedLabels: ["PROJECT", "SCALE", "DATE", "A1"],
      boundsNormalized: {
        x: 0.72,
        y: 0.82,
        width: 0.26,
        height: 0.16,
      },
      minimumEvidenceScore: 0.2,
    },
  ];

  Object.entries(coordinates || {}).forEach(([key, coordinate]) => {
    const bounds = toBoundsFromCoordinate(coordinate);
    const label = panelLabelMap[key] || humanizePanelKey(key);
    zones.push({
      id: `panel-header:${key}`,
      type: "panel_header",
      required: true,
      expectedLabels: [label],
      bounds: {
        x: bounds.x,
        y: bounds.y + bounds.height * 0.8,
        width: bounds.width,
        height: Math.max(24, bounds.height * 0.2),
      },
      minimumEvidenceScore: 0.28,
    });
  });

  if (!Object.keys(coordinates || {}).length) {
    (expectedLabels || []).slice(0, 8).forEach((label, index) => {
      zones.push({
        id: `expected-label:${index}`,
        type: "expected_label",
        required: index < 4,
        expectedLabels: [label],
        minimumEvidenceScore: index < 4 ? 0.25 : 0.16,
      });
    });
  }

  return {
    version: "phase10-a1-label-zone-registry-v1",
    zones,
  };
}

export default {
  buildA1LabelZoneRegistry,
};
