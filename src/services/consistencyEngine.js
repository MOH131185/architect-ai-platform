/**
 * Consistency Engine
 * 
 * Unified consistency validation service
 * Coordinates DNA validation, site compliance, geometry checks, view consistency, and A1 sheet structure
 * Used for both initial generation and modification workflows
 */

import dnaValidator from './dnaValidator.js';
import metricsCalculator from './metricsCalculator.js';
import sheetConsistencyGuard from './sheetConsistencyGuard.js';
import a1SheetValidator from './a1/A1ValidationService.js';
import { validateDesignProject } from '../core/validators.js';
import { validateAndCorrectFootprint } from '../utils/geometry.js';
import logger from '../utils/logger.js';


class ConsistencyEngine {
  constructor() {
    logger.info('🔍 Consistency Engine initialized');
  }

  /**
   * Check complete design consistency
   * 
   * @param {Object} designProject - Complete design project
   * @returns {Promise<Object>} Consistency report with score and issues
   */
  async checkDesignConsistency(designProject) {
    logger.info('\n🔍 ========================================');
    logger.info('🔍 RUNNING CONSISTENCY CHECKS');
    logger.info('🔍 ========================================\n');

    const checks = [];
    const issues = [];
    let totalScore = 0;
    let checksRun = 0;

    try {
      // ========================================
      // CHECK 1: DNA Validation
      // ========================================
      logger.info('1️⃣  Validating Design DNA...');
      
      if (designProject.masterDNA || designProject.dna) {
        const dna = designProject.masterDNA || designProject.dna;
        const dnaValidation = dnaValidator.validateDesignDNA(dna);

        checks.push({
          name: 'DNA Validation',
          passed: dnaValidation.isValid,
          errors: dnaValidation.errors || [],
          warnings: dnaValidation.warnings || [],
          score: dnaValidation.isValid ? 1.0 : 0.5
        });

        if (!dnaValidation.isValid) {
          issues.push(`DNA validation failed: ${dnaValidation.errors.length} errors`);
          dnaValidation.errors.forEach(err => issues.push(`  - ${err}`));
        }

        totalScore += dnaValidation.isValid ? 1.0 : 0.5;
        checksRun++;

        logger.info(`   ${dnaValidation.isValid ? '✅' : '⚠️'} DNA: ${dnaValidation.errors.length} errors, ${dnaValidation.warnings.length} warnings`);
      } else {
        logger.info('   ⏭️  No DNA available, skipping');
      }

      // ========================================
      // CHECK 2: Site Boundary Compliance
      // ========================================
      logger.info('2️⃣  Checking site boundary compliance...');

      if (designProject.sitePolygon && designProject.sitePolygon.length >= 3 && designProject.masterDNA) {
        const dna = designProject.masterDNA || designProject.dna;
        const dimensions = dna.dimensions || {};

        try {
          // Create proposed footprint
          const length = dimensions.length || 15;
          const width = dimensions.width || 10;
          const proposedFootprint = [
            { x: -length / 2, y: -width / 2 },
            { x: length / 2, y: -width / 2 },
            { x: length / 2, y: width / 2 },
            { x: -length / 2, y: width / 2 }
          ];

          const setbacks = {
            front: 3,
            rear: 3,
            sideLeft: 3,
            sideRight: 3
          };

          const origin = designProject.coordinates || { lat: 0, lng: 0 };

          const boundaryValidation = validateAndCorrectFootprint({
            siteBoundary: designProject.sitePolygon,
            setbacks,
            proposedFootprint,
            origin
          });

          const complianceScore = boundaryValidation.validation.compliancePercentage / 100;

          checks.push({
            name: 'Site Boundary Compliance',
            passed: boundaryValidation.validation.isValid,
            score: complianceScore,
            details: `${boundaryValidation.validation.compliancePercentage.toFixed(1)}% compliant`
          });

          if (!boundaryValidation.validation.isValid) {
            issues.push(`Building footprint violates site boundaries (${boundaryValidation.validation.compliancePercentage.toFixed(1)}% compliant)`);
          }

          totalScore += complianceScore;
          checksRun++;

          logger.info(`   ${boundaryValidation.validation.isValid ? '✅' : '⚠️'} Boundary: ${boundaryValidation.validation.compliancePercentage.toFixed(1)}% compliant`);

        } catch (error) {
          logger.warn('   ⚠️  Boundary validation failed:', error.message);
        }
      } else {
        logger.info('   ⏭️  No site polygon available, skipping');
      }

      // ========================================
      // CHECK 3: Geometry Validation (if enabled)
      // ========================================
      logger.info('3️⃣  Validating geometry...');

      if (designProject.geometry) {
        try {
          const geomValidation = validateDesignProject(designProject);

          checks.push({
            name: 'Geometry Validation',
            passed: geomValidation.valid,
            errors: geomValidation.errors,
            warnings: geomValidation.warnings,
            score: geomValidation.valid ? 1.0 : 0.6
          });

          if (!geomValidation.valid) {
            issues.push(`Geometry validation failed: ${geomValidation.errors.length} errors`);
            geomValidation.errors.forEach(err => issues.push(`  - ${err.message}`));
          }

          totalScore += geomValidation.valid ? 1.0 : 0.6;
          checksRun++;

          logger.info(`   ${geomValidation.valid ? '✅' : '⚠️'} Geometry: ${geomValidation.errors.length} errors, ${geomValidation.warnings.length} warnings`);

        } catch (error) {
          logger.warn('   ⚠️  Geometry validation failed:', error.message);
        }
      } else {
        logger.info('   ⏭️  No geometry available, skipping');
      }

      // ========================================
      // CHECK 4: Metrics Sanity
      // ========================================
      logger.info('4️⃣  Checking metrics...');

      if (designProject.metrics) {
        const metrics = designProject.metrics;
        let metricsValid = true;
        const metricsIssues = [];

        // Check WWR
        if (metrics.fenestration?.wwr !== undefined) {
          const wwr = metrics.fenestration.wwr;
          if (wwr < 0.15 || wwr > 0.60) {
            metricsValid = false;
            metricsIssues.push(`WWR ${(wwr * 100).toFixed(1)}% is outside acceptable range (15-60%)`);
          }
        }

        // Check circulation
        if (metrics.areas?.circulation_percent !== undefined) {
          const circ = metrics.areas.circulation_percent;
          if (circ < 10 || circ > 30) {
            metricsIssues.push(`Circulation ${circ.toFixed(1)}% is outside ideal range (10-30%)`);
          }
        }

        checks.push({
          name: 'Metrics Sanity',
          passed: metricsValid,
          score: metricsValid ? 1.0 : 0.8,
          issues: metricsIssues
        });

        if (!metricsValid) {
          issues.push(...metricsIssues);
        }

        totalScore += metricsValid ? 1.0 : 0.8;
        checksRun++;

        logger.info(`   ${metricsValid ? '✅' : '⚠️'} Metrics: ${metricsIssues.length} issues`);

      } else {
        logger.info('   ⏭️  No metrics available, skipping');
      }

      // ========================================
      // CHECK 5: A1 Sheet Structure (if present)
      // ========================================
      logger.info('5️⃣  Validating A1 sheet structure...');

      if (designProject.a1Sheet || designProject.a1SheetUrl) {
        try {
          const sheetData = {
            url: designProject.a1SheetUrl || designProject.a1Sheet?.url,
            metadata: designProject.a1Sheet?.metadata || {},
            prompt: designProject.a1Sheet?.prompt
          };

          const sheetValidation = a1SheetValidator.validateA1Sheet(sheetData, designProject.masterDNA || designProject.dna);

          checks.push({
            name: 'A1 Sheet Structure',
            passed: sheetValidation.isValid,
            score: sheetValidation.score || (sheetValidation.isValid ? 1.0 : 0.5),
            issues: sheetValidation.issues || []
          });

          if (!sheetValidation.isValid) {
            issues.push('A1 sheet validation failed');
            sheetValidation.issues?.forEach(issue => issues.push(`  - ${issue}`));
          }

          totalScore += sheetValidation.score || (sheetValidation.isValid ? 1.0 : 0.5);
          checksRun++;

          logger.info(`   ${sheetValidation.isValid ? '✅' : '⚠️'} A1 Sheet: ${sheetValidation.issues?.length || 0} issues`);

        } catch (error) {
          logger.warn('   ⚠️  A1 sheet validation failed:', error.message);
        }
      } else {
        logger.info('   ⏭️  No A1 sheet available, skipping');
      }

      // ========================================
      // CHECK 6: Version Consistency (if modification)
      // ========================================
      logger.info('6️⃣  Checking version consistency...');

      if (designProject.parentVersion && designProject.previousA1SheetUrl) {
        try {
          const consistencyResult = await sheetConsistencyGuard.validateConsistency(
            designProject.previousA1SheetUrl,
            designProject.a1SheetUrl || designProject.a1Sheet?.url
          );

          checks.push({
            name: 'Version Consistency',
            passed: consistencyResult.consistent,
            score: consistencyResult.similarity || 0.9,
            details: `${(consistencyResult.similarity * 100).toFixed(1)}% similar to previous version`
          });

          if (!consistencyResult.consistent) {
            issues.push(`Version consistency below threshold: ${(consistencyResult.similarity * 100).toFixed(1)}%`);
          }

          totalScore += consistencyResult.similarity || 0.9;
          checksRun++;

          logger.info(`   ${consistencyResult.consistent ? '✅' : '⚠️'} Version: ${(consistencyResult.similarity * 100).toFixed(1)}% similar`);

        } catch (error) {
          logger.warn('   ⚠️  Version consistency check failed:', error.message);
        }
      } else {
        logger.info('   ⏭️  No previous version, skipping');
      }

      // ========================================
      // COMPUTE FINAL SCORE
      // ========================================
      const finalScore = checksRun > 0 ? totalScore / checksRun : 0;
      const passed = finalScore >= 0.9 && issues.length === 0;

      logger.info('\n✅ ========================================');
      logger.success(` CONSISTENCY CHECK ${passed ? 'PASSED' : 'FAILED'}`);
      logger.success(' ========================================');
      logger.info(`   📊 Score: ${(finalScore * 100).toFixed(1)}%`);
      logger.info(`   ✓ Checks run: ${checksRun}`);
      logger.info(`   ⚠️  Issues: ${issues.length}`);

      return {
        passed,
        score: finalScore,
        checks,
        issues,
        summary: {
          checksRun,
          checksPassed: checks.filter(c => c.passed).length,
          issuesFound: issues.length,
          recommendation: passed
            ? 'Design is consistent and ready for export'
            : 'Review issues before exporting. Some inconsistencies detected.'
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('\n❌ Consistency check failed:', error);

      return {
        passed: false,
        score: 0,
        checks: [],
        issues: [`Consistency check error: ${error.message}`],
        summary: {
          checksRun: 0,
          checksPassed: 0,
          issuesFound: 1,
          recommendation: 'Consistency check failed. Review error logs.'
        },
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Compare two design versions
   * 
   * @param {Object} oldDesign - Previous design version
   * @param {Object} newDesign - New design version
   * @returns {Object} Version diff report
   */
  compareVersions(oldDesign, newDesign) {
    logger.info('🔍 Comparing design versions...');

    const changes = [];
    const oldDNA = oldDesign.masterDNA || oldDesign.dna || {};
    const newDNA = newDesign.masterDNA || newDesign.dna || {};

    // Compare dimensions
    if (oldDNA.dimensions && newDNA.dimensions) {
      const dimFields = ['length', 'width', 'totalHeight', 'floorCount'];
      dimFields.forEach(field => {
        if (oldDNA.dimensions[field] !== newDNA.dimensions[field]) {
          changes.push({
            category: 'dimensions',
            field,
            oldValue: oldDNA.dimensions[field],
            newValue: newDNA.dimensions[field],
            impact: 'high'
          });
        }
      });
    }

    // Compare materials
    if (oldDNA.materials && newDNA.materials) {
      const oldMaterials = Array.isArray(oldDNA.materials) ? oldDNA.materials : [oldDNA.materials];
      const newMaterials = Array.isArray(newDNA.materials) ? newDNA.materials : [newDNA.materials];

      if (JSON.stringify(oldMaterials) !== JSON.stringify(newMaterials)) {
        changes.push({
          category: 'materials',
          field: 'materials',
          oldValue: oldMaterials.map(m => m.name || m).join(', '),
          newValue: newMaterials.map(m => m.name || m).join(', '),
          impact: 'medium'
        });
      }
    }

    // Compare architectural style
    if (oldDNA.architecturalStyle !== newDNA.architecturalStyle) {
      changes.push({
        category: 'style',
        field: 'architecturalStyle',
        oldValue: oldDNA.architecturalStyle,
        newValue: newDNA.architecturalStyle,
        impact: 'medium'
      });
    }

    // Categorize changes by impact
    const highImpact = changes.filter(c => c.impact === 'high');
    const mediumImpact = changes.filter(c => c.impact === 'medium');
    const lowImpact = changes.filter(c => c.impact === 'low');

    logger.info(`   📝 Changes detected: ${changes.length} total`);
    logger.info(`      High impact: ${highImpact.length}`);
    logger.info(`      Medium impact: ${mediumImpact.length}`);
    logger.info(`      Low impact: ${lowImpact.length}`);

    return {
      totalChanges: changes.length,
      changes,
      highImpactChanges: highImpact,
      mediumImpactChanges: mediumImpact,
      lowImpactChanges: lowImpact,
      summary: this.generateChangeSummary(changes),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate human-readable change summary
   */
  generateChangeSummary(changes) {
    if (changes.length === 0) {
      return 'No changes detected';
    }

    const categories = {};
    changes.forEach(change => {
      if (!categories[change.category]) {
        categories[change.category] = [];
      }
      categories[change.category].push(change);
    });

    const summaryParts = [];
    Object.entries(categories).forEach(([category, categoryChanges]) => {
      summaryParts.push(`${category}: ${categoryChanges.length} change(s)`);
    });

    return summaryParts.join('; ');
  }

  /**
   * Quick consistency check (essential checks only)
   */
  quickCheck(designProject) {
    const dna = designProject.masterDNA || designProject.dna;

    if (!dna) {
      return { passed: false, message: 'No DNA available' };
    }

    // Check essential fields
    const hasValidDimensions = dna.dimensions &&
      dna.dimensions.length > 0 &&
      dna.dimensions.width > 0 &&
      dna.dimensions.totalHeight > 0;

    const hasValidMaterials = dna.materials &&
      (Array.isArray(dna.materials) ? dna.materials.length > 0 : true);

    const passed = hasValidDimensions && hasValidMaterials;

    return {
      passed,
      message: passed ? 'Essential checks passed' : 'Missing essential data',
      checks: {
        dimensions: hasValidDimensions,
        materials: hasValidMaterials
      }
    };
  }
}

// Singleton instance
const consistencyEngine = new ConsistencyEngine();

export default consistencyEngine;
export { consistencyEngine, ConsistencyEngine };

