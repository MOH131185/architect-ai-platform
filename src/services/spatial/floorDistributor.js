/**
 * Floor Distributor Service
 *
 * Distributes rooms across building floors following UK residential conventions:
 * - Ground floor: entry, hall, living, kitchen, dining, utility, WC
 * - Upper floors: bedrooms, bathrooms, en-suites, offices
 * - Flexible: storage, stairs, circulation (every floor)
 */

const GROUND_FLOOR_RE =
  /(entry|hall(?!way)|hallway|living|lounge|kitchen|dining|utility|wc|cloakroom|garage|reception|family)/i;
const UPPER_FLOOR_RE =
  /(bedroom|master|bathroom|en.?suite|nursery|dressing|office|study|guest)/i;
const EVERY_FLOOR_RE = /(stair|landing|corridor|circulation|storage|cupboard)/i;

function classifyRoom(room) {
  const name = String(
    room.name || room.program || room.type || room.id || "",
  ).toLowerCase();
  if (EVERY_FLOOR_RE.test(name)) return "every";
  if (GROUND_FLOOR_RE.test(name)) return "ground";
  if (UPPER_FLOOR_RE.test(name)) return "upper";
  return "ground"; // default to ground floor for unclassified rooms
}

export function distributeFloors(buildingData) {
  const rooms = buildingData?.rooms || buildingData?.programSpaces || [];
  const floorCount = buildingData?.floors || buildingData?.floorCount || 1;
  const distributed = distributeRoomsToFloors(rooms, floorCount);

  let totalArea = 0;
  const floors = distributed.map((floorRooms, i) => {
    const area = floorRooms.reduce(
      (sum, r) => sum + (r.area || r.targetAreaM2 || r.area_m2 || 0),
      0,
    );
    totalArea += area;
    return { level: i, rooms: floorRooms, area };
  });

  return { floors, totalArea };
}

export function distributeRoomsToFloors(rooms, floorCount) {
  if (!rooms || rooms.length === 0 || floorCount < 1) {
    return Array.from({ length: floorCount }, () => []);
  }

  const floors = Array.from({ length: floorCount }, () => []);

  // Rooms with explicit floor assignments go first
  const unassigned = [];
  for (const room of rooms) {
    const explicit = room.floor ?? room.level ?? room.levelIndex;
    if (explicit != null && explicit >= 0 && explicit < floorCount) {
      floors[explicit].push(room);
    } else {
      unassigned.push(room);
    }
  }

  // Classify and distribute unassigned rooms
  const groundRooms = [];
  const upperRooms = [];
  const everyFloorRooms = [];

  for (const room of unassigned) {
    const cls = classifyRoom(room);
    if (cls === "every") everyFloorRooms.push(room);
    else if (cls === "upper" && floorCount > 1) upperRooms.push(room);
    else groundRooms.push(room);
  }

  // Ground floor gets ground-classified rooms
  floors[0].push(...groundRooms);

  // Upper rooms distributed round-robin across upper floors
  if (floorCount > 1 && upperRooms.length > 0) {
    upperRooms.forEach((room, i) => {
      const targetFloor = 1 + (i % (floorCount - 1));
      floors[targetFloor].push(room);
    });
  } else {
    // Single floor: everything goes to ground
    floors[0].push(...upperRooms);
  }

  // Every-floor rooms get duplicated to each floor (e.g., stairs, landing)
  for (let f = 0; f < floorCount; f++) {
    for (const room of everyFloorRooms) {
      floors[f].push({ ...room, level: f });
    }
  }

  return floors;
}

export default { distributeFloors, distributeRoomsToFloors };
