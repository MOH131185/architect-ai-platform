import {
  CANONICAL_GEOMETRY_ENTITY_COLLECTIONS,
  CANONICAL_PROJECT_GEOMETRY_DEFINITIONS,
  CANONICAL_PROJECT_GEOMETRY_VERSION,
} from "./projectGeometrySchema.js";

function hasRequiredFields(value = {}, fields = []) {
  return fields.filter((field) => !(field in value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function entityLabel(collectionName) {
  const overrides = {
    circulation: "circulation path",
    stairs: "stair",
    columns: "column",
    beams: "beam",
    slabs: "slab",
    elevations: "elevation",
    sections: "section",
    annotations: "annotation",
  };

  return overrides[collectionName] || collectionName.replace(/s$/, "");
}

function hasFiniteBounds(bbox = {}) {
  return ["min_x", "min_y", "max_x", "max_y", "width", "height"].every((key) =>
    Number.isFinite(Number(bbox?.[key])),
  );
}

function hasFinitePoint(point = {}) {
  return ["x", "y"].every((key) => Number.isFinite(Number(point?.[key])));
}

function validateLevels(levels = []) {
  const errors = [];
  const seenNumbers = new Set();

  levels.forEach((level, index) => {
    const missingLevelFields = hasRequiredFields(
      level,
      CANONICAL_PROJECT_GEOMETRY_DEFINITIONS.level,
    );
    missingLevelFields.forEach((field) => {
      errors.push(`levels[${index}] is missing "${field}".`);
    });

    if (!Number.isFinite(Number(level.level_number))) {
      errors.push(
        `level "${level.id || index}" is missing a numeric level_number.`,
      );
    } else if (seenNumbers.has(Number(level.level_number))) {
      errors.push(
        `levels contains duplicate level_number "${level.level_number}".`,
      );
    } else {
      seenNumbers.add(Number(level.level_number));
    }
  });

  return errors;
}

function validateSite(site = {}) {
  const errors = [];
  if (!site?.id) {
    errors.push("site.id is required.");
  }
  if (!site?.boundary_polygon?.length) {
    errors.push("site.boundary_polygon is required.");
  }
  if (!site?.buildable_polygon?.length) {
    errors.push("site.buildable_polygon is required.");
  }
  if (!hasFiniteBounds(site?.boundary_bbox)) {
    errors.push("site.boundary_bbox must contain finite bounds.");
  }
  if (!hasFiniteBounds(site?.buildable_bbox)) {
    errors.push("site.buildable_bbox must contain finite bounds.");
  }
  return errors;
}

function validateEntityShape(records = [], collectionName) {
  const errors = [];

  records.forEach((record, index) => {
    if (!record?.id) {
      return;
    }

    if (
      [
        "rooms",
        "walls",
        "doors",
        "windows",
        "stairs",
        "circulation",
        "columns",
        "beams",
        "slabs",
      ].includes(collectionName) &&
      !record.level_id
    ) {
      errors.push(`${collectionName}[${index}] is missing level_id.`);
    }

    if (collectionName === "rooms" && !hasFiniteBounds(record.bbox)) {
      errors.push(`room "${record.id}" must define a finite bbox.`);
    }
    if (collectionName === "walls") {
      if (!hasFinitePoint(record.start) || !hasFinitePoint(record.end)) {
        errors.push(
          `wall "${record.id}" must define start and end coordinates.`,
        );
      }
      if (!Number.isFinite(Number(record.length_m)) || record.length_m <= 0) {
        errors.push(`wall "${record.id}" must define a positive length_m.`);
      }
      if (!hasFiniteBounds(record.bbox)) {
        errors.push(`wall "${record.id}" must define a finite bbox.`);
      }
    }
    if (["doors", "windows"].includes(collectionName)) {
      if (!record.wall_id) {
        errors.push(
          `${entityLabel(collectionName)} "${record.id}" is missing wall_id.`,
        );
      }
      if (!hasFinitePoint(record.position_m)) {
        errors.push(
          `${entityLabel(collectionName)} "${record.id}" must define a finite position_m.`,
        );
      }
    }
    if (collectionName === "footprints" && !record.polygon?.length) {
      errors.push(`footprint "${record.id}" must define polygon.`);
    }
  });

  return errors;
}

function validateCollectionIds(records = [], collectionName) {
  const seen = new Set();
  const errors = [];

  records.forEach((record, index) => {
    if (!record?.id) {
      errors.push(`${collectionName}[${index}] is missing id.`);
      return;
    }

    if (seen.has(record.id)) {
      errors.push(`${collectionName} contains duplicate id "${record.id}".`);
    }
    seen.add(record.id);
  });

  return errors;
}

export function validateProjectGeometrySchema(geometry = {}) {
  const errors = [];
  const warnings = [];

  if (geometry.schema_version !== CANONICAL_PROJECT_GEOMETRY_VERSION) {
    errors.push(
      `schema_version must be "${CANONICAL_PROJECT_GEOMETRY_VERSION}".`,
    );
  }

  if (!geometry.project_id) {
    errors.push("project_id is required.");
  }

  const missingProjectFields = hasRequiredFields(
    geometry,
    CANONICAL_PROJECT_GEOMETRY_DEFINITIONS.project,
  );
  missingProjectFields.forEach((field) => {
    errors.push(`project geometry is missing "${field}".`);
  });

  CANONICAL_GEOMETRY_ENTITY_COLLECTIONS.forEach((collectionName) => {
    if (!Array.isArray(geometry[collectionName])) {
      errors.push(`${collectionName} must be an array.`);
      return;
    }

    errors.push(
      ...validateCollectionIds(geometry[collectionName], collectionName),
    );
    errors.push(
      ...validateEntityShape(geometry[collectionName], collectionName),
    );
  });

  if (!isPlainObject(geometry.site)) {
    errors.push("site must be an object.");
  } else {
    errors.push(...validateSite(geometry.site));
  }

  if (!isPlainObject(geometry.metadata)) {
    errors.push("metadata must be an object.");
  }
  if (!isPlainObject(geometry.provenance)) {
    errors.push("provenance must be an object.");
  }
  if (geometry.roof !== null && !isPlainObject(geometry.roof)) {
    errors.push("roof must be null or an object.");
  }
  if (!geometry.levels?.length) {
    warnings.push("geometry has no levels.");
  }
  errors.push(...validateLevels(geometry.levels || []));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateEntityReferences(geometry = {}) {
  const errors = [];
  const levelIds = new Set((geometry.levels || []).map((level) => level.id));
  const idSets = Object.fromEntries(
    CANONICAL_GEOMETRY_ENTITY_COLLECTIONS.map((collectionName) => [
      collectionName,
      new Set((geometry[collectionName] || []).map((record) => record.id)),
    ]),
  );

  [
    "rooms",
    "walls",
    "doors",
    "windows",
    "stairs",
    "circulation",
    "columns",
    "beams",
    "slabs",
  ].forEach((collectionName) => {
    (geometry[collectionName] || []).forEach((record) => {
      if (record.level_id && !levelIds.has(record.level_id)) {
        errors.push(
          `${entityLabel(collectionName)} "${record.id}" references missing level "${record.level_id}".`,
        );
      }
    });
  });

  (geometry.levels || []).forEach((level) => {
    [
      ["room_ids", "rooms"],
      ["wall_ids", "walls"],
      ["door_ids", "doors"],
      ["window_ids", "windows"],
      ["stair_ids", "stairs"],
      ["circulation_ids", "circulation"],
      ["column_ids", "columns"],
      ["beam_ids", "beams"],
      ["slab_ids", "slabs"],
    ].forEach(([referenceKey, collectionName]) => {
      (level[referenceKey] || []).forEach((entityId) => {
        if (!idSets[collectionName]?.has(entityId)) {
          errors.push(
            `level "${level.id}" references missing ${collectionName} id "${entityId}".`,
          );
        }
      });
    });
  });

  (geometry.doors || []).forEach((door) => {
    if (door.wall_id && !idSets.walls?.has(door.wall_id)) {
      errors.push(
        `door "${door.id}" references missing wall "${door.wall_id}".`,
      );
    }
    (door.room_ids || []).forEach((roomId) => {
      if (!idSets.rooms?.has(roomId)) {
        errors.push(`door "${door.id}" references missing room "${roomId}".`);
      }
    });
  });

  (geometry.windows || []).forEach((window) => {
    if (window.wall_id && !idSets.walls?.has(window.wall_id)) {
      errors.push(
        `window "${window.id}" references missing wall "${window.wall_id}".`,
      );
    }
    (window.room_ids || []).forEach((roomId) => {
      if (!idSets.rooms?.has(roomId)) {
        errors.push(
          `window "${window.id}" references missing room "${roomId}".`,
        );
      }
    });
  });

  (geometry.walls || []).forEach((wall) => {
    (wall.room_ids || []).forEach((roomId) => {
      if (!idSets.rooms?.has(roomId)) {
        errors.push(`wall "${wall.id}" references missing room "${roomId}".`);
      }
    });
  });

  (geometry.stairs || []).forEach((stair) => {
    if (
      stair.connects_to_level !== null &&
      stair.connects_to_level !== undefined &&
      !(geometry.levels || []).some(
        (level) =>
          Number(level.level_number) === Number(stair.connects_to_level),
      )
    ) {
      errors.push(
        `stair "${stair.id}" connects_to_level "${stair.connects_to_level}" which does not exist.`,
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

export default {
  validateProjectGeometrySchema,
  validateEntityReferences,
};
