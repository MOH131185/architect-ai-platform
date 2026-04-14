function buildMapById(items = []) {
  return new Map((items || []).map((item) => [item.id, item]));
}

function diffCollection(previous = [], next = []) {
  const previousMap = buildMapById(previous);
  const nextMap = buildMapById(next);
  const added = [];
  const removed = [];
  const updated = [];

  nextMap.forEach((value, key) => {
    if (!previousMap.has(key)) {
      added.push(key);
      return;
    }
    if (JSON.stringify(previousMap.get(key)) !== JSON.stringify(value)) {
      updated.push(key);
    }
  });

  previousMap.forEach((_, key) => {
    if (!nextMap.has(key)) {
      removed.push(key);
    }
  });

  return { added, removed, updated };
}

export function buildEditDiff(previousGeometry = {}, nextGeometry = {}) {
  const collections = [
    "levels",
    "rooms",
    "walls",
    "doors",
    "windows",
    "stairs",
    "circulation",
    "columns",
    "beams",
    "slabs",
  ];

  const entityDiffs = Object.fromEntries(
    collections.map((collection) => [
      collection,
      diffCollection(
        previousGeometry[collection] || [],
        nextGeometry[collection] || [],
      ),
    ]),
  );

  return {
    entityDiffs,
    metadataChanged:
      JSON.stringify(previousGeometry.metadata || {}) !==
      JSON.stringify(nextGeometry.metadata || {}),
  };
}

export default {
  buildEditDiff,
};
