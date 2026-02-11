/**
 * Panel Quality Validator
 *
 * Lightweight quality checks with extra technical-drawing validation.
 * The validator is intentionally deterministic and dependency-free.
 */

export const QUALITY_THRESHOLDS = {
  minConsistencyScore: 0.75,
  minResolution: 512,
  minAspectRatio: 0.25,
  maxAspectRatio: 4.0,
  minProgramLabelCoverage: 0.5,
};

const TECHNICAL_PANEL_PREFIXES = ["floor_plan_", "elevation_", "section_"];

function readResolution(panel) {
  const width = Number(panel?.width || panel?.meta?.width || 0);
  const height = Number(panel?.height || panel?.meta?.height || 0);
  return { width, height };
}

function getPanelType(panel) {
  return panel?.panelType || panel?.type || panel?.id || "unknown";
}

function isTechnicalPanel(panelType) {
  return TECHNICAL_PANEL_PREFIXES.some((prefix) =>
    String(panelType).startsWith(prefix),
  );
}

function decodeSvgFromDataUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  if (!imageUrl.startsWith("data:image/svg+xml")) return null;

  const [, payload = ""] = imageUrl.split(",", 2);
  if (!payload) return null;

  if (imageUrl.includes(";base64,")) {
    try {
      if (typeof Buffer !== "undefined") {
        return Buffer.from(payload, "base64").toString("utf8");
      }
      if (typeof atob !== "undefined") {
        return decodeURIComponent(
          Array.from(atob(payload))
            .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`)
            .join(""),
        );
      }
      return null;
    } catch {
      return null;
    }
  }

  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function getExpectedProgramNames(panelType, dnaSnapshot) {
  if (!String(panelType).startsWith("floor_plan_")) return [];
  const rooms = dnaSnapshot?.rooms || dnaSnapshot?.program?.rooms || [];
  if (!Array.isArray(rooms) || rooms.length === 0) return [];

  const floorIndex =
    panelType === "floor_plan_ground"
      ? 0
      : panelType === "floor_plan_first"
        ? 1
        : Number(String(panelType).replace(/\D/g, "")) || 0;

  const onFloor = rooms.filter((room) => {
    const rawLevel = room.floor ?? room.level ?? room.lockedLevel ?? 0;
    if (typeof rawLevel === "number") return rawLevel === floorIndex;
    const level = normalizeName(rawLevel);
    if (level === "ground" || level === "g") return floorIndex === 0;
    if (level === "first") return floorIndex === 1;
    return Number(level) === floorIndex;
  });

  return onFloor.map((room) => room.name).filter(Boolean);
}

function validateTechnicalSvg(panelType, panel, dnaSnapshot) {
  const svg = decodeSvgFromDataUrl(panel?.imageUrl);
  const issues = [];
  let scoreDelta = 0;

  if (!svg) {
    issues.push("missing_svg_payload_for_technical_panel");
    scoreDelta -= 0.35;
    return {
      issues,
      scoreDelta,
      metrics: { hasSvg: false },
    };
  }

  if (!svg.includes("<svg") || !svg.includes("</svg>")) {
    issues.push("invalid_svg_structure");
    scoreDelta -= 0.4;
  }

  const hasDimensions =
    svg.includes('class="dimensions"') ||
    svg.includes('class="dimension-line"') ||
    svg.includes("dim-arrow");
  const hasRoomLabels =
    svg.includes('class="room-labels"') ||
    svg.includes('data-room="') ||
    svg.includes("m²");
  const hasWallGeometry =
    svg.includes('class="exterior-walls"') ||
    svg.includes('class="walls-geometry-exterior"') ||
    svg.includes("exterior-wall-hatch");

  if (String(panelType).startsWith("floor_plan_")) {
    if (!hasRoomLabels) {
      issues.push("floor_plan_missing_room_labels");
      scoreDelta -= 0.1;
    }
    if (!hasDimensions) {
      issues.push("floor_plan_missing_dimensions");
      scoreDelta -= 0.1;
    }
    if (!hasWallGeometry) {
      issues.push("floor_plan_missing_wall_geometry");
      scoreDelta -= 0.15;
    }

    const expectedNames = getExpectedProgramNames(panelType, dnaSnapshot);
    if (expectedNames.length > 0) {
      const svgLower = svg.toLowerCase();
      const hits = expectedNames.filter((name) =>
        svgLower.includes(normalizeName(name)),
      );
      const coverage = hits.length / expectedNames.length;
      if (coverage < QUALITY_THRESHOLDS.minProgramLabelCoverage) {
        issues.push(
          `program_label_coverage_below_${Math.round(QUALITY_THRESHOLDS.minProgramLabelCoverage * 100)}pct`,
        );
        scoreDelta -= 0.2;
      }
    }
  } else if (String(panelType).startsWith("elevation_")) {
    if (!hasDimensions) {
      issues.push("elevation_missing_dimensions");
      scoreDelta -= 0.08;
    }
    if (!svg.includes("<line") && !svg.includes("<path")) {
      issues.push("elevation_missing_linework");
      scoreDelta -= 0.25;
    }
  } else if (String(panelType).startsWith("section_")) {
    if (!hasDimensions) {
      issues.push("section_missing_dimensions");
      scoreDelta -= 0.08;
    }
    const hasHatching =
      svg.includes("hatch") || svg.includes("pattern") || svg.includes("poche");
    if (!hasHatching) {
      issues.push("section_missing_material_hatching");
      scoreDelta -= 0.1;
    }
  }

  return {
    issues,
    scoreDelta,
    metrics: {
      hasSvg: true,
      hasDimensions,
      hasRoomLabels,
      hasWallGeometry,
    },
  };
}

export function validatePanel(panel, dnaSnapshot = null) {
  const issues = [];
  let score = 1;
  const panelType = getPanelType(panel);
  const technicalPanel = isTechnicalPanel(panelType);

  if (!panel?.imageUrl) {
    issues.push("missing_image_url");
    score -= 0.55;
  }

  const { width, height } = readResolution(panel);
  if (width > 0 && height > 0) {
    if (width < QUALITY_THRESHOLDS.minResolution) {
      issues.push(`width_below_min_${QUALITY_THRESHOLDS.minResolution}`);
      score -= 0.15;
    }
    if (height < QUALITY_THRESHOLDS.minResolution) {
      issues.push(`height_below_min_${QUALITY_THRESHOLDS.minResolution}`);
      score -= 0.15;
    }

    const aspect = width / height;
    if (
      aspect < QUALITY_THRESHOLDS.minAspectRatio ||
      aspect > QUALITY_THRESHOLDS.maxAspectRatio
    ) {
      issues.push("invalid_aspect_ratio");
      score -= 0.1;
    }
  } else {
    issues.push("missing_resolution_metadata");
    score -= 0.15;
  }

  if (!panel?.prompt && !technicalPanel) {
    issues.push("missing_prompt_metadata");
    score -= 0.05;
  }

  let technicalMetrics = null;
  if (technicalPanel) {
    const technicalResult = validateTechnicalSvg(panelType, panel, dnaSnapshot);
    issues.push(...technicalResult.issues);
    score += technicalResult.scoreDelta;
    technicalMetrics = technicalResult.metrics;
  }

  score = Math.max(0, Math.min(1, score));
  const passed = score >= QUALITY_THRESHOLDS.minConsistencyScore;

  return {
    passed,
    score,
    issues,
    panelType,
    metrics: {
      technicalPanel,
      ...(technicalMetrics || {}),
    },
  };
}

export function validatePanelBatch(panels = [], dnaSnapshot = null) {
  const results = (panels || []).map((panel) => ({
    panel,
    validation: validatePanel(panel, dnaSnapshot),
  }));

  const failed = results.filter((r) => !r.validation.passed);
  const averageScore =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.validation.score, 0) / results.length
      : 1;

  return {
    passed: failed.length === 0,
    score: averageScore,
    total: results.length,
    failedCount: failed.length,
    results,
  };
}

export function getPanelsForRegeneration(panels = [], dnaSnapshot = null) {
  return (panels || []).filter((panel) => {
    if (panel?.validation) {
      return panel.validation.passed === false;
    }
    return !validatePanel(panel, dnaSnapshot).passed;
  });
}

export default {
  QUALITY_THRESHOLDS,
  validatePanel,
  validatePanelBatch,
  getPanelsForRegeneration,
};
