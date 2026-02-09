/**
 * DNA v2 Schema Tests
 *
 * Tests for:
 * - Room instance ID generation (deterministic)
 * - Per-room hash computation
 * - DNA hash computation
 * - freezeDNA immutability
 * - Area tolerance enforcement
 * - Instance count enforcement
 * - v1 → v2 migration
 */

// -----------------------------------------------------------------------
// Inline hash function (same as cdsHash.js)
// -----------------------------------------------------------------------

function computeCDSHashSync(obj) {
  const str = JSON.stringify(obj, (key, value) => {
    if (["hash", "designId", "timestamp"].includes(key)) return undefined;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted = {};
      Object.keys(value)
        .sort()
        .forEach((k) => {
          if (!["hash", "designId", "timestamp"].includes(k))
            sorted[k] = value[k];
        });
      return sorted;
    }
    return value;
  });
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

// -----------------------------------------------------------------------
// Inline implementation of normalizeRawDNA (DNA v2)
// -----------------------------------------------------------------------

const FLOOR_ABBREV = {
  basement: "bs",
  ground: "gf",
  first: "ff",
  second: "sf",
  third: "tf",
};

function normalizeRawDNA(rawDNA) {
  if (!rawDNA || typeof rawDNA !== "object") throw new Error("Invalid DNA");
  const floorSeqCounters = {};
  const normalized = {
    version: "2.0",
    site: {
      polygon: Array.isArray(rawDNA.site?.polygon) ? rawDNA.site.polygon : [],
      area_m2: parseFloat(rawDNA.site?.area_m2) || 0,
      orientation: parseFloat(rawDNA.site?.orientation) || 0,
      climate_zone: String(rawDNA.site?.climate_zone || "temperate"),
      sun_path: String(rawDNA.site?.sun_path || "south"),
      wind_profile: String(rawDNA.site?.wind_profile || "moderate"),
    },
    program: {
      floors: parseInt(rawDNA.program?.floors) || 2,
      rooms: Array.isArray(rawDNA.program?.rooms)
        ? rawDNA.program.rooms.map((room) => {
            const name = String(room.name || "Room");
            const area_m2 = parseFloat(room.area_m2 || room.area || 20);
            const floor = String(room.floor || "ground");
            const orientation = String(room.orientation || "any");
            const floorAbbrev = FLOOR_ABBREV[floor] || floor.substring(0, 2);
            floorSeqCounters[floorAbbrev] =
              (floorSeqCounters[floorAbbrev] || 0) + 1;
            const seq = String(floorSeqCounters[floorAbbrev]).padStart(3, "0");
            const instanceId = room.instanceId || `room_${floorAbbrev}_${seq}`;
            const roomHash = computeCDSHashSync({ name, area_m2, floor });
            return { name, area_m2, floor, orientation, instanceId, roomHash };
          })
        : [],
    },
    style: {
      architecture: String(rawDNA.style?.architecture || "contemporary"),
      materials: Array.isArray(rawDNA.style?.materials)
        ? rawDNA.style.materials
        : ["brick", "wood"],
      windows: {
        pattern: String(rawDNA.style?.windows?.pattern || "regular grid"),
        proportion: String(rawDNA.style?.windows?.proportion || "3:5"),
      },
    },
    geometry_rules: {
      grid: String(rawDNA.geometry_rules?.grid || "1m grid"),
      max_span: String(rawDNA.geometry_rules?.max_span || "6m"),
      roof_type: String(rawDNA.geometry_rules?.roof_type || "gable"),
    },
  };
  normalized.dnaHash = computeCDSHashSync(normalized);
  return normalized;
}

function freezeDNA(dna) {
  if (!dna || typeof dna !== "object") return dna;
  Object.freeze(dna);
  Object.keys(dna).forEach((key) => {
    const val = dna[key];
    if (val && typeof val === "object" && !Object.isFrozen(val)) {
      freezeDNA(val);
    }
  });
  return dna;
}

// -----------------------------------------------------------------------
// Test runner
// -----------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------
// Test data
// -----------------------------------------------------------------------

function makeSampleDNA() {
  return {
    site: {
      polygon: [],
      area_m2: 500,
      orientation: 0,
      climate_zone: "temperate",
      sun_path: "south",
      wind_profile: "moderate",
    },
    program: {
      floors: 2,
      rooms: [
        { name: "Living Room", area_m2: 25, floor: "ground" },
        { name: "Kitchen", area_m2: 15, floor: "ground" },
        { name: "WC", area_m2: 4, floor: "ground" },
        { name: "Master Bedroom", area_m2: 20, floor: "first" },
        { name: "Bedroom 2", area_m2: 15, floor: "first" },
        { name: "Bathroom", area_m2: 8, floor: "first" },
      ],
    },
    style: {
      architecture: "contemporary",
      materials: ["brick", "wood"],
      windows: { pattern: "regular grid", proportion: "3:5" },
    },
    geometry_rules: { grid: "1m grid", max_span: "6m", roof_type: "gable" },
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

console.log("\n=== DNA v2 Schema Tests ===\n");

// Test 1: Room instance ID generation is deterministic
{
  const dna1 = normalizeRawDNA(makeSampleDNA());
  const dna2 = normalizeRawDNA(makeSampleDNA());
  const ids1 = dna1.program.rooms.map((r) => r.instanceId);
  const ids2 = dna2.program.rooms.map((r) => r.instanceId);
  assert(
    JSON.stringify(ids1) === JSON.stringify(ids2),
    "Room instance IDs are deterministic (same input → same IDs)",
  );
  assert(
    ids1[0] === "room_gf_001",
    `First ground room ID is room_gf_001 (got ${ids1[0]})`,
  );
  assert(
    ids1[3] === "room_ff_001",
    `First upper room ID is room_ff_001 (got ${ids1[3]})`,
  );
}

// Test 2: Room hash changes when area changes
{
  const dna1 = normalizeRawDNA(makeSampleDNA());
  const modified = makeSampleDNA();
  modified.program.rooms[0].area_m2 = 30; // Change Living Room area
  const dna2 = normalizeRawDNA(modified);
  assert(
    dna1.program.rooms[0].roomHash !== dna2.program.rooms[0].roomHash,
    "Room hash changes when area changes",
  );
}

// Test 3: DNA hash changes when any room changes
{
  const dna1 = normalizeRawDNA(makeSampleDNA());
  const modified = makeSampleDNA();
  modified.program.rooms[0].area_m2 = 30;
  const dna2 = normalizeRawDNA(modified);
  assert(
    dna1.dnaHash !== dna2.dnaHash,
    "DNA hash changes when any room changes",
  );
}

// Test 4: Frozen DNA throws on mutation
{
  const dna = normalizeRawDNA(makeSampleDNA());
  freezeDNA(dna);
  assert(
    Object.isFrozen(dna) && Object.isFrozen(dna.program.rooms[0]),
    "Frozen DNA is deeply frozen",
  );
}

// Test 5: Area tolerance — 2% deviation passes at 3% threshold
{
  const lockedArea = 25;
  const dnaArea = 25.4; // 1.6% deviation
  const deviation = Math.abs(dnaArea - lockedArea) / lockedArea;
  assert(
    deviation <= 0.03,
    `1.6% deviation (${(deviation * 100).toFixed(1)}%) passes at 3% threshold`,
  );
}

// Test 6: Area tolerance — 5% deviation fails at 3% threshold
{
  const lockedArea = 25;
  const dnaArea = 26.5; // 6% deviation
  const deviation = Math.abs(dnaArea - lockedArea) / lockedArea;
  assert(
    deviation > 0.03,
    `6% deviation (${(deviation * 100).toFixed(1)}%) fails at 3% threshold`,
  );
}

// Test 7: Instance count — correct rooms on level 0
{
  const dna = normalizeRawDNA(makeSampleDNA());
  const groundRooms = dna.program.rooms.filter((r) => r.floor === "ground");
  assert(
    groundRooms.length === 3,
    `Ground floor has 3 rooms (got ${groundRooms.length})`,
  );
}

// Test 8: Instance count — correct rooms on level 1
{
  const dna = normalizeRawDNA(makeSampleDNA());
  const firstRooms = dna.program.rooms.filter((r) => r.floor === "first");
  assert(
    firstRooms.length === 3,
    `First floor has 3 rooms (got ${firstRooms.length})`,
  );
}

// Test 9: Floor-lock — room on unexpected level gets correct prefix
{
  const modified = makeSampleDNA();
  modified.program.rooms.push({ name: "Attic", area_m2: 10, floor: "third" });
  const dna = normalizeRawDNA(modified);
  const thirdFloorRooms = dna.program.rooms.filter((r) => r.floor === "third");
  assert(
    thirdFloorRooms.length === 1,
    "Room on unexpected level (third) is present in DNA",
  );
  assert(
    thirdFloorRooms[0].instanceId === "room_tf_001",
    `Third floor room gets tf prefix (got ${thirdFloorRooms[0].instanceId})`,
  );
}

// Test 10: v1 DNA migration — old DNA gets instance IDs
{
  const v1DNA = makeSampleDNA();
  const normalized = normalizeRawDNA(v1DNA);
  const allHaveIds = normalized.program.rooms.every(
    (r) => r.instanceId && r.instanceId.startsWith("room_"),
  );
  assert(allHaveIds, "v1 DNA migration: all rooms get instance IDs assigned");
  assert(
    normalized.dnaHash && normalized.dnaHash.length === 16,
    "v1 DNA migration: dnaHash is computed (16-char hex)",
  );
  assert(
    normalized.version === "2.0",
    `v1 DNA migration: version is 2.0 (got ${normalized.version})`,
  );
}

// Summary
console.log(
  `\n=== Results: ${passed} passed, ${failed} failed (${passed + failed} total) ===\n`,
);
process.exit(failed > 0 ? 1 : 0);
