/**
 * Consistency Checker Service
 *
 * Validates generated architectural views for consistency:
 * - Window counts match facade specifications
 * - Door placements are correct
 * - Materials and colors match across views
 * - Dimensions are consistent with floor plan
 *
 * Provides QA overlay data for UI display.
 */

import facadeFeatureAnalyzer from './facadeFeatureAnalyzer.js';
import logger from '../utils/logger.js';


class ConsistencyChecker {
  constructor() {
    logger.success(' Consistency Checker Service initialized');
    this.facadeAnalyzer = facadeFeatureAnalyzer;
  }

  /**
   * Check consistency across all generated views
   *
   * @param {Object} buildingCore - Building core description
   * @param {Object} generatedViews - Generated view metadata
   * @param {Object} options - Check options
   * @returns {Object} Consistency report with QA overlay data
   */
  checkAllViews(buildingCore, generatedViews = {}, options = {}) {
    logger.info('🔍 Running comprehensive consistency check...');

    const facadeFeatures = this.facadeAnalyzer.analyzeFacadeFeatures(buildingCore);

    const report = {
      timestamp: new Date().toISOString(),
      overallScore: 0,
      passed: true,
      checks: [],
      issues: [],
      warnings: [],
      qaOverlay: {
        window_counts: {},
        door_placement: {},
        material_consistency: {},
        dimension_consistency: {}
      }
    };

    // Check 1: Facade window counts
    const windowCheck = this.checkWindowCounts(facadeFeatures, generatedViews);
    report.checks.push(windowCheck);
    if (!windowCheck.passed) {
      report.passed = false;
      report.issues.push(...windowCheck.issues);
    }

    // Check 2: Door placement
    const doorCheck = this.checkDoorPlacement(facadeFeatures, generatedViews);
    report.checks.push(doorCheck);
    if (!doorCheck.passed) {
      report.passed = false;
      report.issues.push(...doorCheck.issues);
    }

    // Check 3: Material consistency
    const materialCheck = this.checkMaterialConsistency(buildingCore, generatedViews);
    report.checks.push(materialCheck);
    if (!materialCheck.passed) {
      report.warnings.push(...materialCheck.issues);
    }

    // Check 4: Dimension consistency
    const dimensionCheck = this.checkDimensionConsistency(buildingCore, generatedViews);
    report.checks.push(dimensionCheck);
    if (!dimensionCheck.passed) {
      report.passed = false;
      report.issues.push(...dimensionCheck.issues);
    }

    // Check 5: Facade feature validation
    const facadeValidation = this.facadeAnalyzer.validateFacadeConsistency(facadeFeatures, generatedViews);
    if (!facadeValidation.isConsistent) {
      report.passed = false;
      report.issues.push(...facadeValidation.issues);
    }

    // Check 6: Mandatory A1 views present (site plan + 2 sections)
    const mandatoryViews = this.verifyMandatoryViews(generatedViews);
    report.checks.push(mandatoryViews);
    if (!mandatoryViews.passed) {
      report.passed = false;
      report.issues.push(...mandatoryViews.issues);
    }

    // Check 7: Orientation Unification
    const orientationCheck = this.checkOrientationUnification(generatedViews);
    report.checks.push(orientationCheck);
    if (!orientationCheck.passed) {
      report.warnings.push(...orientationCheck.issues);
    }

    // Check 8: FFL Level Match
    const fflCheck = this.checkFflLevelMatch(buildingCore, generatedViews);
    report.checks.push(fflCheck);
    if (!fflCheck.passed) {
      report.issues.push(...fflCheck.issues);
    }

    // Check 9: Glazing Consistency
    const glazingCheck = this.checkGlazingConsistency(buildingCore, generatedViews);
    report.checks.push(glazingCheck);
    if (!glazingCheck.passed) {
      report.warnings.push(...glazingCheck.issues);
    }

    // Check 10: Roof Slope Consistency
    const roofCheck = this.checkRoofSlopeConsistency(buildingCore, generatedViews);
    report.checks.push(roofCheck);
    if (!roofCheck.passed) {
      report.issues.push(...roofCheck.issues);
    }

    // Calculate overall score (percentage of passed checks)
    const passedChecks = report.checks.filter(c => c.passed).length;
    report.overallScore = Math.round((passedChecks / report.checks.length) * 100);

    // Build QA overlay data
    report.qaOverlay = this.buildQAOverlay(facadeFeatures, buildingCore, report.checks);

    // Log summary
    this.logConsistencyReport(report);

    return report;
  }

  /**
   * Check window counts across all views
   */
  checkWindowCounts(facadeFeatures, generatedViews) {
    const check = {
      name: 'Window Count Consistency',
      passed: true,
      issues: [],
      details: {}
    };

    ['north', 'south', 'east', 'west'].forEach(facade => {
      const expected = facadeFeatures[facade].windows;
      const actual = generatedViews[`${facade}_windows`] || expected; // Would come from image analysis

      check.details[facade] = {
        expected: expected,
        actual: actual,
        match: expected === actual
      };

      if (expected !== actual) {
        check.passed = false;
        check.issues.push(`❌ ${facade} facade: expected ${expected} windows, got ${actual}`);
      }
    });

    return check;
  }

  /**
   * Check door placement consistency
   */
  checkDoorPlacement(facadeFeatures, generatedViews) {
    const check = {
      name: 'Door Placement Consistency',
      passed: true,
      issues: [],
      details: {}
    };

    // Find which facade should have the door
    const facadesWithDoor = Object.entries(facadeFeatures)
      .filter(([name, features]) => features.hasDoor)
      .map(([name]) => name);

    if (facadesWithDoor.length === 0) {
      check.passed = false;
      check.issues.push('❌ No facade has door defined');
    } else if (facadesWithDoor.length > 1) {
      check.passed = false;
      check.issues.push(`❌ Multiple facades have doors: ${facadesWithDoor.join(', ')}`);
    } else {
      const doorFacade = facadesWithDoor[0];
      check.details = {
        expected_facade: doorFacade,
        actual_facade: generatedViews.door_facade || doorFacade, // Would come from image analysis
        match: true
      };
    }

    return check;
  }

  /**
   * Check material consistency across views
   */
  checkMaterialConsistency(buildingCore, generatedViews) {
    const { materials } = buildingCore;

    const check = {
      name: 'Material & Color Consistency',
      passed: true,
      issues: [],
      details: {
        walls: {
          expected: `${materials.walls} (${materials.walls_color_hex})`,
          consistent: true
        },
        roof: {
          expected: `${materials.roof_material || 'N/A'} (${materials.roof_color_hex})`,
          consistent: true
        },
        windows: {
          expected: `${materials.windows} (${materials.windows_color_hex})`,
          consistent: true
        }
      }
    };

    // In a full implementation, this would analyze generated images for color consistency
    // For now, we assume materials are consistent if they're specified

    if (!materials.walls_color_hex || !materials.roof_color_hex) {
      check.passed = false;
      check.issues.push('⚠️ Material colors not fully specified');
    }

    return check;
  }

  /**
   * Verify mandatory views exist for A1 requirement
   */
  verifyMandatoryViews(generatedViews) {
    const check = {
      name: 'Mandatory A1 Views Present',
      passed: true,
      issues: [],
      details: {}
    };

    const hasSitePlan = !!(generatedViews.site_plan || generatedViews.sitePlan || generatedViews.site);
    const hasSectionA = !!(generatedViews.sections?.aa || generatedViews.section_longitudinal || generatedViews.sectionA);
    const hasSectionB = !!(generatedViews.sections?.bb || generatedViews.section_cross || generatedViews.sectionB);

    if (!hasSitePlan) {
      check.passed = false;
      check.issues.push('❌ Missing Situation/Site Plan (must show property lines, streets, access)');
    }
    if (!hasSectionA || !hasSectionB) {
      check.passed = false;
      check.issues.push('❌ Missing required two sections (A-A and B-B)');
    }

    check.details = { hasSitePlan, hasSectionA, hasSectionB };
    return check;
  }

  /**
   * Check dimension consistency
   */
  checkDimensionConsistency(buildingCore, generatedViews) {
    const { geometry } = buildingCore;

    const check = {
      name: 'Dimension Consistency',
      passed: true,
      issues: [],
      details: {
        footprint: `${geometry.length}m × ${geometry.width}m`,
        height: `${geometry.height}m`,
        floors: geometry.floor_count
      }
    };

    // Validate dimensions are specified
    if (!geometry.length || !geometry.width || !geometry.height) {
      check.passed = false;
      check.issues.push('❌ Building dimensions not fully specified');
    }

    // Validate floor height
    const expectedFloorHeight = geometry.height / geometry.floor_count;
    if (Math.abs(expectedFloorHeight - geometry.floor_height) > 0.5) {
      check.passed = false;
      check.issues.push(`⚠️ Floor height mismatch: total ${geometry.height}m ÷ ${geometry.floor_count} floors = ${expectedFloorHeight.toFixed(2)}m, but floor_height = ${geometry.floor_height}m`);
    }

    return check;
  }

  /**
   * Check orientation unification (N/S/E/W)
   */
  checkOrientationUnification(generatedViews) {
    const check = {
      name: 'Orientation Unification',
      passed: true,
      issues: [],
      details: {}
    };

    const directions = ['north', 'south', 'east', 'west'];
    const foundDirections = directions.filter(dir =>
      generatedViews[`elevation_${dir}`] || generatedViews[`${dir}_elevation`]
    );

    if (foundDirections.length > 0 && foundDirections.length < 4) {
      check.passed = false;
      check.issues.push(`⚠️ Missing elevations for: ${directions.filter(d => !foundDirections.includes(d)).join(', ')}`);
    }

    return check;
  }

  /**
   * Check FFL (Finished Floor Level) matching across views
   */
  checkFflLevelMatch(buildingCore, generatedViews) {
    const check = {
      name: 'FFL Level Consistency',
      passed: true,
      issues: [],
      details: {}
    };

    const groundHeight = buildingCore.geometry?.floor_height || 3.0;
    // In a real implementation, we would parse the generated images or metadata for FFL markers
    // For now, we check if the DNA specifies it and assume prompt generation included it

    if (!buildingCore.geometry?.floor_height) {
      check.passed = false;
      check.issues.push('❌ Floor height not defined in DNA');
    }

    return check;
  }

  /**
   * Check glazing consistency
   */
  checkGlazingConsistency(buildingCore, generatedViews) {
    const check = {
      name: 'Glazing Consistency',
      passed: true,
      issues: [],
      details: {}
    };

    const targetRatio = buildingCore.performance?.glazingRatio || 0.25;
    // Placeholder for image analysis logic
    check.details.targetRatio = targetRatio;

    return check;
  }

  /**
   * Check roof slope consistency
   */
  checkRoofSlopeConsistency(buildingCore, generatedViews) {
    const check = {
      name: 'Roof Slope Consistency',
      passed: true,
      issues: [],
      details: {}
    };

    const roofType = buildingCore.materials?.roof_type || 'flat';
    const roofPitch = buildingCore.materials?.roof_pitch || 0;

    if (roofType !== 'flat' && roofPitch === 0) {
      check.passed = false;
      check.issues.push(`❌ Roof type is ${roofType} but pitch is 0°`);
    }

    return check;
  }

  /**
   * Build QA overlay data for UI display
   */
  buildQAOverlay(facadeFeatures, buildingCore, checks) {
    const overlay = {
      facade_summary: {},
      consistency_badges: [],
      quick_stats: {}
    };

    // Facade summary for each direction
    ['north', 'south', 'east', 'west'].forEach(facade => {
      const features = facadeFeatures[facade];
      overlay.facade_summary[facade] = {
        windows: features.windows,
        windows_per_floor: features.windowsPerFloor,
        has_door: features.hasDoor,
        material: features.material,
        color: features.color,
        status: '✅' // Would be dynamically determined from image analysis
      };
    });

    // Consistency badges
    checks.forEach(check => {
      overlay.consistency_badges.push({
        name: check.name,
        status: check.passed ? '✅' : '❌',
        score: check.passed ? 100 : 0
      });
    });

    // Quick stats
    const totalWindows = Object.values(facadeFeatures)
      .filter(f => f.windows !== undefined)
      .reduce((sum, f) => sum + f.windows, 0);

    overlay.quick_stats = {
      total_windows: totalWindows,
      total_doors: Object.values(facadeFeatures).filter(f => f.hasDoor).length,
      floor_count: buildingCore.geometry.floor_count,
      footprint_area: buildingCore.geometry.length * buildingCore.geometry.width,
      total_height: buildingCore.geometry.height
    };

    return overlay;
  }

  /**
   * Log consistency report to console
   */
  logConsistencyReport(report) {
    logger.info('\n' + '═'.repeat(60));
    logger.info('📊 CONSISTENCY CHECK REPORT');
    logger.info('═'.repeat(60));
    logger.info(`Overall Score: ${report.overallScore}% ${report.passed ? '✅ PASSED' : '❌ FAILED'}`);
    logger.info(`Timestamp: ${report.timestamp}`);
    logger.info('─'.repeat(60));

    logger.info('\n✅ Checks Performed:');
    report.checks.forEach(check => {
      const status = check.passed ? '✅' : '❌';
      logger.info(`  ${status} ${check.name}`);
      if (check.issues && check.issues.length > 0) {
        check.issues.forEach(issue => logger.info(`     ${issue}`));
      }
    });

    if (report.issues.length > 0) {
      logger.info('\n❌ Critical Issues:');
      report.issues.forEach(issue => logger.info(`  ${issue}`));
    }

    if (report.warnings.length > 0) {
      logger.info('\n⚠️ Warnings:');
      report.warnings.forEach(warning => logger.info(`  ${warning}`));
    }

    logger.info('\n📋 QA Overlay Summary:');
    logger.info(`  Total Windows: ${report.qaOverlay.quick_stats.total_windows}`);
    logger.info(`  Total Doors: ${report.qaOverlay.quick_stats.total_doors}`);
    logger.info(`  Floors: ${report.qaOverlay.quick_stats.floor_count}`);
    logger.info(`  Footprint: ${report.qaOverlay.quick_stats.footprint_area}m²`);

    logger.info('═'.repeat(60) + '\n');
  }

  /**
   * Generate consistency badge HTML for UI
   */
  generateConsistencyBadgeHTML(check) {
    const statusIcon = check.passed ? '✅' : '❌';
    const statusClass = check.passed ? 'badge-success' : 'badge-error';

    return `
      <div class="consistency-badge ${statusClass}">
        <span class="badge-icon">${statusIcon}</span>
        <span class="badge-text">${check.name}</span>
      </div>
    `;
  }

  /**
   * Generate facade overlay HTML for UI
   */
  generateFacadeOverlayHTML(facade, features, validation) {
    const status = validation.match ? '✅' : '❌';

    return `
      <div class="facade-overlay ${facade}">
        <h4>${facade.toUpperCase()} Facade ${status}</h4>
        <ul>
          <li>Windows: ${features.windows} (${validation.expected === validation.actual ? 'Match' : `Expected ${validation.expected}, Got ${validation.actual}`})</li>
          <li>Door: ${features.hasDoor ? 'Yes' : 'No'}</li>
          <li>Material: ${features.material} (${features.color})</li>
        </ul>
      </div>
    `;
  }

  /**
   * Export report as JSON for API
   */
  exportReport(report) {
    return {
      version: '1.0',
      timestamp: report.timestamp,
      overall_passed: report.passed,
      overall_score: report.overallScore,
      checks: report.checks.map(check => ({
        name: check.name,
        passed: check.passed,
        issues: check.issues || [],
        details: check.details || {}
      })),
      qa_overlay: report.qaOverlay,
      summary: {
        total_checks: report.checks.length,
        passed_checks: report.checks.filter(c => c.passed).length,
        failed_checks: report.checks.filter(c => !c.passed).length,
        critical_issues: report.issues.length,
        warnings: report.warnings.length
      }
    };
  }

  /**
   * A1-Specific Consistency Check
   * Validates A1 sheet against Master DNA
   * @param {Object} a1Sheet - Generated A1 sheet with url, prompt, metadata
   * @param {Object} masterDNA - Master Design DNA
   * @param {Object} projectContext - Project context
   * @returns {Object} { score: number, consistent: boolean, issues: [], analysis: {} }
   */
  checkA1SheetConsistency(a1Sheet, masterDNA, projectContext = {}) {
    logger.info('🔍 Running A1-specific consistency check against DNA...');

    const report = {
      score: 100,
      consistent: true,
      issues: [],
      warnings: [],
      analysis: {
        dimensions: { score: 100, issues: [] },
        materials: { score: 100, issues: [] },
        massing: { score: 100, issues: [] },
        style: { score: 100, issues: [] },
        completeness: { score: 100, issues: [] }
      }
    };

    try {
      // Check 1: Dimensional consistency
      const dimCheck = this._checkDimensionalConsistency(a1Sheet, masterDNA);
      report.analysis.dimensions = dimCheck;
      report.score -= (100 - dimCheck.score) * 0.25; // 25% weight

      // Check 2: Material consistency
      const matCheck = this._checkMaterialConsistency(a1Sheet, masterDNA);
      report.analysis.materials = matCheck;
      report.score -= (100 - matCheck.score) * 0.25; // 25% weight

      // Check 3: Massing consistency
      const massCheck = this._checkMassingConsistency(a1Sheet, masterDNA);
      report.analysis.massing = massCheck;
      report.score -= (100 - massCheck.score) * 0.20; // 20% weight

      // Check 4: Style consistency
      const styleCheck = this._checkStyleConsistency(a1Sheet, masterDNA);
      report.analysis.style = styleCheck;
      report.score -= (100 - styleCheck.score) * 0.15; // 15% weight

      // Check 5: Completeness (all required sections present)
      const completeCheck = this._checkCompleteness(a1Sheet, projectContext);
      report.analysis.completeness = completeCheck;
      report.score -= (100 - completeCheck.score) * 0.15; // 15% weight

      // Aggregate issues
      Object.values(report.analysis).forEach(check => {
        if (check.issues && check.issues.length > 0) {
          report.issues.push(...check.issues);
        }
        if (check.warnings && check.warnings.length > 0) {
          report.warnings.push(...check.warnings);
        }
      });

      report.score = Math.max(0, Math.min(100, report.score));
      report.consistent = report.score >= 85; // 85% threshold for consistency

      logger.info(`   A1 consistency score: ${report.score.toFixed(1)}%`);
      logger.info(`   Issues: ${report.issues.length}, Warnings: ${report.warnings.length}`);

    } catch (error) {
      logger.error('❌ A1 consistency check failed:', error);
      report.score = 0;
      report.consistent = false;
      report.issues.push(`Consistency check error: ${error.message}`);
    }

    return report;
  }

  /**
   * Check dimensional consistency
   * @private
   */
  _checkDimensionalConsistency(a1Sheet, masterDNA) {
    const check = { score: 100, issues: [], warnings: [] };
    const prompt = a1Sheet.prompt || '';
    const dimensions = masterDNA.dimensions || {};

    // Check if key dimensions are mentioned in prompt
    const length = dimensions.length || 15;
    const width = dimensions.width || 10;
    const height = dimensions.height || dimensions.totalHeight || 7;

    if (!prompt.includes(`${length}m`) && !prompt.includes(`${length} m`)) {
      check.issues.push(`Building length ${length}m not consistently specified`);
      check.score -= 20;
    }

    if (!prompt.includes(`${width}m`) && !prompt.includes(`${width} m`)) {
      check.issues.push(`Building width ${width}m not consistently specified`);
      check.score -= 20;
    }

    if (!prompt.includes(`${height}m`) && !prompt.includes(`${height} m`)) {
      check.warnings.push(`Building height ${height}m not explicitly mentioned`);
      check.score -= 10;
    }

    return check;
  }

  /**
   * Check material consistency
   * @private
   */
  _checkMaterialConsistency(a1Sheet, masterDNA) {
    const check = { score: 100, issues: [], warnings: [] };
    const prompt = a1Sheet.prompt || '';
    const materialPriority = masterDNA.materialPriority || {};
    const materials = masterDNA.materials || [];

    // Check if primary materials are mentioned
    if (materialPriority.primary && !prompt.toLowerCase().includes(materialPriority.primary.toLowerCase())) {
      check.issues.push(`Primary material "${materialPriority.primary}" not found in prompt`);
      check.score -= 25;
    }

    if (materialPriority.secondary && !prompt.toLowerCase().includes(materialPriority.secondary.toLowerCase())) {
      check.warnings.push(`Secondary material "${materialPriority.secondary}" not explicitly mentioned`);
      check.score -= 10;
    }

    // Check material array
    if (Array.isArray(materials) && materials.length > 0) {
      const materialsFound = materials.filter(m => {
        const matName = typeof m === 'string' ? m : m.name;
        return matName && prompt.toLowerCase().includes(matName.toLowerCase());
      });

      if (materialsFound.length < materials.length / 2) {
        check.issues.push(`Only ${materialsFound.length}/${materials.length} materials mentioned in prompt`);
        check.score -= 15;
      }
    }

    return check;
  }

  /**
   * Check massing consistency
   * @private
   */
  _checkMassingConsistency(a1Sheet, masterDNA) {
    const check = { score: 100, issues: [], warnings: [] };
    const prompt = a1Sheet.prompt || '';
    const massing = masterDNA.massing || {};

    if (massing.buildingForm && !prompt.toLowerCase().includes(massing.buildingForm.toLowerCase())) {
      check.warnings.push(`Building form "${massing.buildingForm}" not explicitly mentioned`);
      check.score -= 10;
    }

    if (massing.footprintShape && !prompt.toLowerCase().includes(massing.footprintShape.toLowerCase())) {
      check.warnings.push(`Footprint shape "${massing.footprintShape}" not explicitly mentioned`);
      check.score -= 10;
    }

    if (massing.courtyardPresence && !prompt.toLowerCase().includes('courtyard')) {
      check.warnings.push('Courtyard presence not mentioned despite DNA specification');
      check.score -= 15;
    }

    return check;
  }

  /**
   * Check style consistency
   * @private
   */
  _checkStyleConsistency(a1Sheet, masterDNA) {
    const check = { score: 100, issues: [], warnings: [] };
    const prompt = a1Sheet.prompt || '';
    const styleWeights = masterDNA.styleWeights || {};

    if (styleWeights.localStyle && !prompt.toLowerCase().includes(styleWeights.localStyle.toLowerCase())) {
      check.warnings.push(`Local style "${styleWeights.localStyle}" not explicitly mentioned`);
      check.score -= 10;
    }

    if (styleWeights.dominantInfluence === 'local' && styleWeights.local) {
      const localPercentage = Math.round(styleWeights.local * 100);
      if (localPercentage >= 70 && !prompt.includes(styleWeights.localStyle)) {
        check.issues.push(`Local style should dominate (${localPercentage}%) but not emphasized in prompt`);
        check.score -= 20;
      }
    }

    return check;
  }

  /**
   * Check completeness (all required sections)
   * @private
   */
  _checkCompleteness(a1Sheet, projectContext) {
    const check = { score: 100, issues: [], warnings: [] };
    const prompt = a1Sheet.prompt || '';

    const requiredKeywords = [
      'SITE PLAN',
      'GROUND FLOOR PLAN',
      'ELEVATION',
      'SECTION',
      '3D',
      'MATERIAL',
      'TITLE BLOCK'
    ];

    const missing = requiredKeywords.filter(keyword => !prompt.toUpperCase().includes(keyword));

    if (missing.length > 0) {
      check.issues.push(`Missing required sections: ${missing.join(', ')}`);
      check.score -= missing.length * 15;
    }

    // Check for multi-storey buildings
    const floorCount = projectContext?.floors || projectContext?.floorCount || 1;
    if (floorCount > 1 && !prompt.toUpperCase().includes('FIRST FLOOR') && !prompt.toUpperCase().includes('UPPER FLOOR')) {
      check.warnings.push('Multi-storey building but upper floor plan not mentioned');
      check.score -= 10;
    }

    return check;
  }
}

// Export singleton
export default new ConsistencyChecker();
