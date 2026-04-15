import { buildSupportPaths } from "./supportPathService.js";

function distance(a = {}, b = {}) {
  return Math.hypot(
    Number(a.x || 0) - Number(b.x || 0),
    Number(a.y || 0) - Number(b.y || 0),
  );
}

export function validateStackedSupports(projectGeometry = {}) {
  const supportPaths = buildSupportPaths(projectGeometry);
  const warnings = [];
  const levels = [...(projectGeometry.levels || [])].sort(
    (left, right) =>
      Number(left.level_number || 0) - Number(right.level_number || 0),
  );

  levels.slice(1).forEach((level) => {
    const currentSupports = supportPaths.filter(
      (path) => path.level_id === level.id,
    );
    const belowLevel = levels.find(
      (entry) =>
        Number(entry.level_number || 0) === Number(level.level_number || 0) - 1,
    );
    const belowSupports = supportPaths.filter(
      (path) => path.level_id === belowLevel?.id,
    );

    currentSupports.forEach((support) => {
      if (!belowSupports.length) return;
      const nearest = belowSupports
        .map((candidate) => distance(support.centroid, candidate.centroid))
        .sort((left, right) => left - right)[0];
      if (nearest > 1.6) {
        warnings.push(
          `support path "${support.id}" is offset ${nearest.toFixed(2)}m from the level below.`,
        );
      }
    });
  });

  return {
    valid: true,
    warnings,
    errors: [],
    supportPaths,
  };
}

export default {
  validateStackedSupports,
};
