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

function panelFamily(key = "") {
  const normalized = String(key || "").toLowerCase();
  if (normalized.includes("plan")) {
    return "plan";
  }
  if (normalized.includes("elevation")) {
    return "elevation";
  }
  if (normalized.includes("section")) {
    return "section";
  }
  return "generic";
}

function pushZone(zones, zone) {
  zones.push(zone);
}

function buildGlobalZones() {
  return [
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
      preferredMethods: ["svg_text", "metadata", "raster_variance", "ocr"],
    },
    {
      id: "legend-zone",
      type: "legend_zone",
      required: false,
      expectedLabels: ["LEGEND", "KEY", "NORTH", "SCALE"],
      boundsNormalized: {
        x: 0.02,
        y: 0.72,
        width: 0.2,
        height: 0.18,
      },
      minimumEvidenceScore: 0.16,
      preferredMethods: ["svg_text", "raster_variance", "ocr"],
    },
    {
      id: "materials-zone",
      type: "materials_zone",
      required: false,
      expectedLabels: ["MATERIAL", "MATERIALS", "FINISH", "PALETTE"],
      boundsNormalized: {
        x: 0.72,
        y: 0.42,
        width: 0.26,
        height: 0.16,
      },
      minimumEvidenceScore: 0.16,
      preferredMethods: ["svg_text", "raster_variance", "ocr"],
    },
    {
      id: "spec-zone",
      type: "spec_zone",
      required: false,
      expectedLabels: ["SPEC", "SPECIFICATION", "NOTES", "CHECKED"],
      boundsNormalized: {
        x: 0.72,
        y: 0.58,
        width: 0.26,
        height: 0.18,
      },
      minimumEvidenceScore: 0.16,
      preferredMethods: ["svg_text", "raster_variance", "ocr"],
    },
  ];
}

function buildPanelBodyZone(key = "", bounds = {}) {
  const family = panelFamily(key);
  if (family === "plan") {
    return {
      id: `plan-labels:${key}`,
      type: "plan_labels",
      required: false,
      expectedLabels: ["ROOM", "KITCHEN", "BEDROOM", "STAIR", "NORTH", "SCALE"],
      bounds: {
        x: bounds.x + bounds.width * 0.08,
        y: bounds.y + bounds.height * 0.14,
        width: bounds.width * 0.84,
        height: bounds.height * 0.5,
      },
      minimumEvidenceScore: 0.14,
      preferredMethods: ["svg_text", "raster_variance", "ocr"],
    };
  }
  if (family === "elevation") {
    return {
      id: `elevation-body:${key}`,
      type: "elevation_labels",
      required: false,
      expectedLabels: ["ELEVATION", "FFL", "LEVEL", "MATERIAL"],
      bounds: {
        x: bounds.x + bounds.width * 0.08,
        y: bounds.y + bounds.height * 0.12,
        width: bounds.width * 0.84,
        height: bounds.height * 0.5,
      },
      minimumEvidenceScore: 0.14,
      preferredMethods: ["svg_text", "raster_variance", "ocr"],
    };
  }
  if (family === "section") {
    return {
      id: `section-body:${key}`,
      type: "section_labels",
      required: false,
      expectedLabels: ["SECTION", "LEVEL", "FFL", "STAIR", "ROOM"],
      bounds: {
        x: bounds.x + bounds.width * 0.08,
        y: bounds.y + bounds.height * 0.1,
        width: bounds.width * 0.84,
        height: bounds.height * 0.56,
      },
      minimumEvidenceScore: 0.14,
      preferredMethods: ["svg_text", "raster_variance", "ocr"],
    };
  }
  return null;
}

export function buildA1LabelZoneRegistry({
  expectedLabels = [],
  coordinates = {},
  panelLabelMap = {},
} = {}) {
  const zones = [...buildGlobalZones()];

  Object.entries(coordinates || {}).forEach(([key, coordinate]) => {
    const bounds = toBoundsFromCoordinate(coordinate);
    const label = panelLabelMap[key] || humanizePanelKey(key);
    pushZone(zones, {
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
      preferredMethods: ["svg_text", "metadata", "raster_variance", "ocr"],
    });

    const bodyZone = buildPanelBodyZone(key, bounds);
    if (bodyZone) {
      pushZone(zones, bodyZone);
    }
  });

  if (!Object.keys(coordinates || {}).length) {
    (expectedLabels || []).slice(0, 8).forEach((label, index) => {
      pushZone(zones, {
        id: `expected-label:${index}`,
        type: "expected_label",
        required: index < 4,
        expectedLabels: [label],
        minimumEvidenceScore: index < 4 ? 0.25 : 0.16,
        preferredMethods: ["svg_text", "metadata", "ocr"],
      });
    });
  }

  return {
    version: "phase12-a1-label-zone-registry-v1",
    zones,
  };
}

export default {
  buildA1LabelZoneRegistry,
};
