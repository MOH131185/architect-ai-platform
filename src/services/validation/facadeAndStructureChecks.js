import { evaluateSpanSanity } from "../structure/spanSanityService.js";
import { validateStackedSupports } from "../structure/stackedSupportValidator.js";
import { validateStructuralAlignment } from "../structure/structuralAlignmentValidator.js";

function exteriorWallLengthBySide(projectGeometry = {}) {
  return (projectGeometry.walls || [])
    .filter((wall) => wall.exterior)
    .reduce((accumulator, wall) => {
      const side = wall.metadata?.side || wall.side || "unknown";
      accumulator[side] =
        Number(accumulator[side] || 0) + Number(wall.length_m || 0);
      return accumulator;
    }, {});
}

export function runFacadeAndStructureChecks({
  projectGeometry,
  facadeGrammar = null,
  structuralGrid = null,
} = {}) {
  const warnings = [];
  const errors = [];
  const repairHints = [];
  const affectedEntities = [];
  const wallLengths = exteriorWallLengthBySide(projectGeometry);

  if (facadeGrammar) {
    (facadeGrammar.orientations || []).forEach((orientation) => {
      const sideWallLength = Number(wallLengths[orientation.side] || 0);
      if (sideWallLength > 4 && !orientation.opening_rhythm?.opening_count) {
        warnings.push(
          `facade "${orientation.side}" has no window rhythm defined.`,
        );
        affectedEntities.push(`facade:${orientation.side}`);
      }
      if (
        Number.isFinite(Number(orientation.solid_void_ratio)) &&
        orientation.solid_void_ratio < 0.2
      ) {
        warnings.push(
          `facade "${orientation.side}" has an unusually open solid/void ratio.`,
        );
        affectedEntities.push(`facade:${orientation.side}`);
      }
      if (
        Number.isFinite(Number(orientation.solid_void_ratio)) &&
        Number.isFinite(Number(orientation.target_solid_void_ratio)) &&
        Math.abs(
          Number(orientation.solid_void_ratio) -
            Number(orientation.target_solid_void_ratio),
        ) > 0.18
      ) {
        warnings.push(
          `facade "${orientation.side}" diverges materially from its target solid/void ratio.`,
        );
        repairHints.push(
          `Adjust openings or solid wall extents on the ${orientation.side} facade to move toward the target solid/void ratio.`,
        );
        affectedEntities.push(`facade:${orientation.side}`);
      }
      if (
        Array.isArray(orientation.window_grouping) &&
        orientation.window_grouping.length !==
          Number(orientation.opening_rhythm?.opening_count || 0)
      ) {
        warnings.push(
          `facade "${orientation.side}" has inconsistent window grouping metadata.`,
        );
        affectedEntities.push(`facade:${orientation.side}`);
      }
      if (!orientation.components?.bays?.length) {
        warnings.push(
          `facade "${orientation.side}" is missing assembled bay components.`,
        );
        affectedEntities.push(`facade:${orientation.side}`);
      }
    });
  }

  if (structuralGrid) {
    const structural = validateStructuralAlignment(
      projectGeometry,
      structuralGrid,
    );
    const supportStack = validateStackedSupports(projectGeometry);
    const spanSanity = evaluateSpanSanity(projectGeometry, structuralGrid);
    warnings.push(...(structural.warnings || []));
    warnings.push(...(supportStack.warnings || []));
    warnings.push(...(spanSanity.warnings || []));
    errors.push(...(structural.errors || []));
    errors.push(...(supportStack.errors || []));
    errors.push(...(spanSanity.errors || []));
    repairHints.push(...(structural.repairHints || []));
    affectedEntities.push(...(structural.affectedEntities || []));
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    repairHints: [...new Set(repairHints)],
    affectedEntities: [...new Set(affectedEntities.filter(Boolean))],
  };
}

export default {
  runFacadeAndStructureChecks,
};
