/**
 * Floor Distributor Service - Stub
 */

export function distributeFloors(buildingData) {
    return {
        floors: [],
        totalArea: 0,
    };
}

export function distributeRoomsToFloors(rooms, floorCount) {
    return Array.from({ length: floorCount }, () => []);
}

export default { distributeFloors, distributeRoomsToFloors };
