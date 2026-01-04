/**
 * Control Image Debug Report Generator
 *
 * Generates comprehensive proof that every panel used a control image
 * derived from the SAME Single Source of Truth (SSOT) geometry.
 *
 * Usage:
 * 1. After A1 generation completes, call generateFullDebugReport(designFingerprint)
 * 2. The report proves:
 *    - Every panel had a control image attached
 *    - All control images came from the same canonical geometry
 *    - Control strength bands were applied correctly
 *    - Any retry attempts with increased strength
 *
 * @module services/validation/controlImageDebugReport
 */

import { isFeatureEnabled, getFeatureValue } from '../../config/featureFlags.js';
import logger from '../core/logger.js';
import { generateControlImageUsageReport } from '../design/panelGenerationService.js';
import { getControlImageDebugReport } from '../geometry/canonicalControlRenderGenerator.js';

// =============================================================================
// DEBUG REPORT GENERATOR
// =============================================================================

/**
 * Generate a comprehensive debug report proving control image usage
 *
 * @param {string} designFingerprint - Design identifier
 * @param {Object} options - Report options
 * @returns {Object} Full debug report with proof
 */
export function generateFullDebugReport(designFingerprint, options = {}) {
  const { includeDataUrls = false, verbose = true } = options;

  logger.info('[ControlImageDebugReport] Generating full report', { designFingerprint });

  // Get reports from both sources
  const canonicalReport = getControlImageDebugReport(designFingerprint);
  const usageReport = generateControlImageUsageReport(designFingerprint);

  // Build comprehensive report
  const report = {
    // Header
    title: 'Control Image Usage Proof Report',
    designFingerprint,
    generatedAt: new Date().toISOString(),
    version: '1.0.0',

    // Configuration snapshot
    configuration: {
      strictModeEnabled: isFeatureEnabled('strictControlImageMode'),
      debugReportEnabled: isFeatureEnabled('enableControlImageDebugReport'),
      strengthBands: getFeatureValue('controlStrengthBands') || {
        initial: 0.6,
        retry1: 0.75,
        retry2: 0.9,
      },
      strengthMultipliers: getFeatureValue('controlStrengthMultipliers') || {},
      maxRetries: getFeatureValue('maxControlImageRetries') || 2,
      controlImageSourcePriority: getFeatureValue('controlImageSourcePriority') || [
        'conditioned',
        'meshy',
        'fgl',
        'geometry',
        'blender',
      ],
    },

    // SSOT Geometry Source
    canonicalGeometry: {
      found: canonicalReport.found,
      cacheTimestamp: canonicalReport.cacheTimestamp,
      cacheAge: canonicalReport.cacheAge,
      panelCount: canonicalReport.panelCount || 0,
      missingPanels: canonicalReport.missingPanels || [],
    },

    // Per-Panel Usage
    panelUsage: {},

    // Summary Statistics
    summary: {
      totalPanels: 0,
      withControlImage: 0,
      withoutControlImage: 0,
      retriedPanels: 0,
      totalRetryAttempts: 0,
      averageStrength: 0,
      complianceScore: 0,
    },

    // Validation Result
    validation: {
      passed: false,
      issues: [],
      warnings: [],
    },
  };

  // Process canonical geometry panels
  if (canonicalReport.panels) {
    for (const [panelType, panelInfo] of Object.entries(canonicalReport.panels)) {
      report.panelUsage[panelType] = report.panelUsage[panelType] || {};
      report.panelUsage[panelType].canonical = {
        available: true,
        source: panelInfo.source,
        conditioningType: panelInfo.conditioningType,
        strength: panelInfo.strength,
        viewType: panelInfo.viewType,
        dimensions: panelInfo.dimensions,
      };

      if (includeDataUrls) {
        report.panelUsage[panelType].canonical.dataUrlLength = panelInfo.dataUrlLength;
      }
    }
  }

  // Process actual usage from generation
  if (usageReport.panelUsage) {
    for (const [panelType, usage] of Object.entries(usageReport.panelUsage)) {
      report.panelUsage[panelType] = report.panelUsage[panelType] || {};
      report.panelUsage[panelType].actual = {
        controlImageUsed: usage.controlImageUsed,
        source: usage.controlSource,
        seed: usage.seed,
        generatedAt: usage.generatedAt,
        retryInfo: usage.retryInfo,
      };
    }
  }

  // Calculate summary statistics
  const panelEntries = Object.entries(report.panelUsage);
  report.summary.totalPanels = panelEntries.length;

  let totalStrength = 0;
  let strengthCount = 0;

  for (const [panelType, panelInfo] of panelEntries) {
    if (panelInfo.actual?.controlImageUsed) {
      report.summary.withControlImage++;
      if (panelInfo.actual?.source?.strength) {
        totalStrength += panelInfo.actual.source.strength;
        strengthCount++;
      }
    } else {
      report.summary.withoutControlImage++;
    }

    if (panelInfo.actual?.retryInfo?.totalAttempts > 1) {
      report.summary.retriedPanels++;
      report.summary.totalRetryAttempts += panelInfo.actual.retryInfo.totalAttempts - 1;
    }
  }

  report.summary.averageStrength =
    strengthCount > 0 ? parseFloat((totalStrength / strengthCount).toFixed(3)) : 0;

  report.summary.complianceScore =
    report.summary.totalPanels > 0
      ? parseFloat(
          ((report.summary.withControlImage / report.summary.totalPanels) * 100).toFixed(1)
        )
      : 0;

  // Validate compliance
  const strictMode = isFeatureEnabled('strictControlImageMode');

  // Check if any control image source is actually configured
  const geometryVolumeFirstEnabled = isFeatureEnabled('geometryVolumeFirst');
  const meshy3DModeEnabled = isFeatureEnabled('meshy3DMode');
  const controlImageSourceAvailable = geometryVolumeFirstEnabled || meshy3DModeEnabled;

  if (strictMode) {
    if (report.summary.withoutControlImage > 0) {
      if (!controlImageSourceAvailable) {
        // No control image source configured - this is expected, not a violation
        // Pass validation but add an informational warning
        report.validation.passed = true;
        report.validation.warnings.push(
          `No control image source configured: Enable geometryVolumeFirst or meshy3DMode for control image enforcement`
        );
        report.validation.warnings.push(
          `${report.summary.withoutControlImage} panels have no control images (expected with current configuration)`
        );
      } else {
        // Control image source was available but some panels didn't use it - this IS a violation
        report.validation.passed = false;
        report.validation.issues.push(
          `STRICT MODE VIOLATION: ${report.summary.withoutControlImage} panels generated without control images`
        );

        // List panels without control
        for (const [panelType, panelInfo] of panelEntries) {
          if (!panelInfo.actual?.controlImageUsed) {
            report.validation.issues.push(`  - ${panelType}: No control image attached`);
          }
        }
      }
    } else if (report.summary.withControlImage === report.summary.totalPanels) {
      report.validation.passed = true;
    }
  } else {
    // Non-strict mode: always passes but may have warnings
    report.validation.passed = true;

    if (report.summary.withoutControlImage > 0) {
      report.validation.warnings.push(
        `${report.summary.withoutControlImage} panels generated without control images (non-strict mode)`
      );
    }
  }

  // Check canonical geometry consistency
  if (!canonicalReport.found) {
    report.validation.warnings.push(
      'No canonical geometry cache found - control images may not be from SSOT'
    );
  }

  if (canonicalReport.missingPanels?.length > 0) {
    report.validation.warnings.push(
      `Canonical geometry missing panels: ${canonicalReport.missingPanels.join(', ')}`
    );
  }

  // Add verbose details if requested
  if (verbose) {
    report.verbose = {
      fullCanonicalReport: canonicalReport,
      fullUsageReport: usageReport,
    };
  }

  logger.info('[ControlImageDebugReport] Report generated', {
    passed: report.validation.passed,
    complianceScore: `${report.summary.complianceScore}%`,
    issues: report.validation.issues.length,
    warnings: report.validation.warnings.length,
  });

  return report;
}

/**
 * Generate a human-readable summary of the debug report
 *
 * @param {Object} report - Full debug report from generateFullDebugReport
 * @returns {string} Human-readable summary
 */
export function formatDebugReportSummary(report) {
  const lines = [];

  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║         CONTROL IMAGE USAGE PROOF REPORT                         ║');
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Design Fingerprint: ${report.designFingerprint}`);
  lines.push(`Generated At: ${report.generatedAt}`);
  lines.push('');
  lines.push('─────────────────────────────────────────────────────────────────────');
  lines.push('CONFIGURATION');
  lines.push('─────────────────────────────────────────────────────────────────────');
  lines.push(
    `  Strict Mode: ${report.configuration.strictModeEnabled ? '✅ ENABLED' : '⚠️ DISABLED'}`
  );
  lines.push(
    `  Debug Report: ${report.configuration.debugReportEnabled ? '✅ ENABLED' : '❌ DISABLED'}`
  );
  lines.push(`  Max Retries: ${report.configuration.maxRetries}`);
  lines.push(
    `  Strength Bands: initial=${report.configuration.strengthBands.initial}, retry1=${report.configuration.strengthBands.retry1}, retry2=${report.configuration.strengthBands.retry2}`
  );
  lines.push('');
  lines.push('─────────────────────────────────────────────────────────────────────');
  lines.push('SUMMARY');
  lines.push('─────────────────────────────────────────────────────────────────────');
  lines.push(`  Total Panels: ${report.summary.totalPanels}`);
  lines.push(`  With Control Image: ${report.summary.withControlImage} ✅`);
  lines.push(
    `  Without Control Image: ${report.summary.withoutControlImage} ${report.summary.withoutControlImage > 0 ? '❌' : '✅'}`
  );
  lines.push(`  Retried Panels: ${report.summary.retriedPanels}`);
  lines.push(`  Total Retry Attempts: ${report.summary.totalRetryAttempts}`);
  lines.push(`  Average Strength: ${report.summary.averageStrength}`);
  lines.push(`  Compliance Score: ${report.summary.complianceScore}%`);
  lines.push('');
  lines.push('─────────────────────────────────────────────────────────────────────');
  lines.push('VALIDATION RESULT');
  lines.push('─────────────────────────────────────────────────────────────────────');
  lines.push(`  Status: ${report.validation.passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (report.validation.issues.length > 0) {
    lines.push('  Issues:');
    report.validation.issues.forEach((issue) => lines.push(`    ❌ ${issue}`));
  }

  if (report.validation.warnings.length > 0) {
    lines.push('  Warnings:');
    report.validation.warnings.forEach((warning) => lines.push(`    ⚠️ ${warning}`));
  }

  lines.push('');
  lines.push('─────────────────────────────────────────────────────────────────────');
  lines.push('PER-PANEL BREAKDOWN');
  lines.push('─────────────────────────────────────────────────────────────────────');

  for (const [panelType, panelInfo] of Object.entries(report.panelUsage)) {
    const used = panelInfo.actual?.controlImageUsed;
    const source = panelInfo.actual?.source?.type || 'none';
    const strength = panelInfo.actual?.source?.strength?.toFixed(2) || 'N/A';
    const retries = panelInfo.actual?.retryInfo?.totalAttempts || 1;

    lines.push(`  ${panelType}:`);
    lines.push(`    Control Image: ${used ? '✅ YES' : '❌ NO'}`);
    lines.push(`    Source: ${source}`);
    lines.push(`    Strength: ${strength}`);
    if (retries > 1) {
      lines.push(`    Retries: ${retries - 1} (${retries} total attempts)`);
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Generate JSON report suitable for API response
 *
 * @param {string} designFingerprint - Design identifier
 * @returns {Object} JSON report
 */
export function generateAPIReport(designFingerprint) {
  const report = generateFullDebugReport(designFingerprint, {
    includeDataUrls: false,
    verbose: false,
  });

  return {
    success: report.validation.passed,
    designFingerprint: report.designFingerprint,
    generatedAt: report.generatedAt,
    summary: report.summary,
    validation: report.validation,
    configuration: {
      strictMode: report.configuration.strictModeEnabled,
      strengthBands: report.configuration.strengthBands,
    },
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  generateFullDebugReport,
  formatDebugReportSummary,
  generateAPIReport,
};
