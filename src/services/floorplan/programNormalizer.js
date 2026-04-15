import { createStableId, roundMetric } from "../cad/projectGeometrySchema.js";
import { safeNumber } from "../cad/architecturalSchema.js";

const PRIVATE_KEYWORDS = ["bedroom", "bed", "ensuite", "bathroom"];
const SERVICE_KEYWORDS = ["kitchen", "utility", "plant", "laundry", "storage"];
const CORE_KEYWORDS = ["stair", "lift", "core", "hall", "corridor"];
const WET_KEYWORDS = ["bath", "wc", "kitchen", "shower", "laundry", "utility"];

function inferRoomType(value = "") {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return "room";
  return text.replace(/\s+/g, "_");
}

function containsKeyword(value, keywords) {
  const text = String(value || "").toLowerCase();
  return keywords.some((keyword) => text.includes(keyword));
}

function inferPrivacyLevel(room = {}) {
  const source = `${room.name || ""} ${room.type || ""}`;
  if (containsKeyword(source, PRIVATE_KEYWORDS)) return 2;
  if (containsKeyword(source, CORE_KEYWORDS)) return 1;
  if (containsKeyword(source, SERVICE_KEYWORDS)) return 1;
  return 0;
}

function inferRequiresDaylight(room = {}) {
  const source = `${room.name || ""} ${room.type || ""}`;
  return !containsKeyword(source, ["store", "wc", "corridor", "hall", "plant"]);
}

function inferWetZone(room = {}) {
  const source = `${room.name || ""} ${room.type || ""}`;
  return containsKeyword(source, WET_KEYWORDS);
}

function normalizeAdjacencyPreference(preference) {
  if (!preference) return null;
  if (typeof preference === "string") {
    return {
      target: preference,
      weight: 1,
      type: "preferred",
    };
  }

  return {
    target:
      preference.target || preference.room || preference.id || preference.name,
    weight: safeNumber(preference.weight, 1),
    type: preference.type || "preferred",
  };
}

function uniqueAdjacencyPreferences(preferences = []) {
  const byTarget = new Map();
  preferences.forEach((preference) => {
    const normalized = normalizeAdjacencyPreference(preference);
    if (!normalized?.target) {
      return;
    }
    const key = String(normalized.target).trim().toLowerCase();
    if (!byTarget.has(key) || normalized.weight > byTarget.get(key).weight) {
      byTarget.set(key, normalized);
    }
  });
  return [...byTarget.values()];
}

function normalizeLookupKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeAccessRequirements(room = {}) {
  const requirements = new Set(
    Array.isArray(room.access_requirements) ? room.access_requirements : [],
  );

  if (inferWetZone(room)) {
    requirements.add("water");
  }
  if (
    containsKeyword(`${room.name || ""} ${room.type || ""}`, ["stair", "lift"])
  ) {
    requirements.add("vertical_circulation");
  }
  if (room.requires_accessible_entry) {
    requirements.add("accessible");
  }

  return [...requirements].map((entry) => String(entry).toLowerCase());
}

export function normalizeProgram(programInput = [], options = {}) {
  const projectId = options.project_id || options.projectId || "phase2-project";
  const rawProgram = Array.isArray(programInput)
    ? programInput
    : Array.isArray(programInput.rooms)
      ? programInput.rooms
      : [];

  const preliminaryRooms = rawProgram.map((rawRoom, index) => {
    const name = rawRoom.name || rawRoom.label || `Room ${index + 1}`;
    const type = inferRoomType(rawRoom.type || rawRoom.program || name);
    const targetArea = Math.max(
      4,
      safeNumber(
        rawRoom.target_area ??
          rawRoom.target_area_m2 ??
          rawRoom.area ??
          rawRoom.area_m2,
        12,
      ),
    );
    const minArea = Math.max(
      3,
      safeNumber(rawRoom.min_area ?? rawRoom.min_area_m2, targetArea * 0.8),
    );
    const maxArea = Math.max(
      targetArea,
      safeNumber(rawRoom.max_area ?? rawRoom.max_area_m2, targetArea * 1.25),
    );
    const privacyLevel =
      rawRoom.privacy_level ?? inferPrivacyLevel({ name, type });
    const requiresDaylight =
      rawRoom.requires_daylight ?? inferRequiresDaylight({ name, type });
    const wetZone = rawRoom.wet_zone ?? inferWetZone({ name, type });
    const adjacencyPreferences = uniqueAdjacencyPreferences(
      rawRoom.adjacency_preferences || rawRoom.adjacency || [],
    );

    return {
      id:
        rawRoom.id ||
        createStableId("program-room", projectId, index, name, type),
      name,
      type,
      target_area: roundMetric(targetArea),
      target_area_m2: roundMetric(targetArea),
      min_area: roundMetric(minArea),
      min_area_m2: roundMetric(minArea),
      max_area: roundMetric(maxArea),
      max_area_m2: roundMetric(maxArea),
      privacy_level: Number(privacyLevel),
      requires_daylight: requiresDaylight !== false,
      wet_zone: wetZone === true,
      access_requirements: normalizeAccessRequirements(rawRoom),
      adjacency_preferences: adjacencyPreferences,
      zone: rawRoom.zone || null,
      level_hint:
        rawRoom.level_hint ??
        rawRoom.level ??
        rawRoom.level_number ??
        rawRoom.preferred_level ??
        null,
      metadata: {
        source_index: index,
      },
    };
  });

  const roomLookup = new Map();
  preliminaryRooms.forEach((room) => {
    roomLookup.set(normalizeLookupKey(room.id), room.id);
    roomLookup.set(normalizeLookupKey(room.name), room.id);
    roomLookup.set(normalizeLookupKey(`${room.name}_${room.type}`), room.id);
  });

  const rooms = preliminaryRooms.map((room) => ({
    ...room,
    adjacency_preferences: room.adjacency_preferences.map((preference) => ({
      ...preference,
      target:
        roomLookup.get(normalizeLookupKey(preference.target)) ||
        preference.target,
    })),
  }));

  return {
    project_id: projectId,
    rooms,
    stats: {
      room_count: rooms.length,
      total_target_area: roundMetric(
        rooms.reduce((sum, room) => sum + room.target_area, 0),
      ),
      wet_zone_count: rooms.filter((room) => room.wet_zone).length,
    },
  };
}

export default {
  normalizeProgram,
};
