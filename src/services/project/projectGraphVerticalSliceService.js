import {
  polygonToLocalXY,
  computeCentroid as computeGeoCentroid,
} from "../../utils/geometry.js";
import {
  CANONICAL_PROJECT_GEOMETRY_VERSION,
  buildBoundingBoxFromPolygon,
  computePolygonArea,
  createStableId,
  rectangleToPolygon,
  roundMetric,
} from "../cad/projectGeometrySchema.js";
import { buildCompiledProjectTechnicalPanels } from "../canonical/compiledProjectTechnicalPackBuilder.js";
import { compileProject } from "../compiler/index.js";
import { resolveArchitectureModelRegistry } from "../modelStepResolver.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";

export const PROJECT_GRAPH_SCHEMA_VERSION = "project-graph-v1";
export const PROJECT_GRAPH_VERTICAL_SLICE_VERSION =
  "project-graph-vertical-slice-v1";

const PROFESSIONAL_REVIEW_DISCLAIMER =
  "AI-generated early-stage architecture package. Regulation checks are preliminary design flags and require professional review.";

function cloneData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function slugify(value) {
  return String(value || "project")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry !== undefined && entry !== null);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeBuildingType(input = {}) {
  const raw = String(
    input.building_type ||
      input.buildingType ||
      input.category ||
      input.projectType ||
      input.program ||
      input.subType ||
      "dwelling",
  )
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (
    [
      "detached-house",
      "semi-detached-house",
      "terraced-house",
      "villa",
      "cottage",
      "dwelling",
      "residential",
      "house",
    ].includes(raw)
  ) {
    return "dwelling";
  }
  if (raw.includes("community") || raw.includes("library")) {
    return "community";
  }
  if (raw.includes("mixed")) {
    return "mixed_use";
  }
  return raw || "other";
}

function levelName(index) {
  const names = ["Ground", "First", "Second", "Third"];
  return names[index] || `Level ${index}`;
}

function normalizeBrief(input = {}) {
  const sourceBrief = input.brief || input.projectBrief || input;
  const projectDetails = input.projectDetails || {};
  const locationData = input.locationData || {};
  const siteInput = sourceBrief.site_input || sourceBrief.siteInput || {};
  const coordinates =
    locationData.coordinates ||
    siteInput.coordinates ||
    (Number.isFinite(Number(siteInput.lat)) &&
    Number.isFinite(Number(siteInput.lon))
      ? { lat: Number(siteInput.lat), lng: Number(siteInput.lon) }
      : null);
  const buildingType = normalizeBuildingType({
    ...projectDetails,
    ...sourceBrief,
  });
  const targetGiaM2 = Math.max(
    40,
    Number(
      sourceBrief.target_gia_m2 ??
        sourceBrief.targetAreaM2 ??
        sourceBrief.area ??
        projectDetails.area ??
        180,
    ) || 180,
  );
  const targetStoreys = Math.max(
    1,
    Math.min(
      4,
      Number.parseInt(
        sourceBrief.target_storeys ??
          sourceBrief.targetStoreys ??
          projectDetails.floorCount ??
          2,
        10,
      ) || 2,
    ),
  );
  const projectName =
    sourceBrief.project_name ||
    sourceBrief.projectName ||
    projectDetails.projectName ||
    projectDetails.name ||
    "ArchiAI Project";

  return {
    project_name: projectName,
    building_type: buildingType,
    client_goals: toArray(
      sourceBrief.client_goals ||
        sourceBrief.clientGoals ||
        projectDetails.clientGoals ||
        projectDetails.customNotes ||
        [],
    ),
    site_input: {
      address:
        siteInput.address ||
        locationData.address ||
        projectDetails.address ||
        null,
      postcode: siteInput.postcode || locationData.postcode || null,
      lat: Number(coordinates?.lat ?? siteInput.lat ?? 51.5074),
      lon: Number(
        coordinates?.lng ?? coordinates?.lon ?? siteInput.lon ?? -0.1278,
      ),
      boundary_geojson: siteInput.boundary_geojson || null,
    },
    target_gia_m2: round(targetGiaM2, 2),
    target_storeys: targetStoreys,
    budget_band: sourceBrief.budget_band || "unknown",
    sustainability_ambition:
      sourceBrief.sustainability_ambition ||
      projectDetails.sustainabilityAmbition ||
      "low_energy",
    required_spaces_text:
      sourceBrief.required_spaces_text ||
      sourceBrief.requiredSpacesText ||
      projectDetails.requiredSpacesText ||
      "",
    constraints_text:
      sourceBrief.constraints_text ||
      sourceBrief.constraintsText ||
      projectDetails.constraintsText ||
      "",
    user_intent: {
      style_keywords: toArray(
        sourceBrief.style_keywords ||
          sourceBrief.user_intent?.style_keywords ||
          input.styleKeywords ||
          projectDetails.styleKeywords || [
            "RIBA portfolio",
            "contextual contemporary",
          ],
      ),
      avoid_keywords: toArray(sourceBrief.user_intent?.avoid_keywords || []),
      portfolio_mood: sourceBrief.user_intent?.portfolio_mood || "riba_stage2",
      local_blend_strength: Number(
        sourceBrief.user_intent?.local_blend_strength ?? 0.65,
      ),
      innovation_strength: Number(
        sourceBrief.user_intent?.innovation_strength ?? 0.35,
      ),
      material_preferences: toArray(
        sourceBrief.material_preferences ||
          sourceBrief.user_intent?.material_preferences ||
          input.materialPreferences ||
          [],
      ),
      accessibility_priority:
        sourceBrief.user_intent?.accessibility_priority || "inclusive",
      privacy_level: sourceBrief.user_intent?.privacy_level || "public",
    },
  };
}

function normalizeInputProgramSpaces(programSpaces = [], brief) {
  if (!Array.isArray(programSpaces) || programSpaces.length === 0) {
    return [];
  }
  const totalArea = programSpaces.reduce(
    (sum, space) =>
      sum + Math.max(0, Number(space.area || space.target_area_m2 || 0)),
    0,
  );
  const scale =
    totalArea > 0 ? Number(brief.target_gia_m2 || totalArea) / totalArea : 1;

  return programSpaces.map((space, index) => {
    const name = space.name || space.label || `Space ${index + 1}`;
    const targetArea = Math.max(
      4,
      Number(space.target_area_m2 || space.area || 12) * scale,
    );
    const levelIndex = Math.max(
      0,
      Math.min(
        Number(brief.target_storeys || 1) - 1,
        Number.parseInt(space.levelIndex ?? space.level_index ?? 0, 10) || 0,
      ),
    );
    return {
      space_id: space.id || createStableId("space", name, index),
      name,
      function: space.function || space.spaceType || "programme space",
      zone: space.zone || "semi_public",
      target_area_m2: round(targetArea, 2),
      min_area_m2: round(targetArea * 0.85, 2),
      max_area_m2: round(targetArea * 1.15, 2),
      target_level: levelName(levelIndex),
      target_level_index: levelIndex,
      actual_level_id: `level-${levelIndex}`,
      required_daylight: space.required_daylight || "medium",
      acoustic_privacy: space.acoustic_privacy || "medium",
      accessible: space.accessible !== false,
      adjacency_tags: toArray(
        space.adjacency_tags || space.adjacencyTags || [],
      ),
      qa_status: "unplaced",
    };
  });
}

function buildTemplateProgramSpaces(brief) {
  const target = Number(brief.target_gia_m2 || 180);
  const upperLevel = Math.min(
    1,
    Math.max(0, Number(brief.target_storeys || 1) - 1),
  );
  const communityTemplate = [
    [
      "Cafe and welcome",
      "street-facing public arrival and cafe",
      "public",
      0.15,
      0,
      "high",
    ],
    [
      "Community workshop",
      "flexible making and events room",
      "semi_public",
      0.18,
      0,
      "medium",
    ],
    ["Accessible WC", "inclusive visitor WC", "service", 0.04, 0, "low"],
    [
      "Plant and store",
      "plant, cleaner and equipment storage",
      "service",
      0.04,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "arrival, stair and horizontal circulation",
      "semi_public",
      0.08,
      0,
      "medium",
    ],
    [
      "Public reading room",
      "primary reading space",
      "public",
      0.25,
      upperLevel,
      "high",
    ],
    [
      "Quiet study",
      "focused study and reading",
      "private",
      0.17,
      upperLevel,
      "high",
    ],
    [
      "Flexible meeting room",
      "small group meeting and tutoring room",
      "semi_public",
      0.09,
      upperLevel,
      "medium",
    ],
  ];
  const dwellingTemplate = [
    [
      "Entrance hall",
      "arrival and vertical circulation",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    ["Living room", "family living space", "public", 0.18, 0, "high"],
    ["Kitchen dining", "cooking and dining space", "public", 0.16, 0, "high"],
    [
      "WC and utility",
      "ground floor WC and utility",
      "service",
      0.05,
      0,
      "low",
    ],
    [
      "Ground circulation",
      "horizontal circulation",
      "semi_public",
      0.06,
      0,
      "medium",
    ],
    [
      "Principal bedroom",
      "main bedroom",
      "private",
      0.14,
      upperLevel,
      "medium",
    ],
    ["Bedroom 2", "secondary bedroom", "private", 0.11, upperLevel, "medium"],
    [
      "Bedroom 3 or study",
      "flexible bedroom or study",
      "private",
      0.09,
      upperLevel,
      "medium",
    ],
    ["Bathroom", "family bathroom", "service", 0.05, upperLevel, "low"],
    [
      "Upper circulation and store",
      "landing and storage",
      "semi_public",
      0.1,
      upperLevel,
      "medium",
    ],
  ];
  const template =
    brief.building_type === "community" ? communityTemplate : dwellingTemplate;

  return template.map(
    ([name, fn, zone, ratio, levelIndex, daylight], index) => ({
      space_id: createStableId("space", brief.project_name, name, index),
      name,
      function: fn,
      zone,
      target_area_m2: round(target * ratio, 2),
      min_area_m2: round(target * ratio * 0.85, 2),
      max_area_m2: round(target * ratio * 1.15, 2),
      target_level: levelName(levelIndex),
      target_level_index: levelIndex,
      actual_level_id: `level-${levelIndex}`,
      required_daylight: daylight,
      acoustic_privacy: zone === "private" ? "high" : "medium",
      accessible: true,
      adjacency_tags:
        zone === "service"
          ? ["service"]
          : levelIndex === 0
            ? ["arrival"]
            : ["quiet"],
      qa_status: "unplaced",
    }),
  );
}

function buildProgramme({ brief, programSpaces = [] } = {}) {
  const spaces =
    normalizeInputProgramSpaces(programSpaces, brief).length > 0
      ? normalizeInputProgramSpaces(programSpaces, brief)
      : buildTemplateProgramSpaces(brief);
  const targetTotal = spaces.reduce(
    (sum, space) => sum + Number(space.target_area_m2 || 0),
    0,
  );
  const circulationArea = spaces
    .filter((space) => space.name.toLowerCase().includes("circulation"))
    .reduce((sum, space) => sum + Number(space.target_area_m2 || 0), 0);

  return {
    programme_id: createStableId("programme", brief.project_name, targetTotal),
    source_brief_hash: computeCDSHashSync(brief),
    spaces,
    adjacency_requirements: [
      {
        requirement_id: createStableId(
          "adjacency",
          brief.project_name,
          "arrival",
        ),
        from_tags: ["arrival"],
        to_tags: ["service"],
        priority: "medium",
      },
    ],
    area_summary: {
      net_area_m2: round(targetTotal - circulationArea, 2),
      circulation_area_m2: round(circulationArea, 2),
      gross_internal_area_m2: round(targetTotal, 2),
      efficiency_ratio: round(
        (targetTotal - circulationArea) / Math.max(1, targetTotal),
        3,
      ),
    },
    locked_by_user: Array.isArray(programSpaces) && programSpaces.length > 0,
  };
}

function polygonFromGeoJson(geojson) {
  const coordinates = geojson?.coordinates?.[0];
  if (!Array.isArray(coordinates)) {
    return [];
  }
  return coordinates
    .map((point) =>
      Array.isArray(point)
        ? { lat: Number(point[1]), lng: Number(point[0]) }
        : null,
    )
    .filter(
      (point) =>
        point && Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );
}

function buildFallbackSitePolygon(areaM2) {
  const width = Math.max(18, Math.sqrt(areaM2 * 1.35));
  const depth = Math.max(16, areaM2 / width);
  return rectangleToPolygon(0, 0, width, depth);
}

function insetRectFromBbox(bbox, inset = 2) {
  const width = Math.max(8, Number(bbox.width || 0) - inset * 2);
  const height = Math.max(8, Number(bbox.height || 0) - inset * 2);
  return rectangleToPolygon(
    Number(bbox.min_x || 0) + inset,
    Number(bbox.min_y || 0) + inset,
    width,
    height,
  );
}

function buildSiteContext({ brief, sitePolygon = [], siteMetrics = {} } = {}) {
  const geoBoundary =
    Array.isArray(sitePolygon) && sitePolygon.length >= 3
      ? sitePolygon
      : polygonFromGeoJson(brief.site_input.boundary_geojson);
  const hasGeoBoundary =
    geoBoundary.length >= 3 &&
    Number.isFinite(Number(geoBoundary[0]?.lat)) &&
    Number.isFinite(Number(geoBoundary[0]?.lng));
  const origin = hasGeoBoundary
    ? computeGeoCentroid(geoBoundary)
    : { lat: brief.site_input.lat, lng: brief.site_input.lon };
  const localBoundary = hasGeoBoundary
    ? polygonToLocalXY(geoBoundary, origin).map((point) => ({
        x: roundMetric(point.x),
        y: roundMetric(point.y),
      }))
    : buildFallbackSitePolygon(Math.max(brief.target_gia_m2 * 2.2, 320));
  const boundaryBbox = buildBoundingBoxFromPolygon(localBoundary);
  const buildablePolygon = insetRectFromBbox(boundaryBbox, 2);
  const areaM2 =
    Number(siteMetrics.areaM2 || 0) ||
    computePolygonArea(localBoundary) ||
    Math.max(brief.target_gia_m2 * 2.2, 320);

  return {
    site_id: createStableId("site", brief.project_name, origin.lat, origin.lng),
    address_normalised: brief.site_input.address || null,
    lat: round(origin.lat, 6),
    lon: round(origin.lng ?? origin.lon, 6),
    boundary: brief.site_input.boundary_geojson || null,
    local_boundary_polygon: localBoundary,
    buildable_polygon: buildablePolygon,
    north_angle_degrees: Number(siteMetrics.orientationDeg || 0),
    area_m2: round(areaM2, 2),
    access_edges: [
      {
        edge_id: "street-edge-primary",
        label: "Assumed primary street edge",
        source: hasGeoBoundary ? "site_polygon" : "fallback",
      },
    ],
    adjacent_roads: [],
    neighbouring_buildings: [],
    context_height_stats: {
      source: "fallback_context_pack",
    },
    flood_risk: {
      status: "unknown",
      source: "not_configured",
    },
    heritage_flags: [],
    planning_policy_refs: [],
    data_quality: [
      {
        code: hasGeoBoundary
          ? "SITE_BOUNDARY_PROVIDED"
          : "SITE_BOUNDARY_FALLBACK",
        severity: hasGeoBoundary ? "info" : "warning",
        message: hasGeoBoundary
          ? "Site boundary was supplied by the request."
          : "No authoritative site boundary was supplied; deterministic fallback boundary used.",
      },
    ],
  };
}

function buildClimatePack(brief, site) {
  const overheatingRisk =
    brief.building_type === "community" || Number(brief.target_storeys || 1) > 1
      ? "medium"
      : "low";
  return {
    lat: site.lat,
    lon: site.lon,
    weather_source: "fallback",
    weather_file_asset_id: null,
    climate_projection_refs: [
      "UKCP18 reference required before production use",
    ],
    sun_path: {
      orientation_note:
        "Prioritise controlled south/east daylight and avoid unshaded west glazing.",
      source: "deterministic_fallback",
    },
    wind: {
      exposure: "unknown",
      source: "fallback",
    },
    rainfall: {
      exposure: "uk_temperate_assumption",
      source: "fallback",
    },
    overheating: {
      risk_level: overheatingRisk,
      part_o_required: brief.building_type === "dwelling",
      tm59_recommended: brief.building_type === "dwelling",
      key_drivers: ["urban infill uncertainty", "glazing ratio to be verified"],
      mitigation_moves: [
        "external shading",
        "cross ventilation",
        "high-performance envelope",
      ],
    },
    passive_design_moves: [
      "Orient main occupied rooms toward controlled daylight.",
      "Use opening strategy and shading as geometry constraints, not caption-only claims.",
    ],
    material_weathering_notes: [
      "Select robust UK external materials and detail exposed edges for rain.",
    ],
    data_quality: [
      {
        code: "CLIMATE_PACK_FALLBACK",
        severity: "warning",
        message: "No live weather source was used in this vertical slice.",
      },
    ],
  };
}

function buildRegulationPack(brief) {
  const applicableParts =
    brief.building_type === "dwelling"
      ? ["A", "B", "F", "K", "L", "M", "O", "Q", "R", "S"]
      : ["A", "B", "F", "K", "L", "M", "Regulation 7"];
  return {
    jurisdiction: "england",
    building_type: brief.building_type,
    riba_stage: "2",
    source_documents: [
      {
        source_document_id: "govuk-approved-documents",
        title: "GOV.UK Approved Documents collection",
        url: "https://www.gov.uk/government/collections/approved-documents",
        retrieved_at: null,
      },
    ],
    applicable_parts: applicableParts.map((part) => ({
      part,
      status: "precheck_required",
    })),
    precheck_results: applicableParts.map((part) => ({
      check_id: `approved-doc-${String(part)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`,
      title: `Approved Document ${part} early-stage flag`,
      source_document_id: "govuk-approved-documents",
      source_url:
        "https://www.gov.uk/government/collections/approved-documents",
      severity: "needs_consultant",
      status: "manual_review",
      applies_to_element_ids: [],
      summary:
        "Early-stage design flag only; no certified compliance claim is made.",
      recommended_action:
        "Review with the relevant qualified consultant before relying on the design.",
    })),
    limitations: [PROFESSIONAL_REVIEW_DISCLAIMER],
    last_checked_at: null,
  };
}

function buildLocalStylePack(brief, site, climate) {
  const materialPreferences = brief.user_intent.material_preferences;
  const palette = materialPreferences.length
    ? materialPreferences
    : brief.building_type === "community"
      ? ["warm brick", "timber lining", "standing seam metal"]
      : ["brick", "timber", "clay tile"];
  return {
    style_pack_id: createStableId("local-style", brief.project_name, palette),
    primary_style: brief.user_intent.style_keywords.join(", "),
    material_palette: palette,
    climate_notes: climate.material_weathering_notes,
    local_blend_strength: brief.user_intent.local_blend_strength,
    data_quality: site.data_quality,
  };
}

function groupSpacesByLevel(spaces, levelCount) {
  const groups = Object.fromEntries(
    Array.from({ length: levelCount }, (_, index) => [index, []]),
  );
  spaces.forEach((space) => {
    const levelIndex = Math.max(
      0,
      Math.min(
        levelCount - 1,
        Number.parseInt(space.target_level_index ?? 0, 10) || 0,
      ),
    );
    groups[levelIndex].push(space);
  });
  return groups;
}

function balanceBands(spaces = []) {
  const sorted = [...spaces].sort(
    (left, right) =>
      Number(right.target_area_m2 || 0) - Number(left.target_area_m2 || 0),
  );
  const bands = [
    { spaces: [], area: 0 },
    { spaces: [], area: 0 },
  ];
  sorted.forEach((space) => {
    const targetBand = bands[0].area <= bands[1].area ? bands[0] : bands[1];
    targetBand.spaces.push(space);
    targetBand.area += Number(space.target_area_m2 || 0);
  });
  return bands.filter((band) => band.spaces.length > 0);
}

function addRoomWallsAndOpenings({
  room,
  levelId,
  footprintBbox,
  walls,
  doors,
  windows,
}) {
  const polygon = room.polygon;
  const roomBbox = buildBoundingBoxFromPolygon(polygon);
  const edges = [
    [polygon[0], polygon[1], "south"],
    [polygon[1], polygon[2], "east"],
    [polygon[2], polygon[3], "north"],
    [polygon[3], polygon[0], "west"],
  ];
  const wallIds = [];
  const tolerance = 0.01;
  edges.forEach(([start, end, side], index) => {
    const exterior =
      Math.abs(start.y - footprintBbox.min_y) < tolerance &&
      Math.abs(end.y - footprintBbox.min_y) < tolerance
        ? true
        : Math.abs(start.y - footprintBbox.max_y) < tolerance &&
            Math.abs(end.y - footprintBbox.max_y) < tolerance
          ? true
          : Math.abs(start.x - footprintBbox.min_x) < tolerance &&
              Math.abs(end.x - footprintBbox.min_x) < tolerance
            ? true
            : Math.abs(start.x - footprintBbox.max_x) < tolerance &&
              Math.abs(end.x - footprintBbox.max_x) < tolerance;
    const wallId = createStableId("wall", room.id, side, index);
    wallIds.push(wallId);
    walls.push({
      id: wallId,
      level_id: levelId,
      room_ids: [room.id],
      start,
      end,
      thickness_m: exterior ? 0.24 : 0.14,
      exterior,
      orientation: side,
      metadata: { side },
    });
  });

  const doorWallId = wallIds[0];
  doors.push({
    id: createStableId("door", room.id),
    level_id: levelId,
    wall_id: doorWallId,
    room_ids: [room.id],
    width_m: room.name.toLowerCase().includes("entrance") ? 1.1 : 0.9,
    position: {
      x: round((roomBbox.min_x + roomBbox.max_x) / 2),
      y: round(roomBbox.min_y),
    },
    kind: room.name.toLowerCase().includes("entrance")
      ? "main_entrance"
      : "door",
  });

  const exteriorWall = walls.find(
    (wall) => wall.room_ids?.includes(room.id) && wall.exterior === true,
  );
  if (exteriorWall) {
    windows.push({
      id: createStableId("window", room.id, exteriorWall.id),
      level_id: levelId,
      wall_id: exteriorWall.id,
      room_ids: [room.id],
      width_m: Math.max(0.9, Math.min(2.4, Number(roomBbox.width || 2) * 0.35)),
      sill_height_m: 0.85,
      head_height_m: 2.2,
      position: {
        x: round((roomBbox.min_x + roomBbox.max_x) / 2),
        y: round((roomBbox.min_y + roomBbox.max_y) / 2),
      },
      kind: "window",
    });
  }

  return wallIds;
}

function layoutRoomsForLevel({
  spaces,
  levelIndex,
  footprint,
  footprintBbox,
  walls,
  doors,
  windows,
}) {
  const levelId = `level-${levelIndex}`;
  const rooms = [];
  const bands = balanceBands(spaces);
  const targetArea = bands.reduce((sum, band) => sum + band.area, 0);
  const totalDepth = Math.max(1, Number(footprintBbox.height || 0));
  let cursorY = Number(footprintBbox.min_y || 0);

  bands.forEach((band, bandIndex) => {
    const bandDepth =
      bandIndex === bands.length - 1
        ? Number(footprintBbox.max_y || 0) - cursorY
        : totalDepth * (band.area / Math.max(1, targetArea));
    let cursorX = Number(footprintBbox.min_x || 0);
    band.spaces.forEach((space, index) => {
      const roomWidth =
        index === band.spaces.length - 1
          ? Number(footprintBbox.max_x || 0) - cursorX
          : Number(footprintBbox.width || 0) *
            (Number(space.target_area_m2 || 0) / Math.max(1, band.area));
      const polygon = rectangleToPolygon(
        cursorX,
        cursorY,
        roomWidth,
        bandDepth,
      );
      const room = {
        id: space.space_id,
        name: space.name,
        type: space.function,
        program_type: space.function,
        level_id: levelId,
        polygon,
        actual_area_m2: computePolygonArea(polygon),
        target_area_m2: space.target_area_m2,
        zone: space.zone,
        requires_daylight: space.required_daylight !== "low",
        provenance: {
          source: "project_graph_vertical_slice",
          programme_space_id: space.space_id,
        },
      };
      room.wall_ids = addRoomWallsAndOpenings({
        room,
        levelId,
        footprintBbox,
        walls,
        doors,
        windows,
      });
      rooms.push(room);
      cursorX += roomWidth;
    });
    cursorY += bandDepth;
  });

  const stair =
    levelIndex === 0 && bands.length > 0
      ? {
          id: createStableId("stair", levelId, footprint),
          level_id: levelId,
          type: "straight_run",
          polygon: rectangleToPolygon(
            Number(footprintBbox.max_x || 0) -
              Math.min(2.2, footprintBbox.width * 0.14),
            Number(footprintBbox.min_y || 0) +
              Math.min(2, footprintBbox.height * 0.12),
            Math.min(2.2, footprintBbox.width * 0.14),
            Math.min(4.2, footprintBbox.height * 0.38),
          ),
          connects_to_level: `level-${levelIndex + 1}`,
        }
      : null;

  return { rooms, stair };
}

function buildProjectGeometryFromProgramme({
  brief,
  site,
  programme,
  localStyle,
}) {
  const levelCount = Number(brief.target_storeys || 1);
  const groups = groupSpacesByLevel(programme.spaces, levelCount);
  const levelAreas = Object.values(groups).map((spaces) =>
    spaces.reduce((sum, space) => sum + Number(space.target_area_m2 || 0), 0),
  );
  const footprintArea = Math.max(
    24,
    ...levelAreas,
    Number(brief.target_gia_m2 || 120) / levelCount,
  );
  const buildableBbox = buildBoundingBoxFromPolygon(site.buildable_polygon);
  const aspect = brief.building_type === "community" ? 1.45 : 1.25;
  let footprintWidth = Math.sqrt(footprintArea * aspect);
  let footprintDepth = footprintArea / Math.max(1, footprintWidth);
  if (footprintWidth > buildableBbox.width) {
    footprintWidth = Math.max(8, buildableBbox.width);
    footprintDepth = footprintArea / footprintWidth;
  }
  if (footprintDepth > buildableBbox.height) {
    footprintDepth = Math.max(8, buildableBbox.height);
    footprintWidth = footprintArea / footprintDepth;
  }
  const footprintX =
    Number(buildableBbox.min_x || 0) +
    Math.max(0, (Number(buildableBbox.width || 0) - footprintWidth) / 2);
  const footprintY =
    Number(buildableBbox.min_y || 0) +
    Math.max(0, (Number(buildableBbox.height || 0) - footprintDepth) / 2);
  const footprint = rectangleToPolygon(
    footprintX,
    footprintY,
    footprintWidth,
    footprintDepth,
  );
  const footprintBbox = buildBoundingBoxFromPolygon(footprint);
  const levels = [];
  const rooms = [];
  const walls = [];
  const doors = [];
  const windows = [];
  const stairs = [];
  const footprints = [];

  for (let levelIndex = 0; levelIndex < levelCount; levelIndex += 1) {
    const levelId = `level-${levelIndex}`;
    const levelRooms = groups[levelIndex] || [];
    const layout = layoutRoomsForLevel({
      spaces: levelRooms,
      levelIndex,
      footprint,
      footprintBbox,
      walls,
      doors,
      windows,
    });
    rooms.push(...layout.rooms);
    if (layout.stair && levelIndex + 1 < levelCount) {
      stairs.push(layout.stair);
    }
    const footprintId = createStableId("footprint", levelId, footprint);
    footprints.push({
      id: footprintId,
      level_id: levelId,
      polygon: footprint,
    });
    levels.push({
      id: levelId,
      name: `${levelName(levelIndex)} Floor`,
      level_number: levelIndex,
      elevation_m: round(levelIndex * 3.2),
      height_m: 3.2,
      room_ids: layout.rooms.map((room) => room.id),
      wall_ids: walls
        .filter((wall) => wall.level_id === levelId)
        .map((wall) => wall.id),
      door_ids: doors
        .filter((door) => door.level_id === levelId)
        .map((door) => door.id),
      window_ids: windows
        .filter((window) => window.level_id === levelId)
        .map((window) => window.id),
      stair_ids: stairs
        .filter((stair) => stair.level_id === levelId)
        .map((stair) => stair.id),
      footprint_id: footprintId,
    });
  }

  const ridgeY = round((footprintBbox.min_y + footprintBbox.max_y) / 2);
  const projectGeometry = {
    schema_version: CANONICAL_PROJECT_GEOMETRY_VERSION,
    project_id: createStableId("project", brief.project_name),
    site: {
      boundary_polygon: site.local_boundary_polygon,
      buildable_polygon: site.buildable_polygon,
      area_m2: site.area_m2,
      orientation_deg: site.north_angle_degrees,
      setbacks: { front: 2, rear: 2, left: 2, right: 2 },
    },
    levels,
    rooms,
    walls,
    doors,
    windows,
    stairs,
    circulation: [],
    columns: [],
    beams: [],
    slabs: [],
    roof_primitives: [
      {
        id: createStableId("roof-plane", footprint),
        primitive_family: "roof_plane",
        type: brief.building_type === "community" ? "low_pitch_roof" : "gable",
        support_mode: "explicit_generated",
        polygon: footprint,
        slope_deg: brief.building_type === "community" ? 8 : 35,
        eave_depth_m: 0.35,
      },
      {
        id: createStableId("roof-ridge", footprint),
        primitive_family: "ridge",
        type: "ridge",
        start: { x: footprintBbox.min_x, y: ridgeY },
        end: { x: footprintBbox.max_x, y: ridgeY },
        ridge_height_m: round(levelCount * 3.2 + 1.4),
      },
    ],
    foundations: [],
    base_conditions: [],
    roof: {
      type: brief.building_type === "community" ? "low_pitch" : "gable",
      polygon: footprint,
    },
    footprints,
    elevations: [],
    sections: [],
    annotations: [],
    metadata: {
      units: "meters",
      deterministic: true,
      requested_building_type: brief.building_type,
      source: "project_graph_vertical_slice",
      style_dna: {
        localStyle: localStyle.primary_style,
        materials: localStyle.material_palette,
        roof_language:
          brief.building_type === "community"
            ? "civic low pitch"
            : "domestic gable",
      },
      canonical_construction_truth: {
        roof: {
          support_mode: "explicit_generated",
          primitive_count: 2,
          plane_count: 1,
          ridge_count: 1,
        },
      },
    },
    provenance: {
      source: "project_graph_vertical_slice",
      generator: PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
      strategy: "projectgraph-first",
    },
  };

  return projectGeometry;
}

function syncProgrammeActuals(programme, projectGeometry) {
  const actualBySpace = new Map(
    projectGeometry.rooms.map((room) => [room.id, room.actual_area_m2]),
  );
  const spaces = programme.spaces.map((space) => ({
    ...space,
    actual_area_m2: round(actualBySpace.get(space.space_id) || 0, 2),
    actual_level_id:
      space.actual_level_id || `level-${space.target_level_index || 0}`,
    polygon_ref: space.space_id,
    mesh_ref: space.space_id,
    qa_status: actualBySpace.has(space.space_id) ? "placed" : "unplaced",
  }));
  const actualTotal = spaces.reduce(
    (sum, space) => sum + Number(space.actual_area_m2 || 0),
    0,
  );
  const circulationArea = spaces
    .filter((space) => space.name.toLowerCase().includes("circulation"))
    .reduce((sum, space) => sum + Number(space.actual_area_m2 || 0), 0);

  return {
    ...programme,
    spaces,
    area_summary: {
      net_area_m2: round(actualTotal - circulationArea, 2),
      circulation_area_m2: round(circulationArea, 2),
      gross_internal_area_m2: round(actualTotal, 2),
      efficiency_ratio: round(
        (actualTotal - circulationArea) / Math.max(1, actualTotal),
        3,
      ),
    },
  };
}

function buildSelectedDesign(compiledProject, programme) {
  const levelsById = new Map(
    (compiledProject.levels || []).map((level) => [level.id, level]),
  );
  const spaces = (compiledProject.rooms || []).map((room) => {
    const level = levelsById.get(room.levelId) || {};
    return {
      space_id: room.sourceId || room.id,
      compiled_room_id: room.id,
      level_id: room.levelId,
      boundary_polygon_m: room.polygon || [],
      floor_z_m: Number(level.elevation_m || level.bottom_m || 0),
      ceiling_z_m: Number(level.top_m || 0),
      area_m2: room.actual_area_m2,
      volume_m3: round(
        Number(room.actual_area_m2 || 0) * Number(level.height_m || 3.2),
      ),
      doors: (compiledProject.openings || [])
        .filter(
          (opening) =>
            opening.type === "door" &&
            (opening.roomIds || []).includes(room.id),
        )
        .map((opening) => opening.id),
      windows: (compiledProject.openings || [])
        .filter(
          (opening) =>
            opening.type === "window" &&
            (opening.roomIds || []).includes(room.id),
        )
        .map((opening) => opening.id),
      material_zone: room.zone || null,
    };
  });

  return {
    building_id: createStableId("building", compiledProject.geometryHash),
    source_programme_id: programme.programme_id,
    levels: cloneData(compiledProject.levels || []),
    grids: [],
    spaces,
    elements: [
      ...(compiledProject.walls || []).map((wall) => ({
        element_id: wall.id,
        type: "wall",
        level_ids: [wall.levelId].filter(Boolean),
        geometry_ref: wall.id,
        material_id: wall.exterior ? "external-wall" : "internal-partition",
        fire_relevance: wall.exterior === true,
        thermal_relevance: wall.exterior === true,
      })),
      ...(compiledProject.slabs || []).map((slab) => ({
        element_id: slab.id,
        type: "slab",
        level_ids: [slab.levelId].filter(Boolean),
        geometry_ref: slab.id,
        material_id: "floor-slab",
      })),
      ...(compiledProject.roof?.planes || []).map((plane) => ({
        element_id: plane.id,
        type: "roof",
        level_ids: (compiledProject.levels || [])
          .slice(-1)
          .map((level) => level.id),
        geometry_ref: plane.id,
        material_id: "roof-finish",
        thermal_relevance: true,
      })),
    ],
    openings: cloneData(compiledProject.openings || []),
    stairs: cloneData(compiledProject.stairs || []),
    circulation: [],
    materials: [
      {
        material_id: "external-wall",
        label: compiledProject.materials?.primary || "warm brick",
      },
      {
        material_id: "internal-partition",
        label: "painted timber-lined partition",
      },
      {
        material_id: "roof-finish",
        label: compiledProject.materials?.roof?.primary || "standing seam roof",
      },
    ],
    site_landscape: [],
    model_bounds_m: cloneData(compiledProject.envelope || {}),
    exported_assets: [],
  };
}

function drawingTypeForPanel(panelType) {
  if (panelType.startsWith("floor_plan_")) return "floor_plan";
  if (panelType.startsWith("section_")) return "section";
  if (panelType.startsWith("elevation_")) return "elevation";
  return "diagram";
}

function buildDrawingSet(compiledProject) {
  const technicalBuild = buildCompiledProjectTechnicalPanels(compiledProject);
  const technicalPanels = technicalBuild.technicalPanels || {};
  const drawingViews = Object.entries(technicalPanels).map(
    ([panelType, panel]) => {
      const drawingType = drawingTypeForPanel(panelType);
      const assetId = createStableId("asset-svg", panelType, panel.svgHash);
      return {
        drawing_id: createStableId(
          "drawing",
          panelType,
          compiledProject.geometryHash,
        ),
        type: drawingType,
        panel_type: panelType,
        source_model_hash: compiledProject.geometryHash,
        source_project_graph_id: null,
        scale:
          drawingType === "floor_plan"
            ? "1:100"
            : drawingType === "section"
              ? "1:100"
              : "1:200",
        level_id: panelType.startsWith("floor_plan_")
          ? panel.technicalQualityMetadata?.level_id || null
          : null,
        cut_plane: panelType.startsWith("section_")
          ? {
              section_type:
                panelType === "section_BB" ? "transverse" : "longitudinal",
              source: "compiled_project_section_cuts",
            }
          : null,
        camera: null,
        layers: [
          {
            layer_id: `${panelType}-geometry`,
            source: "compiled_project",
            entity_ids: [
              ...(compiledProject.rooms || []).map(
                (room) => room.sourceId || room.id,
              ),
              ...(compiledProject.walls || []).map((wall) => wall.id),
              ...(compiledProject.openings || []).map((opening) => opening.id),
            ],
          },
        ],
        annotations: [],
        exported_asset_ids: [assetId],
        svgHash: panel.svgHash,
        status: panel.status || "ready",
      };
    },
  );

  return {
    drawingSet: {
      model_version_id: `model-${compiledProject.geometryHash.slice(0, 12)}`,
      drawings: drawingViews,
    },
    drawingArtifacts: Object.fromEntries(
      Object.entries(technicalPanels).map(([panelType, panel]) => {
        const assetId = createStableId("asset-svg", panelType, panel.svgHash);
        return [
          assetId,
          {
            asset_id: assetId,
            asset_type: "drawing_svg",
            panel_type: panelType,
            source_model_hash: compiledProject.geometryHash,
            svgHash: panel.svgHash,
            width: panel.width,
            height: panel.height,
            svgString: panel.svgString,
          },
        ];
      }),
    ),
    technicalBuild,
  };
}

function build3DProjection(compiledProject) {
  const assetId = createStableId(
    "asset-3d-scene",
    compiledProject.geometryHash,
  );
  return {
    asset_id: assetId,
    asset_type: "deterministic_3d_scene_json",
    source_model_hash: compiledProject.geometryHash,
    source: "compiled_project",
    geometryHash: compiledProject.geometryHash,
    scene: {
      levels: (compiledProject.levels || []).map((level) => ({
        id: level.id,
        elevation_m: level.elevation_m,
        height_m: level.height_m,
        footprint: level.footprint,
      })),
      room_volumes: (compiledProject.rooms || []).map((room) => {
        const level = (compiledProject.levels || []).find(
          (entry) => entry.id === room.levelId,
        );
        return {
          id: room.sourceId || room.id,
          compiled_room_id: room.id,
          level_id: room.levelId,
          polygon: room.polygon,
          z_min_m: Number(level?.elevation_m || 0),
          z_max_m: Number(level?.top_m || level?.height_m || 3.2),
          material_zone: room.zone || "unspecified",
        };
      }),
      walls: (compiledProject.walls || []).map((wall) => ({
        id: wall.id,
        level_id: wall.levelId,
        start: wall.start,
        end: wall.end,
        height_m:
          (compiledProject.levels || []).find(
            (level) => level.id === wall.levelId,
          )?.height_m || 3.2,
        thickness_m: wall.thickness_m,
      })),
      openings: cloneData(compiledProject.openings || []),
      roof: cloneData(compiledProject.roof || {}),
    },
  };
}

function buildSheetSvg({
  projectGraphId,
  brief,
  geometryHash,
  drawingViews,
  qaStatus,
}) {
  const viewRows = drawingViews
    .slice(0, 7)
    .map(
      (view, index) =>
        `<text x="36" y="${150 + index * 18}" font-size="8">${escapeXml(view.panel_type)} ${escapeXml(view.scale)}</text>`,
    )
    .join("");
  const styleText = escapeXml(brief.user_intent.style_keywords.join(", "));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="841mm" height="594mm" viewBox="0 0 841 594" data-template="riba_stage2_concept_a1_landscape" data-project-graph-id="${escapeXml(projectGraphId)}" data-source-model-hash="${escapeXml(geometryHash)}">
  <rect width="841" height="594" fill="#f8f5ed"/>
  <rect x="24" y="24" width="793" height="546" fill="none" stroke="#101820" stroke-width="1.2"/>
  <text x="36" y="54" font-size="18" font-family="Arial, sans-serif" font-weight="700">${escapeXml(brief.project_name)}</text>
  <text x="36" y="76" font-size="9" font-family="Arial, sans-serif">RIBA Stage 2 / ProjectGraph vertical slice / Geometry hash ${escapeXml(geometryHash.slice(0, 12))}</text>
  <rect x="30" y="104" width="250" height="170" fill="#fffdf7" stroke="#101820" stroke-width="0.6"/>
  <text x="36" y="126" font-size="10" font-family="Arial, sans-serif" font-weight="700">2D projections from ProjectGraph</text>
  ${viewRows}
  <rect x="300" y="104" width="240" height="170" fill="#eef2ef" stroke="#101820" stroke-width="0.6"/>
  <text x="312" y="126" font-size="10" font-family="Arial, sans-serif" font-weight="700">3D massing scene</text>
  <text x="312" y="148" font-size="8" font-family="Arial, sans-serif">Same source_model_hash as all drawings.</text>
  <text x="312" y="166" font-size="8" font-family="Arial, sans-serif">Geometry controls silhouette, rooms, openings and roof.</text>
  <rect x="560" y="104" width="235" height="170" fill="#fffdf7" stroke="#101820" stroke-width="0.6"/>
  <text x="572" y="126" font-size="10" font-family="Arial, sans-serif" font-weight="700">Programme and QA</text>
  <text x="572" y="148" font-size="8" font-family="Arial, sans-serif">Status: ${escapeXml(qaStatus || "pending")}</text>
  <text x="572" y="166" font-size="8" font-family="Arial, sans-serif">Target GIA: ${escapeXml(brief.target_gia_m2)} m2</text>
  <rect x="30" y="300" width="365" height="170" fill="#fffdf7" stroke="#101820" stroke-width="0.6"/>
  <text x="42" y="322" font-size="10" font-family="Arial, sans-serif" font-weight="700">Climate, site and local material logic</text>
  <text x="42" y="344" font-size="8" font-family="Arial, sans-serif">${styleText}</text>
  <rect x="420" y="300" width="375" height="170" fill="#fffdf7" stroke="#101820" stroke-width="0.6"/>
  <text x="432" y="322" font-size="10" font-family="Arial, sans-serif" font-weight="700">Regulation pre-check</text>
  <text x="432" y="344" font-size="8" font-family="Arial, sans-serif">${escapeXml(PROFESSIONAL_REVIEW_DISCLAIMER)}</text>
  <text x="36" y="545" font-size="7" font-family="Arial, sans-serif">All sheet content references ProjectGraph ${escapeXml(projectGraphId)} and source_model_hash ${escapeXml(geometryHash)}.</text>
</svg>`;
}

function buildA1Sheet({
  projectGraphId,
  brief,
  drawingSet,
  scene3d,
  geometryHash,
}) {
  const drawingIds = drawingSet.drawings.map((drawing) => drawing.drawing_id);
  const assetIds = [
    ...drawingSet.drawings.flatMap((drawing) => drawing.exported_asset_ids),
    scene3d.asset_id,
  ];
  const sheetId = createStableId("sheet-a1", projectGraphId, geometryHash);
  const svgString = buildSheetSvg({
    projectGraphId,
    brief,
    geometryHash,
    drawingViews: drawingSet.drawings,
    qaStatus: "pending",
  });
  const svgHash = computeCDSHashSync({ svg: svgString });
  const sheetAssetId = createStableId("asset-a1-svg", sheetId, svgHash);

  return {
    sheetSet: {
      sheets: [
        {
          sheet_id: sheetId,
          sheet_size: "A1",
          orientation: "landscape",
          template_id: "riba_stage2_concept_a1_landscape",
          drawing_ids: drawingIds,
          asset_ids: [...assetIds, sheetAssetId],
          title_block: {
            project_name: brief.project_name,
            drawing_number: "A1-01",
            revision: "P01",
            status: "early_stage_precheck",
            disclaimer: PROFESSIONAL_REVIEW_DISCLAIMER,
          },
          exported_pdf_asset_id: null,
          exported_png_asset_id: null,
          exported_svg_asset_id: sheetAssetId,
        },
      ],
    },
    sheetArtifact: {
      asset_id: sheetAssetId,
      asset_type: "a1_sheet_svg",
      sheet_size_mm: { width: 841, height: 594 },
      orientation: "landscape",
      source_model_hash: geometryHash,
      svgHash,
      svgString,
    },
  };
}

function buildIssue(code, severity, message, details = {}) {
  return { code, severity, message, details };
}

function addCheck(checks, code, passed, details = {}) {
  checks.push({
    code,
    status: passed ? "pass" : "fail",
    details,
  });
}

export function validateProjectGraphVerticalSlice({
  projectGraph,
  artifacts = {},
  targetAreaTolerance = 0.15,
} = {}) {
  const checks = [];
  const issues = [];
  const geometryHash = projectGraph?.selected_design?.source_model_hash;
  const programmeIds = new Set(
    (projectGraph?.programme?.spaces || []).map((space) => space.space_id),
  );
  const modelIds = new Set(
    (projectGraph?.selected_design?.spaces || []).map(
      (space) => space.space_id,
    ),
  );
  const missingModelSpaces = [...programmeIds].filter(
    (id) => !modelIds.has(id),
  );
  addCheck(
    checks,
    "PROGRAMME_SPACES_IN_MODEL",
    missingModelSpaces.length === 0,
    {
      missingModelSpaces,
    },
  );
  if (missingModelSpaces.length) {
    issues.push(
      buildIssue(
        "PROGRAMME_SPACE_MISSING_IN_MODEL",
        "error",
        "Programme space is missing from selected_design.",
        { missingModelSpaces },
      ),
    );
  }

  const drawingHashes = [
    ...new Set(
      (projectGraph?.drawings?.drawings || []).map(
        (drawing) => drawing.source_model_hash,
      ),
    ),
  ];
  const drawingHashMatch =
    drawingHashes.length === 1 && drawingHashes[0] === geometryHash;
  addCheck(checks, "DRAWINGS_SHARE_MODEL_HASH", drawingHashMatch, {
    drawingHashes,
    geometryHash,
  });
  if (!drawingHashMatch) {
    issues.push(
      buildIssue(
        "SOURCE_MODEL_HASH_MISMATCH_2D",
        "error",
        "2D drawings do not all reference the selected design source_model_hash.",
        { drawingHashes, geometryHash },
      ),
    );
  }

  const sceneHash = artifacts.scene3d?.source_model_hash || null;
  const sceneHashMatch = Boolean(sceneHash) && sceneHash === geometryHash;
  addCheck(checks, "THREE_D_SCENE_SHARES_MODEL_HASH", sceneHashMatch, {
    sceneHash,
    geometryHash,
  });
  if (!sceneHashMatch) {
    issues.push(
      buildIssue(
        "SOURCE_MODEL_HASH_MISMATCH_3D",
        "error",
        "3D scene does not reference the selected design source_model_hash.",
        { sceneHash, geometryHash },
      ),
    );
  }

  const actualGia = Number(
    projectGraph?.programme?.area_summary?.gross_internal_area_m2 || 0,
  );
  const targetGia = Number(projectGraph?.brief?.target_gia_m2 || 0);
  const areaDeltaRatio =
    targetGia > 0 ? Math.abs(actualGia - targetGia) / targetGia : 0;
  const areaOk = targetGia > 0 && areaDeltaRatio <= targetAreaTolerance;
  addCheck(checks, "GIA_WITHIN_TOLERANCE", areaOk, {
    actualGia,
    targetGia,
    areaDeltaRatio: round(areaDeltaRatio, 4),
    targetAreaTolerance,
  });
  if (!areaOk) {
    issues.push(
      buildIssue(
        "PROGRAMME_AREA_OUTSIDE_TOLERANCE",
        "error",
        "Actual GIA is outside the configured target tolerance.",
        { actualGia, targetGia, areaDeltaRatio, targetAreaTolerance },
      ),
    );
  }

  const drawingIds = new Set(
    (projectGraph?.drawings?.drawings || []).map(
      (drawing) => drawing.drawing_id,
    ),
  );
  const sheetDrawingIds = (projectGraph?.sheets?.sheets || []).flatMap(
    (sheet) => sheet.drawing_ids || [],
  );
  const missingSheetDrawings = sheetDrawingIds.filter(
    (id) => !drawingIds.has(id),
  );
  addCheck(
    checks,
    "A1_SHEET_REFERENCES_EXISTING_DRAWINGS",
    missingSheetDrawings.length === 0,
    {
      missingSheetDrawings,
    },
  );
  if (missingSheetDrawings.length) {
    issues.push(
      buildIssue(
        "A1_SHEET_REFERENCE_MISSING",
        "error",
        "A1 sheet references drawings that do not exist.",
        { missingSheetDrawings },
      ),
    );
  }

  const sheetArtifactHash = artifacts.a1Sheet?.source_model_hash || null;
  const sheetHashOk =
    Boolean(sheetArtifactHash) && sheetArtifactHash === geometryHash;
  addCheck(checks, "A1_SHEET_SHARES_MODEL_HASH", sheetHashOk, {
    sheetArtifactHash,
    geometryHash,
  });
  if (!sheetHashOk) {
    issues.push(
      buildIssue(
        "A1_SHEET_MODEL_HASH_MISMATCH",
        "error",
        "A1 sheet artifact does not reference the selected design source_model_hash.",
        { sheetArtifactHash, geometryHash },
      ),
    );
  }

  const errorCount = issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const score = Math.max(0, 100 - errorCount * 18 - warningCount * 6);

  return {
    schema_version: "project-graph-qa-report-v1",
    status: errorCount > 0 ? "fail" : "pass",
    score,
    source_model_hash: geometryHash,
    checks,
    issues,
    disclaimer: PROFESSIONAL_REVIEW_DISCLAIMER,
  };
}

function buildProjectGraph({
  brief,
  site,
  climate,
  regulations,
  localStyle,
  programme,
  selectedDesign,
  drawingSet,
  sheetSet,
  compiledProject,
  modelRegistry,
}) {
  const projectId = createStableId("project-graph", brief.project_name);
  const modelVersionId = `model-${compiledProject.geometryHash.slice(0, 12)}`;
  const graph = {
    schema_version: PROJECT_GRAPH_SCHEMA_VERSION,
    project_id: projectId,
    model_version_id: modelVersionId,
    created_at: null,
    updated_at: null,
    riba_stage_target: "2",
    jurisdiction: "england",
    brief,
    user_intent: brief.user_intent,
    site,
    climate,
    regulations,
    local_style: localStyle,
    programme,
    design_options: [
      {
        option_id: "option-001",
        label: "Deterministic vertical-slice option",
        selected: true,
        source_model_hash: compiledProject.geometryHash,
      },
    ],
    selected_design: {
      ...selectedDesign,
      source_model_hash: compiledProject.geometryHash,
      compiled_project_schema_version: compiledProject.schema_version,
    },
    drawings: drawingSet,
    sheets: sheetSet,
    qa: null,
    provenance: [
      {
        record_id: createStableId("prov", projectId, "brief"),
        source: "user_brief",
        generated_by: "normalizeBrief",
      },
      {
        record_id: createStableId("prov", projectId, "geometry"),
        source: "ProjectGraph",
        generated_by: PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
        geometryHash: compiledProject.geometryHash,
      },
      {
        record_id: createStableId("prov", projectId, "models"),
        source: "env_model_registry",
        generated_by: "modelStepResolver",
        modelRegistry,
      },
    ],
  };

  return {
    ...graph,
    project_graph_hash: computeCDSHashSync({
      ...graph,
      qa: undefined,
    }),
  };
}

export async function buildArchitectureProjectVerticalSlice(input = {}) {
  const brief = normalizeBrief(input);
  const site = buildSiteContext({
    brief,
    sitePolygon: input.sitePolygon || input.site_boundary || [],
    siteMetrics: input.siteMetrics || {},
  });
  const climate = buildClimatePack(brief, site);
  const regulations = buildRegulationPack(brief);
  const localStyle = buildLocalStylePack(brief, site, climate);
  const draftProgramme = buildProgramme({
    brief,
    programSpaces: input.programSpaces || input.programmeSpaces || [],
  });
  const projectGeometry = buildProjectGeometryFromProgramme({
    brief,
    site,
    programme: draftProgramme,
    localStyle,
  });
  const programme = syncProgrammeActuals(draftProgramme, projectGeometry);
  const compiledProject = compileProject({
    projectGeometry,
    masterDNA: {
      projectName: brief.project_name,
      projectID: projectGeometry.project_id,
      styleDNA: projectGeometry.metadata.style_dna,
      rooms: programme.spaces,
    },
    locationData: {
      address: brief.site_input.address,
      coordinates: { lat: site.lat, lng: site.lon },
      climate: { type: climate.weather_source },
      localMaterials: localStyle.material_palette,
    },
  });
  const selectedDesign = buildSelectedDesign(compiledProject, programme);
  const { drawingSet, drawingArtifacts, technicalBuild } =
    buildDrawingSet(compiledProject);
  const scene3d = build3DProjection(compiledProject);
  const modelRegistry = resolveArchitectureModelRegistry({
    steps: [
      "BRIEF",
      "SITE",
      "CLIMATE",
      "REGS",
      "PROGRAMME",
      "PROJECT_GRAPH",
      "DRAWING_2D",
      "MODEL_3D",
      "A1_SHEET",
      "QA",
    ],
  });
  const projectGraphId = createStableId(
    "project-graph",
    brief.project_name,
    compiledProject.geometryHash,
  );
  const drawingSetWithGraph = {
    ...drawingSet,
    drawings: drawingSet.drawings.map((drawing) => ({
      ...drawing,
      source_project_graph_id: projectGraphId,
    })),
  };
  const { sheetSet, sheetArtifact } = buildA1Sheet({
    projectGraphId,
    brief,
    drawingSet: drawingSetWithGraph,
    scene3d,
    geometryHash: compiledProject.geometryHash,
  });
  const initialGraph = buildProjectGraph({
    brief,
    site,
    climate,
    regulations,
    localStyle,
    programme,
    selectedDesign,
    drawingSet: drawingSetWithGraph,
    sheetSet,
    compiledProject,
    modelRegistry,
  });
  const graphWithStableId = {
    ...initialGraph,
    project_id: projectGraphId,
  };
  const artifacts = {
    drawings: drawingArtifacts,
    scene3d,
    a1Sheet: sheetArtifact,
    compiledProject,
    projectGeometry,
    technicalBuild: {
      ok: technicalBuild.ok,
      technicalPanelTypes: technicalBuild.technicalPanelTypes,
      failures: technicalBuild.failures,
    },
  };
  const qa = validateProjectGraphVerticalSlice({
    projectGraph: graphWithStableId,
    artifacts,
  });
  const finalGraph = {
    ...graphWithStableId,
    qa,
  };
  finalGraph.project_graph_hash = computeCDSHashSync(finalGraph);

  return {
    success: qa.status === "pass",
    pipelineVersion: PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
    geometryHash: compiledProject.geometryHash,
    projectGraph: finalGraph,
    artifacts: {
      ...artifacts,
      qaReport: {
        asset_id: createStableId(
          "asset-qa",
          finalGraph.project_id,
          qa.source_model_hash,
        ),
        asset_type: "qa_report_json",
        source_model_hash: qa.source_model_hash,
        qa,
      },
    },
    qa,
    modelRegistry,
  };
}

export default {
  PROJECT_GRAPH_SCHEMA_VERSION,
  PROJECT_GRAPH_VERTICAL_SLICE_VERSION,
  buildArchitectureProjectVerticalSlice,
  validateProjectGraphVerticalSlice,
};
