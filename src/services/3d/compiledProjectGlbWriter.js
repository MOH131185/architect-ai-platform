/**
 * Deterministic GLB writer — Phase 5 (Track 4).
 *
 * Builds a single-file GLB (glTF 2.0 binary container) directly from
 * compiledProject geometry, with NO external glTF library. Hand-rolling
 * the writer is a deliberate choice:
 *   - zero new runtime dependencies (supply chain stays small)
 *   - full control over byte ordering / padding (critical for deterministic
 *     output hashing across CI runs)
 *   - test coverage is trivial: assert the 4-byte magic, validate the JSON
 *     chunk parses, count meshes + accessors, assert geometryHash in Extras
 *
 * SCHEMA — Codex Phase 5 audit blocker #2 corrected. This writer consumes
 * the REAL compiledProjectCompiler output, not the pre-compile project
 * geometry. The key fields:
 *
 *   compiledProject.walls[*].{ levelId, start:{x,y}, end:{x,y}, thickness_m }
 *   compiledProject.openings[*].{ type:"door"|"window", levelId, wallId,
 *                                 position_m, width_m, sill_height_m,
 *                                 head_height_m, height_m }
 *   compiledProject.slabs[*].{ levelId, polygon, thickness_m, elevation_m }
 *   compiledProject.levels[*].{ id, bottom_m, top_m, height_m,
 *                               footprint:{ polygon } }
 *   compiledProject.roof.{ planes, ridges, eaves, hips, valleys,
 *                          parapets, dormers } — each entry has
 *                          { polygon, slope_deg, ridge_height_m,
 *                            eave_depth_m, start, end }
 *
 * AUTHORITY NOTE — ProjectGraph compiled geometry remains the only
 * authority. The GLB is a deterministic projection of that geometry; the
 * `geometryHash` of the compiledProject is written into the GLB root
 * Document name AND into glTF Extras so downstream consumers can cross-
 * verify against the IFC `IfcProject.Description` (Phase 2 wiring), the
 * DXF A-METADATA layer (Phase 6 wiring), and the handoff manifest.
 *
 * Tests live in src/__tests__/services/3d/compiledProjectGlbWriter.test.js
 * (unit) and src/__tests__/services/3d/compiledProjectGlbWriter.live.test.js
 * (live compileProject → GLB integration).
 */

export const GLB_WRITER_VERSION = "compiled-project-glb-writer-v2";
const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
const GLB_VERSION = 2;
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"
const COMPONENT_TYPE_FLOAT = 5126;
const COMPONENT_TYPE_UINT32 = 5125;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;
const PRIMITIVE_MODE_TRIANGLES = 4;
const DEFAULT_WALL_THICKNESS_M = 0.25;
const DEFAULT_SLAB_THICKNESS_M = 0.2;
const DEFAULT_FLOOR_HEIGHT_M = 3.0;
const DEFAULT_DOOR_HEIGHT_M = 2.1;
const DEFAULT_WINDOW_HEIGHT_M = 1.4;
const DEFAULT_WINDOW_SILL_M = 0.9;
const VERTEX_PRECISION_DECIMALS = 6;

function roundFloat(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** VERTEX_PRECISION_DECIMALS;
  return Math.round(numeric * factor) / factor;
}

function hexToRgbaFloat(hex, alpha = 1) {
  const fallback = [0.8, 0.8, 0.8, alpha];
  if (typeof hex !== "string") return fallback;
  const cleaned = hex.replace(/^#/, "").trim();
  if (cleaned.length !== 3 && cleaned.length !== 6) return fallback;
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  if (![r, g, b].every((v) => Number.isFinite(v))) return fallback;
  return [r / 255, g / 255, b / 255, alpha];
}

function pointFromEntry(entry, fallbacks = {}) {
  if (Array.isArray(entry) && entry.length >= 2) {
    return {
      x: Number(entry[0]),
      y: Number(entry[1]),
      z: entry.length >= 3 ? Number(entry[2]) : Number(fallbacks.z || 0),
    };
  }
  if (entry && typeof entry === "object") {
    return {
      x: Number(entry.x ?? fallbacks.x ?? 0),
      y: Number(entry.y ?? fallbacks.y ?? 0),
      z: Number(entry.z ?? fallbacks.z ?? 0),
    };
  }
  return {
    x: Number(fallbacks.x || 0),
    y: Number(fallbacks.y || 0),
    z: Number(fallbacks.z || 0),
  };
}

function buildLevelIndex(levels = []) {
  const byId = new Map();
  for (const level of levels) {
    if (!level || !level.id) continue;
    byId.set(level.id, level);
    if (level.sourceId) byId.set(level.sourceId, level);
  }
  return byId;
}

function resolveLevelEnvelope(levels = [], levelIdLike) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return { baseZ: 0, heightM: DEFAULT_FLOOR_HEIGHT_M };
  }
  const byId = buildLevelIndex(levels);
  if (levelIdLike != null && byId.has(levelIdLike)) {
    const level = byId.get(levelIdLike);
    const baseZ = Number(level.bottom_m) || 0;
    const heightM =
      Number(level.height_m) ||
      Math.max(0, Number(level.top_m) - Number(level.bottom_m)) ||
      DEFAULT_FLOOR_HEIGHT_M;
    return { baseZ, heightM };
  }
  const first = levels[0];
  return {
    baseZ: Number(first?.bottom_m) || 0,
    heightM: Number(first?.height_m) || DEFAULT_FLOOR_HEIGHT_M,
  };
}

function resolveWallLevel(wall) {
  return wall?.levelId ?? wall?.level_id ?? null;
}

function resolveOpeningLevel(opening) {
  return opening?.levelId ?? opening?.level_id ?? null;
}

function resolveOpeningWallId(opening) {
  return opening?.wallId ?? opening?.wall_id ?? null;
}

function resolveSlabLevel(slab) {
  return slab?.levelId ?? slab?.level_id ?? null;
}

function resolveMaterialDNA(compiledProject) {
  return (
    compiledProject?.materialDNA ||
    compiledProject?.material_dna ||
    compiledProject?.materials?.material_dna ||
    compiledProject?.materials?.materialDNA ||
    compiledProject?.metadata?.materialDNA ||
    compiledProject?.metadata?.material_dna ||
    {}
  );
}

function pickMaterialHex(materialDNA, candidates, fallback) {
  for (const path of candidates) {
    let current = materialDNA;
    let found = true;
    for (const key of path) {
      if (current && typeof current === "object" && key in current) {
        current = current[key];
      } else {
        found = false;
        break;
      }
    }
    if (found && typeof current === "string") return current;
    if (
      found &&
      current &&
      typeof current === "object" &&
      typeof current.hex === "string"
    ) {
      return current.hex;
    }
  }
  return fallback;
}

function appendWallMesh(meshes, wall, levels, materialDNA) {
  const start = wall?.start ? pointFromEntry(wall.start) : null;
  const end = wall?.end ? pointFromEntry(wall.end) : null;
  if (!start || !end) return;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const { baseZ, heightM } = resolveLevelEnvelope(
    levels,
    resolveWallLevel(wall),
  );
  const wallHeight = Number(wall.height_m) || heightM || DEFAULT_FLOOR_HEIGHT_M;
  const thickness = Number(wall.thickness_m) || DEFAULT_WALL_THICKNESS_M;
  const nx = (-dy / length) * (thickness / 2);
  const ny = (dx / length) * (thickness / 2);
  const z0 = baseZ;
  const z1 = baseZ + wallHeight;
  const corners = [
    { x: start.x + nx, y: start.y + ny, z: z0 },
    { x: end.x + nx, y: end.y + ny, z: z0 },
    { x: end.x - nx, y: end.y - ny, z: z0 },
    { x: start.x - nx, y: start.y - ny, z: z0 },
    { x: start.x + nx, y: start.y + ny, z: z1 },
    { x: end.x + nx, y: end.y + ny, z: z1 },
    { x: end.x - nx, y: end.y - ny, z: z1 },
    { x: start.x - nx, y: start.y - ny, z: z1 },
  ];
  const faces = [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ];
  const positions = [];
  const indices = [];
  for (const corner of corners) {
    positions.push(
      roundFloat(corner.x),
      roundFloat(corner.z),
      roundFloat(-corner.y),
    );
  }
  for (const face of faces) {
    const [a, b, c, d] = face;
    indices.push(a, b, c, a, c, d);
  }
  const color = hexToRgbaFloat(
    pickMaterialHex(
      materialDNA,
      [
        ["walls", "exterior", "hex"],
        ["walls", "exterior"],
        ["exterior_wall", "hex"],
        ["primary", "hex"],
      ],
      wall.exterior ? "#c4b9a4" : "#d9d2c4",
    ),
  );
  meshes.push({
    name: `wall-${wall.id || meshes.length}`,
    kind: "wall",
    positions,
    indices,
    materialColor: color,
    primitiveId: wall.id || null,
  });
}

function appendSlabMesh(meshes, slab, levels, materialDNA) {
  const polygon = Array.isArray(slab?.polygon) ? slab.polygon : null;
  if (!polygon || polygon.length < 3) return;
  const { baseZ } = resolveLevelEnvelope(levels, resolveSlabLevel(slab));
  const slabZ = Number.isFinite(Number(slab.elevation_m))
    ? Number(slab.elevation_m)
    : baseZ;
  const thickness = Number(slab.thickness_m) || DEFAULT_SLAB_THICKNESS_M;
  const corners = polygon
    .map((p) => pointFromEntry(p, { z: 0 }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (corners.length < 3) return;
  const z0 = slabZ - thickness;
  const z1 = slabZ;
  const positions = [];
  const indices = [];
  for (const corner of corners) {
    positions.push(roundFloat(corner.x), roundFloat(z0), roundFloat(-corner.y));
  }
  for (const corner of corners) {
    positions.push(roundFloat(corner.x), roundFloat(z1), roundFloat(-corner.y));
  }
  const N = corners.length;
  for (let i = 1; i < N - 1; i += 1) indices.push(0, i + 1, i);
  for (let i = 1; i < N - 1; i += 1) indices.push(N + 0, N + i, N + i + 1);
  for (let i = 0; i < N; i += 1) {
    const next = (i + 1) % N;
    indices.push(i, next, N + next);
    indices.push(i, N + next, N + i);
  }
  const color = hexToRgbaFloat(
    pickMaterialHex(
      materialDNA,
      [
        ["slabs", "hex"],
        ["floor", "hex"],
        ["concrete", "hex"],
      ],
      "#9ba1a8",
    ),
  );
  meshes.push({
    name: `slab-${slab.id || meshes.length}`,
    kind: "slab",
    positions,
    indices,
    materialColor: color,
    primitiveId: slab.id || null,
  });
}

function appendLevelFootprintSlab(meshes, level, materialDNA) {
  // Codex blocker #2 fallback: when the compiledProject carries no explicit
  // `slabs` array, derive one slab per level from the level's own footprint.
  // The post-Phase-5 compiler emits explicit slabs, but legacy / partial
  // projects still surface the footprint on each level.
  const polygon = Array.isArray(level?.footprint?.polygon)
    ? level.footprint.polygon
    : null;
  if (!polygon || polygon.length < 3) return;
  appendSlabMesh(
    meshes,
    {
      id: `slab-from-${level.id || "level"}`,
      levelId: level.id,
      polygon,
      thickness_m: DEFAULT_SLAB_THICKNESS_M,
      elevation_m: level.bottom_m,
    },
    [level],
    materialDNA,
  );
}

function appendOpeningMesh(meshes, opening, walls, levels, materialDNA) {
  const wallId = resolveOpeningWallId(opening);
  const wall = (walls || []).find((w) => w?.id === wallId);
  if (!wall) return;
  const start = wall.start ? pointFromEntry(wall.start) : null;
  const end = wall.end ? pointFromEntry(wall.end) : null;
  if (!start || !end) return;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const ux = dx / length;
  const uy = dy / length;
  const positionM = Number.isFinite(Number(opening.position_m))
    ? Number(opening.position_m)
    : length / 2;
  const widthM = Number(opening.width_m) || 1.0;
  const type = String(opening.type || opening.kind || "window").toLowerCase();
  const isDoor = type === "door";
  const sillM = Number.isFinite(Number(opening.sill_height_m))
    ? Number(opening.sill_height_m)
    : isDoor
      ? 0
      : DEFAULT_WINDOW_SILL_M;
  let heightM = Number(opening.height_m);
  if (!Number.isFinite(heightM) || heightM <= 0) {
    const sill = sillM;
    const head = Number(opening.head_height_m);
    if (Number.isFinite(head) && head > sill) {
      heightM = head - sill;
    } else {
      heightM = isDoor ? DEFAULT_DOOR_HEIGHT_M : DEFAULT_WINDOW_HEIGHT_M;
    }
  }
  const thickness = Number(wall.thickness_m) || DEFAULT_WALL_THICKNESS_M;
  const { baseZ } = resolveLevelEnvelope(
    levels,
    resolveOpeningLevel(opening) ?? resolveWallLevel(wall),
  );
  const cx = start.x + ux * positionM;
  const cy = start.y + uy * positionM;
  const nx = -uy * (thickness / 2 + 0.05);
  const ny = ux * (thickness / 2 + 0.05);
  const halfW = widthM / 2;
  const corners = [
    { x: cx - ux * halfW + nx, y: cy - uy * halfW + ny, z: baseZ + sillM },
    { x: cx + ux * halfW + nx, y: cy + uy * halfW + ny, z: baseZ + sillM },
    { x: cx + ux * halfW - nx, y: cy + uy * halfW - ny, z: baseZ + sillM },
    { x: cx - ux * halfW - nx, y: cy - uy * halfW - ny, z: baseZ + sillM },
    {
      x: cx - ux * halfW + nx,
      y: cy - uy * halfW + ny,
      z: baseZ + sillM + heightM,
    },
    {
      x: cx + ux * halfW + nx,
      y: cy + uy * halfW + ny,
      z: baseZ + sillM + heightM,
    },
    {
      x: cx + ux * halfW - nx,
      y: cy + uy * halfW - ny,
      z: baseZ + sillM + heightM,
    },
    {
      x: cx - ux * halfW - nx,
      y: cy - uy * halfW - ny,
      z: baseZ + sillM + heightM,
    },
  ];
  const positions = [];
  const indices = [];
  for (const c of corners) {
    positions.push(roundFloat(c.x), roundFloat(c.z), roundFloat(-c.y));
  }
  const faces = [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ];
  for (const face of faces) {
    const [a, b, c, d] = face;
    indices.push(a, b, c, a, c, d);
  }
  const fallback = isDoor ? "#5c4033" : "#a9c8e0";
  const color = hexToRgbaFloat(
    pickMaterialHex(
      materialDNA,
      isDoor
        ? [
            ["doors", "hex"],
            ["door", "hex"],
          ]
        : [
            ["windows", "hex"],
            ["window", "hex"],
            ["glazing", "hex"],
          ],
      fallback,
    ),
  );
  meshes.push({
    name: `${isDoor ? "door" : "window"}-${opening.id || meshes.length}`,
    kind: isDoor ? "door" : "window",
    positions,
    indices,
    materialColor: color,
    primitiveId: opening.id || null,
  });
}

function appendRoofPlaneMesh(meshes, primitive, levels, materialDNA) {
  // The compiler's roof.planes / .ridges / .eaves / .hips / .valleys /
  // .parapets / .dormers all use the same shape: a polygon footprint plus
  // a slope/ridge/eave height. We extrude the polygon's outline from the
  // building eaves up to ridge_height_m (when present) or use a thin
  // horizontal slab at eave height otherwise. This is a deliberately
  // schematic 3D representation — the deterministic 2D plans/sections
  // remain the authority for roof geometry.
  const polygon = Array.isArray(primitive?.polygon) ? primitive.polygon : null;
  if (!polygon || polygon.length < 3) return;
  const corners = polygon
    .map((p) => pointFromEntry(p, { z: 0 }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (corners.length < 3) return;
  const totalHeight = (levels || []).reduce(
    (max, level) => Math.max(max, Number(level?.top_m) || 0),
    0,
  );
  const ridgeM =
    Number(primitive.ridge_height_m) > 0
      ? Number(primitive.ridge_height_m)
      : totalHeight + 0.5;
  const eaveM =
    Number(primitive.eave_height_m) > 0
      ? Number(primitive.eave_height_m)
      : totalHeight;
  const z0 = Math.min(ridgeM, eaveM);
  const z1 = Math.max(ridgeM, eaveM, z0 + 0.2);
  const positions = [];
  const indices = [];
  for (const corner of corners) {
    positions.push(roundFloat(corner.x), roundFloat(z0), roundFloat(-corner.y));
  }
  for (const corner of corners) {
    positions.push(roundFloat(corner.x), roundFloat(z1), roundFloat(-corner.y));
  }
  const N = corners.length;
  for (let i = 1; i < N - 1; i += 1) indices.push(0, i + 1, i);
  for (let i = 1; i < N - 1; i += 1) indices.push(N + 0, N + i, N + i + 1);
  for (let i = 0; i < N; i += 1) {
    const next = (i + 1) % N;
    indices.push(i, next, N + next);
    indices.push(i, N + next, N + i);
  }
  const color = hexToRgbaFloat(
    pickMaterialHex(
      materialDNA,
      [
        ["roof", "hex"],
        ["roofing", "hex"],
        ["slate", "hex"],
      ],
      "#5c5a55",
    ),
  );
  meshes.push({
    name: `roof-${primitive.primitive_family || "primitive"}-${primitive.id || meshes.length}`,
    kind: "roof",
    positions,
    indices,
    materialColor: color,
    primitiveId: primitive.id || null,
  });
}

function appendRoofPrimitives(meshes, compiledProject, levels, materialDNA) {
  const roof = compiledProject?.roof || {};
  // The compiler buckets roof primitives. Walk every bucket so a roof
  // composed only of `.ridges` + `.eaves` still surfaces as 3D geometry.
  const bucketKeys = [
    "planes",
    "ridges",
    "eaves",
    "hips",
    "valleys",
    "parapets",
    "dormers",
  ];
  let primitives = [];
  for (const key of bucketKeys) {
    const entries = roof[key];
    if (Array.isArray(entries) && entries.length) {
      primitives = primitives.concat(entries);
    }
  }
  // Pre-Phase-5 fallback: legacy compiled projects may carry a flat
  // `roof_primitives` array on the top-level project. Honour both.
  if (!primitives.length && Array.isArray(compiledProject?.roof_primitives)) {
    primitives = primitives.concat(compiledProject.roof_primitives);
  }
  if (!primitives.length) {
    // Final fallback: derive a single horizontal "roof slab" from the
    // largest level footprint so a tabletop GLB still has a roof mesh.
    const tallest = (levels || []).reduce(
      (best, level) =>
        Number(level?.top_m) > (best?.top_m || -Infinity) ? level : best,
      null,
    );
    if (tallest?.footprint?.polygon?.length >= 3) {
      primitives = [
        {
          id: `roof-fallback-${tallest.id || "level"}`,
          primitive_family: "roof_plane",
          polygon: tallest.footprint.polygon,
          eave_height_m: Number(tallest.top_m) || 0,
          ridge_height_m: (Number(tallest.top_m) || 0) + 0.5,
        },
      ];
    }
  }
  for (const primitive of primitives) {
    appendRoofPlaneMesh(meshes, primitive, levels, materialDNA);
  }
}

function buildMeshes(compiledProject) {
  const meshes = [];
  const levels = Array.isArray(compiledProject.levels)
    ? compiledProject.levels
    : [];
  const walls = Array.isArray(compiledProject.walls)
    ? compiledProject.walls
    : [];
  const slabs = Array.isArray(compiledProject.slabs)
    ? compiledProject.slabs
    : [];
  const openings = Array.isArray(compiledProject.openings)
    ? compiledProject.openings
    : [];
  // Legacy pre-Phase-5 shape: doors/windows arrays at top level.
  const legacyDoors = Array.isArray(compiledProject.doors)
    ? compiledProject.doors
    : [];
  const legacyWindows = Array.isArray(compiledProject.windows)
    ? compiledProject.windows
    : [];

  const materialDNA = resolveMaterialDNA(compiledProject);

  for (const wall of walls) appendWallMesh(meshes, wall, levels, materialDNA);

  if (slabs.length > 0) {
    for (const slab of slabs) appendSlabMesh(meshes, slab, levels, materialDNA);
  } else {
    // Fallback: one slab per level using the level's own footprint. Real
    // post-Phase-5 compiledProjects always have explicit slabs; this
    // branch is for legacy / partial fixtures and the test runner.
    for (const level of levels)
      appendLevelFootprintSlab(meshes, level, materialDNA);
  }

  for (const opening of openings)
    appendOpeningMesh(meshes, opening, walls, levels, materialDNA);
  for (const door of legacyDoors)
    appendOpeningMesh(
      meshes,
      { ...door, type: "door" },
      walls,
      levels,
      materialDNA,
    );
  for (const window of legacyWindows)
    appendOpeningMesh(
      meshes,
      { ...window, type: "window" },
      walls,
      levels,
      materialDNA,
    );

  appendRoofPrimitives(meshes, compiledProject, levels, materialDNA);

  return { meshes, materialDNA };
}

function bytesAlignedTo4(byteLength, padByte = 0x00) {
  const remainder = byteLength % 4;
  if (remainder === 0) return Buffer.alloc(0);
  return Buffer.alloc(4 - remainder, padByte);
}

function encodeGlb({ meshes, geometryHash, projectName, materialDNA }) {
  const bufferChunks = [];
  const accessors = [];
  const bufferViews = [];
  const glMeshes = [];
  const materials = [];
  const nodes = [];
  let byteOffset = 0;
  const materialIndexByColor = new Map();
  const ensureMaterial = (color, kind) => {
    const key = color.join(",");
    if (materialIndexByColor.has(key)) return materialIndexByColor.get(key);
    const idx = materials.length;
    materials.push({
      name: `${kind}-material`,
      pbrMetallicRoughness: {
        baseColorFactor: color,
        metallicFactor: 0,
        roughnessFactor: 0.8,
      },
    });
    materialIndexByColor.set(key, idx);
    return idx;
  };
  for (const mesh of meshes) {
    const positions = Float32Array.from(mesh.positions);
    const indices = Uint32Array.from(mesh.indices);
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i],
        y = positions[i + 1],
        z = positions[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    const posBytes = Buffer.from(
      positions.buffer,
      positions.byteOffset,
      positions.byteLength,
    );
    bufferChunks.push(posBytes);
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: posBytes.length,
      target: TARGET_ARRAY_BUFFER,
    });
    const posBufferViewIndex = bufferViews.length - 1;
    byteOffset += posBytes.length;
    const padPos = bytesAlignedTo4(posBytes.length);
    if (padPos.length) {
      bufferChunks.push(padPos);
      byteOffset += padPos.length;
    }
    const idxBytes = Buffer.from(
      indices.buffer,
      indices.byteOffset,
      indices.byteLength,
    );
    bufferChunks.push(idxBytes);
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: idxBytes.length,
      target: TARGET_ELEMENT_ARRAY_BUFFER,
    });
    const idxBufferViewIndex = bufferViews.length - 1;
    byteOffset += idxBytes.length;
    const padIdx = bytesAlignedTo4(idxBytes.length);
    if (padIdx.length) {
      bufferChunks.push(padIdx);
      byteOffset += padIdx.length;
    }
    accessors.push({
      bufferView: posBufferViewIndex,
      componentType: COMPONENT_TYPE_FLOAT,
      count: positions.length / 3,
      type: "VEC3",
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });
    const posAccessorIndex = accessors.length - 1;
    accessors.push({
      bufferView: idxBufferViewIndex,
      componentType: COMPONENT_TYPE_UINT32,
      count: indices.length,
      type: "SCALAR",
    });
    const idxAccessorIndex = accessors.length - 1;
    const materialIndex = ensureMaterial(mesh.materialColor, mesh.kind);
    glMeshes.push({
      name: mesh.name,
      primitives: [
        {
          attributes: { POSITION: posAccessorIndex },
          indices: idxAccessorIndex,
          material: materialIndex,
          mode: PRIMITIVE_MODE_TRIANGLES,
        },
      ],
      extras: {
        kind: mesh.kind,
        primitiveId: mesh.primitiveId || null,
      },
    });
    nodes.push({
      name: mesh.name,
      mesh: glMeshes.length - 1,
    });
  }
  const totalBinLength = byteOffset;
  const meshKinds = glMeshes.map((m) => m.extras?.kind || "unknown");
  const glTF = {
    asset: {
      version: "2.0",
      generator: `${GLB_WRITER_VERSION}`,
      copyright: projectName || "",
    },
    scene: 0,
    scenes: [
      {
        name: geometryHash || projectName || "scene",
        nodes: nodes.map((_, i) => i),
      },
    ],
    nodes,
    meshes: glMeshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: totalBinLength }],
    extras: {
      adapterVersion: GLB_WRITER_VERSION,
      geometryHash: geometryHash || null,
      projectName: projectName || null,
      meshCount: glMeshes.length,
      meshKinds,
      materialDNAKeys: Object.keys(materialDNA || {}).sort(),
    },
  };
  const jsonString = JSON.stringify(glTF);
  let jsonBuffer = Buffer.from(jsonString, "utf8");
  const jsonPad = bytesAlignedTo4(jsonBuffer.length, 0x20);
  if (jsonPad.length) {
    jsonBuffer = Buffer.concat([jsonBuffer, jsonPad]);
  }
  let binBuffer = Buffer.concat(bufferChunks, totalBinLength);
  const binPad = bytesAlignedTo4(binBuffer.length);
  if (binPad.length) {
    binBuffer = Buffer.concat([binBuffer, binPad]);
  }
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  const out = Buffer.alloc(totalLength);
  let p = 0;
  out.writeUInt32LE(GLB_MAGIC, p);
  p += 4;
  out.writeUInt32LE(GLB_VERSION, p);
  p += 4;
  out.writeUInt32LE(totalLength, p);
  p += 4;
  out.writeUInt32LE(jsonBuffer.length, p);
  p += 4;
  out.writeUInt32LE(CHUNK_TYPE_JSON, p);
  p += 4;
  jsonBuffer.copy(out, p);
  p += jsonBuffer.length;
  out.writeUInt32LE(binBuffer.length, p);
  p += 4;
  out.writeUInt32LE(CHUNK_TYPE_BIN, p);
  p += 4;
  binBuffer.copy(out, p);
  p += binBuffer.length;
  return {
    glb: out,
    glbByteLength: totalLength,
    jsonByteLength: jsonBuffer.length,
    binByteLength: binBuffer.length,
    meshCount: glMeshes.length,
    meshKinds,
    materialCount: materials.length,
    accessorCount: accessors.length,
    bufferViewCount: bufferViews.length,
    extras: glTF.extras,
  };
}

/**
 * Build a deterministic GLB for the given compiledProject.
 *
 * @param {object} compiledProject
 * @returns {{
 *   ok: true,
 *   glb: Buffer,
 *   glbByteLength: number,
 *   geometryHash: string|null,
 *   meshCount: number,
 *   meshKinds: string[],
 *   materialCount: number,
 *   adapterVersion: string,
 *   extras: object,
 * }}
 */
export function buildCompiledProjectGlb(compiledProject = {}) {
  if (!compiledProject || typeof compiledProject !== "object") {
    throw new Error("buildCompiledProjectGlb: compiledProject is required");
  }
  const geometryHash =
    compiledProject.geometryHash ||
    compiledProject.metadata?.geometryHash ||
    compiledProject.metadata?.geometry_hash ||
    null;
  const projectName =
    compiledProject.metadata?.projectName ||
    compiledProject.metadata?.project_name ||
    compiledProject.brief?.project_name ||
    null;
  const { meshes, materialDNA } = buildMeshes(compiledProject);
  if (meshes.length === 0) {
    throw new Error(
      "buildCompiledProjectGlb: no convertible primitives found (walls/slabs/openings/roof all empty).",
    );
  }
  const encoded = encodeGlb({ meshes, geometryHash, projectName, materialDNA });
  return {
    ok: true,
    glb: encoded.glb,
    glbByteLength: encoded.glbByteLength,
    jsonByteLength: encoded.jsonByteLength,
    binByteLength: encoded.binByteLength,
    geometryHash,
    meshCount: encoded.meshCount,
    meshKinds: encoded.meshKinds,
    materialCount: encoded.materialCount,
    accessorCount: encoded.accessorCount,
    bufferViewCount: encoded.bufferViewCount,
    adapterVersion: GLB_WRITER_VERSION,
    extras: encoded.extras,
  };
}

export const __internal = {
  hexToRgbaFloat,
  pointFromEntry,
  roundFloat,
  buildMeshes,
  encodeGlb,
  resolveLevelEnvelope,
};

export default {
  GLB_WRITER_VERSION,
  buildCompiledProjectGlb,
};
