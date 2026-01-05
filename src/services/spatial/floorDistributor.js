/**
 * Floor Distributor
 *
 * Distributes rooms across floors.
 */

/**
 * Distribute rooms to floors
 * @param {Object[]} rooms - Room definitions
 * @param {number} floorCount - Number of floors
 * @returns {Object} Distributed rooms by floor
 */
export function distributeRoomsToFloors(rooms, floorCount = 1) {
  console.log("[FloorDistributor] distributeRoomsToFloors (stub)");
  const result = {};
  for (let i = 0; i < floorCount; i++) {
    result[i] = [];
  }
  if (rooms && rooms.length) {
    rooms.forEach((room, idx) => {
      const floor = idx % floorCount;
      result[floor].push(room);
    });
  }
  return result;
}

/**
 * Get floor area
 * @param {Object[]} rooms - Rooms on floor
 * @returns {number} Total area
 */
export function getFloorArea(rooms) {
  if (!rooms) return 0;
  return rooms.reduce((sum, room) => sum + (room.area || 0), 0);
}

export default {
  distributeRoomsToFloors,
  getFloorArea,
};
