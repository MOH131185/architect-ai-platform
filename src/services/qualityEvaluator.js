import { flattenSpatialGraphRooms } from "../schemas/spatialGraph.js";

const WET_ROOM_RE =
  /(bath|wc|toilet|utility|laundry|en.?suite|shower|kitchen)/i;
const PUBLIC_ROOM_RE =
  /(living|kitchen|dining|hall(?!way)|lounge|entrance|reception)/i;
const PRIVATE_ROOM_RE = /(bedroom|nursery|dressing|master)/i;

function overlap1D(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function areAdjacent(roomA, roomB, tolerance = 0.3) {
  if (!roomA || !roomB) {
    return false;
  }

  const shareVertical =
    (Math.abs(roomA.x + roomA.width - roomB.x) < tolerance ||
      Math.abs(roomB.x + roomB.width - roomA.x) < tolerance) &&
    overlap1D(roomA.y, roomA.y + roomA.depth, roomB.y, roomB.y + roomB.depth) >
      0.5;

  const shareHorizontal =
    (Math.abs(roomA.y + roomA.depth - roomB.y) < tolerance ||
      Math.abs(roomB.y + roomB.depth - roomA.y) < tolerance) &&
    overlap1D(roomA.x, roomA.x + roomA.width, roomB.x, roomB.x + roomB.width) >
      0.5;

  return shareVertical || shareHorizontal;
}

function hasExteriorWall(position, envelope, tolerance = 0.25) {
  if (!position || !envelope) {
    return false;
  }

  return (
    position.x <= tolerance ||
    position.y <= tolerance ||
    Math.abs(position.x + position.width - envelope.width_m) <= tolerance ||
    Math.abs(position.y + position.depth - envelope.depth_m) <= tolerance
  );
}

function buildRoomPositionMap(layout) {
  if (!layout || !Array.isArray(layout.levels)) {
    return {};
  }

  return layout.levels.reduce((acc, level) => {
    (level.rooms || []).forEach((room) => {
      const key = String(room.id || room.name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

      if (!key) {
        return;
      }

      acc[key] = {
        ...room,
        level: level.index ?? 0,
      };
    });
    return acc;
  }, {});
}

function findCirculationSeed(rooms, positions) {
  const circulationRoom = rooms.find((room) =>
    /(hallway|circulation|hall|landing|stair)/.test(
      String(room.type || room.id || ""),
    ),
  );

  if (circulationRoom) {
    const roomId = String(circulationRoom.id || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (positions[roomId]) {
      return roomId;
    }
  }

  return Object.keys(positions)[0] || null;
}

function floodFillReachability(positions, startId) {
  if (!startId || !positions[startId]) {
    return 0;
  }

  const visited = new Set([startId]);
  const queue = [startId];
  const ids = Object.keys(positions);

  while (queue.length > 0) {
    const currentId = queue.shift();
    const current = positions[currentId];

    ids.forEach((candidateId) => {
      if (visited.has(candidateId)) {
        return;
      }
      const candidate = positions[candidateId];
      if ((candidate.level ?? 0) !== (current.level ?? 0)) {
        return;
      }
      if (areAdjacent(current, candidate)) {
        visited.add(candidateId);
        queue.push(candidateId);
      }
    });
  }

  return visited.size;
}

function describeGrade(total) {
  if (total >= 80) return "A";
  if (total >= 60) return "B";
  if (total >= 40) return "C";
  return "D";
}

export function evaluateFloorPlan(spatialGraph, layout) {
  const rooms = flattenSpatialGraphRooms(spatialGraph);
  const envelope = spatialGraph?.building?.envelope || {};
  const roomPositions = buildRoomPositionMap(layout);
  const explanations = [];
  const scores = {};

  let adjacencyTotal = 0;
  let adjacencySatisfied = 0;
  const missedAdjacencies = [];
  rooms.forEach((room) => {
    const roomId = room.id;
    const roomPosition = roomPositions[roomId];
    (room.adjacencies || []).forEach((adjacentId) => {
      adjacencyTotal += 1;
      const adjacentPosition = roomPositions[adjacentId];
      if (
        roomPosition &&
        adjacentPosition &&
        areAdjacent(roomPosition, adjacentPosition)
      ) {
        adjacencySatisfied += 1;
      } else {
        missedAdjacencies.push(`${roomId} ↔ ${adjacentId}`);
      }
    });
  });
  scores.adjacency = Math.round(
    (adjacencySatisfied / Math.max(adjacencyTotal, 1)) * 25,
  );

  let proportionScore = 0;
  const positionedRooms = Object.values(roomPositions);
  positionedRooms.forEach((position) => {
    const ratio =
      Math.max(position.width, position.depth) /
      Math.max(Math.min(position.width, position.depth), 0.001);
    if (ratio <= 2) {
      proportionScore += 15 / Math.max(positionedRooms.length, 1);
    } else if (ratio <= 2.5) {
      proportionScore += 7.5 / Math.max(positionedRooms.length, 1);
    }
  });
  scores.proportions = Math.round(proportionScore);

  const startId = findCirculationSeed(rooms, roomPositions);
  const reachable = floodFillReachability(roomPositions, startId);
  scores.circulation = Math.round(
    (reachable / Math.max(positionedRooms.length, 1)) * 10,
  );

  let areaScore = 0;
  let largeAreaVarianceCount = 0;
  rooms.forEach((room) => {
    const position = roomPositions[room.id];
    if (!position) {
      return;
    }
    const actualArea = position.width * position.depth;
    const targetArea = Number(room.area_m2) || 0;
    const ratio = targetArea > 0 ? actualArea / targetArea : 0;
    if (ratio >= 0.85 && ratio <= 1.3) {
      areaScore += 15 / Math.max(rooms.length, 1);
    } else if (ratio >= 0.7) {
      areaScore += 7.5 / Math.max(rooms.length, 1);
    } else {
      largeAreaVarianceCount += 1;
    }
  });
  scores.area = Math.round(areaScore);

  let lightScore = 0;
  let lightRooms = 0;
  rooms.forEach((room) => {
    if (!room.natural_light) {
      return;
    }
    lightRooms += 1;
    if (hasExteriorWall(roomPositions[room.id], envelope)) {
      lightScore += 10;
    }
  });
  scores.light = Math.round(lightScore / Math.max(lightRooms, 1));

  // Wet-core clustering: penalize scattered wet rooms (10 pts)
  const levelGroups = {};
  positionedRooms.forEach((pos) => {
    const lvl = pos.level ?? 0;
    if (!levelGroups[lvl]) levelGroups[lvl] = [];
    levelGroups[lvl].push(pos);
  });

  let wetCoreScore = 10;
  let wetFloorCount = 0;
  for (const [, floorRooms] of Object.entries(levelGroups)) {
    const wetRooms = floorRooms.filter((r) => {
      const label = String(r.name || r.id || r.program || "");
      return WET_ROOM_RE.test(label);
    });
    if (wetRooms.length < 2) continue;
    wetFloorCount += 1;
    const cx =
      wetRooms.reduce((s, r) => s + r.x + r.width / 2, 0) / wetRooms.length;
    const cy =
      wetRooms.reduce((s, r) => s + r.y + r.depth / 2, 0) / wetRooms.length;
    const avgDist =
      wetRooms.reduce(
        (s, r) =>
          s + Math.hypot(r.x + r.width / 2 - cx, r.y + r.depth / 2 - cy),
        0,
      ) / wetRooms.length;
    if (avgDist > 5) wetCoreScore -= 10 / Math.max(wetFloorCount, 1);
    else if (avgDist > 3) wetCoreScore -= 5 / Math.max(wetFloorCount, 1);
  }
  scores.wetCore = Math.max(0, Math.round(wetCoreScore));

  // Privacy zone separation: penalize public rooms directly adjacent to private rooms (10 pts)
  let privacyViolations = 0;
  let privacyChecks = 0;
  for (const [, floorRooms] of Object.entries(levelGroups)) {
    const publicRooms = floorRooms.filter((r) => {
      const label = String(r.name || r.id || r.program || "");
      return (
        PUBLIC_ROOM_RE.test(label) &&
        !/(hall(way)?|landing|corridor)/i.test(label)
      );
    });
    const privateRooms = floorRooms.filter((r) => {
      const label = String(r.name || r.id || r.program || "");
      return PRIVATE_ROOM_RE.test(label);
    });
    for (const pub of publicRooms) {
      for (const priv of privateRooms) {
        privacyChecks += 1;
        if (areAdjacent(pub, priv)) {
          privacyViolations += 1;
        }
      }
    }
  }
  scores.privacy =
    privacyChecks > 0
      ? Math.round(10 * (1 - privacyViolations / privacyChecks))
      : 10;

  // Stair alignment: verify staircase position matches across floors (5 pts)
  const levelKeys = Object.keys(levelGroups);
  if (levelKeys.length > 1) {
    const stairsByLevel = {};
    for (const [lvl, floorRooms] of Object.entries(levelGroups)) {
      const stair = floorRooms.find((r) =>
        /(stair|staircase)/i.test(String(r.name || r.id || r.program || "")),
      );
      if (stair) stairsByLevel[lvl] = stair;
    }
    const stairLevels = Object.values(stairsByLevel);
    if (stairLevels.length >= 2) {
      const ref = stairLevels[0];
      const aligned = stairLevels.every(
        (s) =>
          Math.abs(s.x - ref.x) < 0.3 &&
          Math.abs(s.y - ref.y) < 0.3 &&
          Math.abs(s.width - ref.width) < 0.3 &&
          Math.abs(s.depth - ref.depth) < 0.3,
      );
      scores.stairAlignment = aligned ? 5 : 0;
    } else {
      // Missing stair on some floors
      scores.stairAlignment = stairLevels.length > 0 ? 2 : 5;
    }

    // Egress: every upper-floor bedroom must reach staircase via adjacency chain
    let egressOk = true;
    for (const [lvl, floorRooms] of Object.entries(levelGroups)) {
      if (Number(lvl) === 0) continue;
      const bedrooms = floorRooms.filter((r) =>
        PRIVATE_ROOM_RE.test(String(r.name || r.id || r.program || "")),
      );
      const stair = stairsByLevel[lvl];
      if (!stair || bedrooms.length === 0) continue;
      const stairId = String(stair.id || stair.name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      for (const bed of bedrooms) {
        const bedId = String(bed.id || bed.name || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        // BFS from bedroom to staircase on this floor
        const floorPositions = {};
        floorRooms.forEach((r) => {
          const key = String(r.id || r.name || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
          if (key) floorPositions[key] = r;
        });
        const visited = new Set([bedId]);
        const queue = [bedId];
        let found = false;
        while (queue.length > 0) {
          const cur = queue.shift();
          if (cur === stairId) {
            found = true;
            break;
          }
          for (const [cid, cpos] of Object.entries(floorPositions)) {
            if (visited.has(cid)) continue;
            if (areAdjacent(floorPositions[cur], cpos)) {
              visited.add(cid);
              queue.push(cid);
            }
          }
        }
        if (!found) egressOk = false;
      }
    }
    if (!egressOk && scores.stairAlignment > 0) {
      scores.stairAlignment = Math.max(0, scores.stairAlignment - 2);
    }
  } else {
    scores.stairAlignment = 5; // single floor, no alignment needed
  }

  scores.total =
    scores.adjacency +
    scores.proportions +
    scores.circulation +
    scores.area +
    scores.light +
    scores.wetCore +
    scores.privacy +
    scores.stairAlignment;
  scores.grade = describeGrade(scores.total);

  if (scores.adjacency < 18 && missedAdjacencies.length > 0) {
    explanations.push(
      `Adjacency: ${missedAdjacencies.slice(0, 3).join(", ")} not satisfied.`,
    );
  }
  if (scores.proportions < 9) {
    explanations.push(
      "Room proportions: one or more rooms are too elongated for comfortable use.",
    );
  }
  if (scores.circulation < 9) {
    explanations.push(
      "Circulation: not all rooms are reachable from the main circulation spine.",
    );
  }
  if (scores.area < 9 && largeAreaVarianceCount > 0) {
    explanations.push(
      "Area compliance: some rooms undershoot their target areas by more than 30%.",
    );
  }
  if (scores.light < 6) {
    explanations.push(
      "Natural light: at least one daylight-dependent room lacks exterior wall access.",
    );
  }
  if (scores.wetCore < 6) {
    explanations.push(
      "Wet-core clustering: bathrooms, WC, and kitchen are too scattered — cluster wet rooms near a shared plumbing stack.",
    );
  }
  if (scores.privacy < 6) {
    explanations.push(
      "Privacy zones: bedrooms directly adjoin public rooms (living, kitchen, dining) — use a hallway or landing as buffer.",
    );
  }
  if (scores.stairAlignment < 3) {
    explanations.push(
      "Stair alignment: staircase position does not match across floors, or upper-floor bedrooms cannot reach the staircase.",
    );
  }

  return {
    ...scores,
    explanations,
    details: {
      adjacencySatisfied,
      adjacencyTotal,
      reachableRooms: reachable,
      totalRooms: positionedRooms.length,
      missedAdjacencies,
    },
  };
}

export default {
  areAdjacent,
  evaluateFloorPlan,
};
