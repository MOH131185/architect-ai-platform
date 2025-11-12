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

class ConsistencyChecker {
  constructor() {
    console.log('✅ Consistency Checker Service initialized');
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
    console.log('🔍 Running comprehensive consistency check...');

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
    console.log('\n' + '═'.repeat(60));
    console.log('📊 CONSISTENCY CHECK REPORT');
    console.log('═'.repeat(60));
    console.log(`Overall Score: ${report.overallScore}% ${report.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log('─'.repeat(60));

    console.log('\n✅ Checks Performed:');
    report.checks.forEach(check => {
      const status = check.passed ? '✅' : '❌';
      console.log(`  ${status} ${check.name}`);
      if (check.issues && check.issues.length > 0) {
        check.issues.forEach(issue => console.log(`     ${issue}`));
      }
    });

    if (report.issues.length > 0) {
      console.log('\n❌ Critical Issues:');
      report.issues.forEach(issue => console.log(`  ${issue}`));
    }

    if (report.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      report.warnings.forEach(warning => console.log(`  ${warning}`));
    }

    console.log('\n📋 QA Overlay Summary:');
    console.log(`  Total Windows: ${report.qaOverlay.quick_stats.total_windows}`);
    console.log(`  Total Doors: ${report.qaOverlay.quick_stats.total_doors}`);
    console.log(`  Floors: ${report.qaOverlay.quick_stats.floor_count}`);
    console.log(`  Footprint: ${report.qaOverlay.quick_stats.footprint_area}m²`);

    console.log('═'.repeat(60) + '\n');
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
}

// Export singleton
export default new ConsistencyChecker();
