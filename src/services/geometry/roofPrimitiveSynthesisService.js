import {
  buildBoundingBoxFromPolygon,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import {
  normalizeRoofPrimitiveSupportMode,
  summarizeCanonicalRoofTruth as summarizeCanonicalRoofTruthModel,
} from "../drawing/constructionTruthModel.js";

function rectanglePolygonFromBounds(minX, minY, maxX, maxY) {
  return rectangleToPolygon(
    roundMetric(minX),
    roundMetric(minY),
    roundMetric(maxX - minX),
    roundMetric(maxY - minY),
  );
}

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function getRoofBounds(projectGeometry = {}, roof = {}, polygon = []) {
  return (
    roof.bbox ||
    buildBoundingBoxFromPolygon(polygon || []) ||
    projectGeometry.footprints?.[projectGeometry.footprints.length - 1]?.bbox ||
    projectGeometry.footprints?.[0]?.bbox ||
    null
  );
}

function inferMassingTypeFromGeometry(projectGeometry = {}) {
  return String(
    projectGeometry?.metadata?.style_dna?.geometry?.massing?.type ||
      projectGeometry?.metadata?.style_dna?.massing?.type ||
      projectGeometry?.metadata?.massing?.type ||
      "",
  )
    .trim()
    .toLowerCase();
}

function isComplexRoofMassing(projectGeometry = {}, polygon = []) {
  const massingType = inferMassingTypeFromGeometry(projectGeometry);
  if (massingType.includes("l") || massingType.includes("courtyard")) {
    return true;
  }
  return Array.isArray(polygon) && polygon.length > 4;
}

export function inferRoofSynthesisContext({
  projectGeometry = {},
  roof = {},
  style = {},
  polygon = [],
  bbox = null,
} = {}) {
  const roofLanguage = String(
    roof.type || style.roof_type || style.roofType || "gable",
  )
    .trim()
    .toLowerCase();
  const resolvedBounds = getRoofBounds(projectGeometry, roof, polygon);
  const splitAlongX =
    Number(resolvedBounds?.width || 0) >= Number(resolvedBounds?.height || 0);
  const buildingHeight = (projectGeometry.levels || []).reduce(
    (sum, level) => sum + Number(level.height_m || 3.2),
    0,
  );
  const eaveHeight = roundMetric(buildingHeight || 3.2);
  const pitchDegrees = Number(
    roof.pitch_degrees ||
      roof.pitchDegrees ||
      roof.pitch ||
      style.roof_pitch_degrees ||
      style.roofPitchDegrees ||
      35,
  );
  const inferredRise = roundMetric(
    roofLanguage.includes("flat")
      ? 0.18
      : roofLanguage.includes("mono")
        ? Math.max(0.45, eaveHeight * 0.06)
        : Math.max(0.55, Math.tan((pitchDegrees * Math.PI) / 180) * 1.25),
  );
  const ridgeHeight = roundMetric(eaveHeight + inferredRise);

  return {
    roofLanguage,
    bbox: resolvedBounds,
    splitAlongX,
    eaveHeight,
    ridgeHeight,
    pitchDegrees,
    complexMassing: isComplexRoofMassing(projectGeometry, polygon),
  };
}

export function synthesizeRoofPlanesFromMassing({
  projectGeometry = {},
  roof = {},
  style = {},
  polygon = [],
  bbox = null,
} = {}) {
  const context = inferRoofSynthesisContext({
    projectGeometry,
    roof,
    style,
    polygon,
    bbox,
  });
  if (!context.bbox) {
    return [];
  }

  const overhangM = roof.overhang_m ?? style.roof_overhang_m ?? 0.45;
  const primitives = [];
  const isFlat = context.roofLanguage.includes("flat");
  const isMono = context.roofLanguage.includes("mono");
  const isHip = context.roofLanguage.includes("hip");
  const midX = roundMetric((context.bbox.min_x + context.bbox.max_x) / 2);
  const midY = roundMetric((context.bbox.min_y + context.bbox.max_y) / 2);

  if (isFlat) {
    return [
      {
        primitive_family: "roof_plane",
        type: "flat_roof_plane",
        polygon:
          polygon.length > 0
            ? polygon
            : rectanglePolygonFromBounds(
                context.bbox.min_x,
                context.bbox.min_y,
                context.bbox.max_x,
                context.bbox.max_y,
              ),
        bbox: context.bbox,
        roof_language: context.roofLanguage,
        ridge_height_m: context.eaveHeight + 0.18,
        eave_height_m: context.eaveHeight,
        overhang_m: overhangM,
        support_mode: "explicit_generated",
        roof_surface_role: "primary-plane",
        provenance: {
          source: "roof-primitive-synthesis-service",
          derivation: "phase17-flat-plane",
        },
      },
    ];
  }

  if (isMono) {
    return [
      {
        primitive_family: "roof_plane",
        type: "mono_pitch_roof_plane",
        polygon:
          polygon.length > 0
            ? polygon
            : rectanglePolygonFromBounds(
                context.bbox.min_x,
                context.bbox.min_y,
                context.bbox.max_x,
                context.bbox.max_y,
              ),
        bbox: context.bbox,
        roof_language: context.roofLanguage,
        ridge_height_m: context.ridgeHeight,
        eave_height_m: context.eaveHeight,
        overhang_m: overhangM,
        support_mode: "explicit_generated",
        roof_surface_role: "primary-plane",
        provenance: {
          source: "roof-primitive-synthesis-service",
          derivation: "phase17-mono-plane",
        },
      },
    ];
  }

  const planePolygons = context.splitAlongX
    ? [
        rectanglePolygonFromBounds(
          context.bbox.min_x,
          context.bbox.min_y,
          context.bbox.max_x,
          midY,
        ),
        rectanglePolygonFromBounds(
          context.bbox.min_x,
          midY,
          context.bbox.max_x,
          context.bbox.max_y,
        ),
      ]
    : [
        rectanglePolygonFromBounds(
          context.bbox.min_x,
          context.bbox.min_y,
          midX,
          context.bbox.max_y,
        ),
        rectanglePolygonFromBounds(
          midX,
          context.bbox.min_y,
          context.bbox.max_x,
          context.bbox.max_y,
        ),
      ];

  planePolygons.forEach((planePolygon, index) => {
    primitives.push({
      primitive_family: "roof_plane",
      type: isHip
        ? `hip_roof_plane_${index + 1}`
        : `pitched_roof_plane_${index + 1}`,
      polygon: planePolygon,
      bbox: buildBoundingBoxFromPolygon(planePolygon),
      roof_language: context.roofLanguage,
      ridge_height_m: context.ridgeHeight,
      eave_height_m: context.eaveHeight,
      overhang_m: overhangM,
      support_mode: "explicit_generated",
      roof_surface_role: index === 0 ? "primary-plane" : "secondary-plane",
      provenance: {
        source: "roof-primitive-synthesis-service",
        derivation: isHip ? "phase17-hip-split" : "phase17-gable-split",
      },
    });
  });

  return primitives;
}

export function deriveRoofEdgesAndRidges({
  projectGeometry = {},
  roof = {},
  style = {},
  polygon = [],
  bbox = null,
} = {}) {
  const context = inferRoofSynthesisContext({
    projectGeometry,
    roof,
    style,
    polygon,
    bbox,
  });
  if (!context.bbox) {
    return [];
  }

  const isFlat = context.roofLanguage.includes("flat");
  const isMono = context.roofLanguage.includes("mono");
  const isHip = context.roofLanguage.includes("hip");
  const segments = [
    {
      side: "north",
      start: {
        x: roundMetric(context.bbox.min_x),
        y: roundMetric(context.bbox.min_y),
      },
      end: {
        x: roundMetric(context.bbox.max_x),
        y: roundMetric(context.bbox.min_y),
      },
    },
    {
      side: "east",
      start: {
        x: roundMetric(context.bbox.max_x),
        y: roundMetric(context.bbox.min_y),
      },
      end: {
        x: roundMetric(context.bbox.max_x),
        y: roundMetric(context.bbox.max_y),
      },
    },
    {
      side: "south",
      start: {
        x: roundMetric(context.bbox.max_x),
        y: roundMetric(context.bbox.max_y),
      },
      end: {
        x: roundMetric(context.bbox.min_x),
        y: roundMetric(context.bbox.max_y),
      },
    },
    {
      side: "west",
      start: {
        x: roundMetric(context.bbox.min_x),
        y: roundMetric(context.bbox.max_y),
      },
      end: {
        x: roundMetric(context.bbox.min_x),
        y: roundMetric(context.bbox.min_y),
      },
    },
  ];
  const primitives = [];

  segments.forEach((segment) => {
    const primitiveFamily = isFlat
      ? "parapet"
      : /north|south/.test(segment.side) === context.splitAlongX
        ? "eave"
        : "roof_edge";
    primitives.push({
      primitive_family: primitiveFamily,
      type: `${primitiveFamily}_${segment.side}`,
      side: segment.side,
      start: segment.start,
      end: segment.end,
      bbox: buildBoundingBoxFromPolygon([segment.start, segment.end]),
      roof_language: context.roofLanguage,
      ridge_height_m: context.ridgeHeight,
      eave_height_m: context.eaveHeight,
      support_mode: "explicit_generated",
      provenance: {
        source: "roof-primitive-synthesis-service",
        derivation: isFlat ? "phase17-parapet-edge" : "phase17-roof-edge",
      },
    });
  });

  const ridgeStart = context.splitAlongX
    ? {
        x: roundMetric(context.bbox.min_x),
        y: roundMetric((context.bbox.min_y + context.bbox.max_y) / 2),
      }
    : {
        x: roundMetric((context.bbox.min_x + context.bbox.max_x) / 2),
        y: roundMetric(context.bbox.min_y),
      };
  const ridgeEnd = context.splitAlongX
    ? {
        x: roundMetric(context.bbox.max_x),
        y: roundMetric((context.bbox.min_y + context.bbox.max_y) / 2),
      }
    : {
        x: roundMetric((context.bbox.min_x + context.bbox.max_x) / 2),
        y: roundMetric(context.bbox.max_y),
      };

  if (!isFlat) {
    primitives.push({
      primitive_family: "ridge",
      type: isHip ? "hip_ridge_line" : "ridge_line",
      start: ridgeStart,
      end: ridgeEnd,
      bbox: buildBoundingBoxFromPolygon([ridgeStart, ridgeEnd]),
      roof_language: context.roofLanguage,
      ridge_height_m: context.ridgeHeight,
      eave_height_m: context.eaveHeight,
      support_mode: "explicit_generated",
      provenance: {
        source: "roof-primitive-synthesis-service",
        derivation: "phase17-ridge",
      },
    });
  }

  if (!isFlat || isMono || context.complexMassing) {
    primitives.push({
      primitive_family: context.complexMassing ? "valley" : "roof_break",
      type: context.complexMassing
        ? "valley_line"
        : isMono
          ? "mono_pitch_break"
          : "ridge_break",
      start: ridgeStart,
      end: ridgeEnd,
      bbox: buildBoundingBoxFromPolygon([ridgeStart, ridgeEnd]),
      roof_language: context.roofLanguage,
      ridge_height_m: context.ridgeHeight,
      eave_height_m: context.eaveHeight,
      support_mode: "explicit_generated",
      provenance: {
        source: "roof-primitive-synthesis-service",
        derivation: context.complexMassing
          ? "phase17-valley"
          : "phase17-roof-break",
      },
    });
  }

  if (isHip) {
    const hipPairs = context.splitAlongX
      ? [
          [
            ridgeStart,
            {
              x: roundMetric(context.bbox.min_x),
              y: roundMetric(context.bbox.min_y),
            },
          ],
          [
            ridgeEnd,
            {
              x: roundMetric(context.bbox.max_x),
              y: roundMetric(context.bbox.min_y),
            },
          ],
        ]
      : [
          [
            ridgeStart,
            {
              x: roundMetric(context.bbox.min_x),
              y: roundMetric(context.bbox.min_y),
            },
          ],
          [
            ridgeEnd,
            {
              x: roundMetric(context.bbox.min_x),
              y: roundMetric(context.bbox.max_y),
            },
          ],
        ];
    hipPairs.forEach(([start, end], index) => {
      primitives.push({
        primitive_family: "hip",
        type: `hip_line_${index + 1}`,
        start,
        end,
        bbox: buildBoundingBoxFromPolygon([start, end]),
        roof_language: context.roofLanguage,
        ridge_height_m: context.ridgeHeight,
        eave_height_m: context.eaveHeight,
        support_mode: "explicit_generated",
        provenance: {
          source: "roof-primitive-synthesis-service",
          derivation: "phase17-hip",
        },
      });
    });
  }

  return primitives;
}

function findDormerSources(projectGeometry = {}, input = {}) {
  const normalizeFeatureCollection = (collection) => {
    if (Array.isArray(collection)) {
      return collection;
    }
    if (!collection || typeof collection !== "object") {
      return [];
    }
    return Object.values(collection).flatMap((entry) =>
      Array.isArray(entry)
        ? entry
        : entry && typeof entry === "object"
          ? [entry]
          : [],
    );
  };
  return [
    ...normalizeFeatureCollection(projectGeometry.metadata?.facade_features),
    ...normalizeFeatureCollection(projectGeometry.metadata?.facadeFeatures),
    ...normalizeFeatureCollection(
      projectGeometry.metadata?.facade_grammar?.features,
    ),
    ...(input.dormers || input.roofDormers || []),
  ].filter((feature) =>
    String(feature?.type || feature?.family || "")
      .toLowerCase()
      .includes("dormer"),
  );
}

export function attachDormersToRoofPrimitives({
  projectGeometry = {},
  primitives = [],
  roofLanguage = "gable",
  input = {},
} = {}) {
  const roofPlanes = (primitives || []).filter(
    (entry) => entry.primitive_family === "roof_plane",
  );
  if (!roofPlanes.length) {
    return [];
  }

  return findDormerSources(projectGeometry, input).map((dormer, index) => {
    const host = roofPlanes[index % roofPlanes.length];
    const bbox = host.bbox || {};
    const width = Math.max(0.9, Number(dormer.width_m || dormer.width || 1.2));
    const height = Math.max(
      0.55,
      Number(dormer.height_m || dormer.height || 0.8),
    );
    const centerX = roundMetric(
      dormer.center_x ??
        dormer.x ??
        (Number(bbox.min_x || 0) + Number(bbox.max_x || 0)) / 2,
    );
    const centerY = roundMetric(
      dormer.center_y ??
        dormer.y ??
        (Number(bbox.min_y || 0) + Number(bbox.max_y || 0)) / 2,
    );
    const dormerPolygon = rectanglePolygonFromBounds(
      centerX - width / 2,
      centerY - height / 2,
      centerX + width / 2,
      centerY + height / 2,
    );
    return {
      primitive_family: "dormer_attachment",
      type: String(dormer.type || "dormer_attachment").toLowerCase(),
      polygon: dormerPolygon,
      bbox: buildBoundingBoxFromPolygon(dormerPolygon),
      attached_primitive_id:
        host.id || `roof-plane-${index % roofPlanes.length}`,
      roof_language: roofLanguage,
      ridge_height_m: roundMetric(host.ridge_height_m || 0),
      eave_height_m: roundMetric(host.eave_height_m || 0),
      support_mode: "explicit_generated",
      provenance: {
        source: "roof-primitive-synthesis-service",
        derivation: "phase17-dormer-attachment",
      },
    };
  });
}

export function buildCanonicalRoofPrimitivePayloads({
  projectGeometry = {},
  input = {},
  styleDNA = {},
} = {}) {
  const explicit =
    input.roof_primitives || input.roofPrimitives || input.roofElements || [];
  if (Array.isArray(explicit) && explicit.length) {
    return explicit.map((entry) => ({
      ...entry,
      support_mode: normalizeRoofPrimitiveSupportMode(entry),
    }));
  }

  const roof = projectGeometry.roof || input.roof || {};
  const polygon = roof.polygon?.length
    ? roof.polygon
    : projectGeometry.footprints?.[projectGeometry.footprints.length - 1]
        ?.polygon || [];
  const context = inferRoofSynthesisContext({
    projectGeometry,
    roof,
    style: styleDNA,
    polygon,
    bbox: roof.bbox,
  });
  if (!context.bbox) {
    return [];
  }

  const primitives = [
    ...synthesizeRoofPlanesFromMassing({
      projectGeometry,
      roof,
      style: styleDNA,
      polygon,
      bbox: context.bbox,
    }),
    ...deriveRoofEdgesAndRidges({
      projectGeometry,
      roof,
      style: styleDNA,
      polygon,
      bbox: context.bbox,
    }),
  ];

  primitives.push(
    ...attachDormersToRoofPrimitives({
      projectGeometry,
      primitives,
      roofLanguage: context.roofLanguage,
      input,
    }),
  );

  return primitives.map((entry) => ({
    ...entry,
    support_mode: normalizeRoofPrimitiveSupportMode(entry),
  }));
}

export function summarizeCanonicalRoofTruth({
  roofPrimitives = [],
  roof = {},
  style = {},
} = {}) {
  return summarizeCanonicalRoofTruthModel({
    roofPrimitives,
    roof,
    style,
  });
}

export default {
  inferRoofSynthesisContext,
  synthesizeRoofPlanesFromMassing,
  deriveRoofEdgesAndRidges,
  attachDormersToRoofPrimitives,
  buildCanonicalRoofPrimitivePayloads,
  summarizeCanonicalRoofTruth,
};
