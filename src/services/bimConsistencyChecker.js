export function check3Dvs2DConsistency({ masterDNA }) {
  const issues = [];
  const dna = masterDNA || {};

  const planWindows = Array.isArray(dna.planWindows) ? dna.planWindows : [];
  const elevationWindows = Array.isArray(dna.elevationWindows) ? dna.elevationWindows : [];
  const threeDWindows = Array.isArray(dna.view3DWindows) ? dna.view3DWindows : [];

  if (planWindows.length && elevationWindows.length &&
      Math.abs(planWindows.length - elevationWindows.length) > 2) {
    issues.push('Window count mismatch between plans and elevations.');
  }

  if (threeDWindows.length &&
      Math.abs(threeDWindows.length - elevationWindows.length) > 3) {
    issues.push('3D window count does not match elevations.');
  }

  if (dna.massing?.volume2D && dna.massing?.volume3D) {
    const delta = Math.abs(dna.massing.volume2D - dna.massing.volume3D);
    const ratio = delta / Math.max(dna.massing.volume2D, 1);
    if (ratio > 0.1) {
      issues.push('3D massing volume differs from 2D-derived volume by >10%.');
    }
  }

  return issues;
}

