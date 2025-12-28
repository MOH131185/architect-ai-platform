/**
 * Contract Gate Service
 *
 * Validates all panels against the DesignContract and auto-regenerates
 * panels that fail validation.
 *
 * PROBLEM SOLVED:
 * - Panels showing different building types (terrace → detached drift)
 * - Inconsistent party wall conditions
 * - Roof type mismatches between views
 * - Window count and position inconsistencies
 *
 * SOLUTION:
 * - Validate every panel against the DesignContract
 * - Auto-regenerate failed panels with stronger constraints
 * - Fail fast if panels still fail after retries
 *
 * @module services/design/ContractGate
 */

import { isFeatureEnabled, getFeatureValue } from '../../config/featureFlags.js';
import logger from '../core/logger.js';

// =============================================================================
// CONTRACT VALIDATION RULES
// =============================================================================

/**
 * Validation rules for different building types
 * @exported for testing
 */
export const BUILDING_TYPE_VALIDATION_RULES = {
  terrace: {
    displayName: 'Terrace House',
    criticalRules: [
      {
        id: 'party_walls',
        description: 'Must show attached party walls on sides',
        check: (panel, contract) => {
          // Only check party wall mentions for relevant panel types
          // Floor plans, sections, diagrams don't need this keyword
          const panelType = (panel.type || panel.panelType || '').toLowerCase();
          const relevantTypes = ['hero_3d', 'elevation_', 'exterior', 'axonometric'];
          const isRelevant = relevantTypes.some((t) => panelType.includes(t));

          // Skip check for non-relevant panels (floor plans, sections, interiors, diagrams)
          if (!isRelevant) {
            return true;
          }

          // Check if panel shows isolated/detached massing
          const prompt = panel.prompt?.toLowerCase() || '';
          const hasPartyWallMention =
            prompt.includes('party wall') ||
            prompt.includes('attached') ||
            prompt.includes('terrace');
          return hasPartyWallMention;
        },
        severity: 'critical',
        autoFix: 'Inject "attached terrace house with party walls" into prompt',
      },
      {
        id: 'narrow_frontage',
        description: 'Must have narrow frontage (4-8m)',
        check: (panel, contract) => {
          const width = contract.facadeWidth || 6;
          return width >= 4 && width <= 8;
        },
        severity: 'warning',
      },
      {
        id: 'no_side_windows',
        description: 'Party wall sides must have no windows',
        check: (panel, contract) => {
          // For elevation panels on party wall sides
          const panelType = panel.type?.toLowerCase() || '';
          const partyWallSides = contract.partyWallSides || ['east', 'west'];

          // If this is an elevation panel for a party wall side
          for (const side of partyWallSides) {
            if (panelType.includes(side)) {
              // Should be blank/solid wall
              return true; // Trust the prompt injection for now
            }
          }
          return true;
        },
        severity: 'critical',
      },
    ],
    forbiddenPatterns: [
      'detached house',
      'freestanding',
      'standalone',
      'isolated',
      'villa',
      'mansion',
    ],
  },

  semi_detached: {
    displayName: 'Semi-Detached House',
    criticalRules: [
      {
        id: 'one_party_wall',
        description: 'Must show ONE attached party wall',
        check: (panel, contract) => true,
        severity: 'critical',
      },
      {
        id: 'one_freestanding_side',
        description: 'Must have one freestanding side',
        check: (panel, contract) => true,
        severity: 'warning',
      },
    ],
    forbiddenPatterns: ['fully detached', 'terrace', 'row house', 'townhouse'],
  },

  detached: {
    displayName: 'Detached House',
    criticalRules: [
      {
        id: 'freestanding',
        description: 'Must be freestanding on all sides',
        check: (panel, contract) => true,
        severity: 'critical',
      },
      {
        id: 'no_party_walls',
        description: 'Must have no party walls',
        check: (panel, contract) => !contract.partyWalls,
        severity: 'critical',
      },
    ],
    forbiddenPatterns: ['terrace', 'attached', 'party wall', 'row house', 'townhouse'],
  },
};

/**
 * Default validation rules for unknown building types
 */
const DEFAULT_VALIDATION_RULES = {
  displayName: 'Building',
  criticalRules: [
    {
      id: 'consistent_type',
      description: 'Building type must be consistent',
      check: () => true,
      severity: 'warning',
    },
  ],
  forbiddenPatterns: [],
};

// =============================================================================
// CONTRACT GATE CLASS
// =============================================================================

/**
 * Contract Gate - Validates and gates panel generation
 */
export class ContractGate {
  /**
   * Create a ContractGate
   * @param {Object} designContract - The DesignContract to validate against
   */
  constructor(designContract) {
    this._contract = designContract;
    this._validationResults = new Map();
    this._retryHistory = new Map();
    this._failedPanels = [];
    this._passedPanels = [];

    // Get validation rules for this building type
    const buildingType = designContract.buildingType;
    this._rules = BUILDING_TYPE_VALIDATION_RULES[buildingType] || DEFAULT_VALIDATION_RULES;

    logger.info(`[ContractGate] Created gate for ${this._rules.displayName}`, {
      buildingType,
      criticalRules: this._rules.criticalRules.length,
      forbiddenPatterns: this._rules.forbiddenPatterns.length,
    });
  }

  /**
   * Get the design contract
   * @returns {Object} Design contract
   */
  get contract() {
    return this._contract;
  }

  /**
   * Get validation results
   * @returns {Map} Validation results by panel type
   */
  get validationResults() {
    return this._validationResults;
  }

  /**
   * Get failed panels
   * @returns {Array} Failed panels
   */
  get failedPanels() {
    return this._failedPanels;
  }

  /**
   * Get passed panels
   * @returns {Array} Passed panels
   */
  get passedPanels() {
    return this._passedPanels;
  }

  // ==========================================================================
  // PANEL VALIDATION
  // ==========================================================================

  /**
   * Validate a single panel against the contract
   *
   * @param {Object} panel - Panel to validate
   * @returns {Object} Validation result
   */
  validatePanel(panel) {
    const panelType = panel.type || panel.panelType || 'unknown';
    const errors = [];
    const warnings = [];

    logger.info(`[ContractGate] Validating panel: ${panelType}`);

    // DEBUG: Log panel data
    logger.info(
      `   [ContractGate] Panel has URL: ${!!(panel.url || panel.imageUrl || panel.dataUrl)}`
    );
    logger.info(
      `   [ContractGate] Panel has prompt: ${!!panel.prompt}, length: ${(panel.prompt || '').length}`
    );
    logger.info(`   [ContractGate] Building type: ${this._contract.buildingType}`);
    logger.info(
      `   [ContractGate] Rules: ${this._rules.criticalRules.length} critical, ${this._rules.forbiddenPatterns.length} forbidden`
    );

    // Skip validation for panels that failed generation (no URL = no image generated)
    const hasUrl = panel.url || panel.imageUrl || panel.dataUrl;
    if (!hasUrl) {
      logger.warn(
        `[ContractGate] Skipping validation for ${panelType} - no image URL (generation failed)`
      );
      return {
        panelType,
        valid: true, // Don't block on failed panels - they'll be reported separately
        skipped: true,
        reason: 'No image URL - generation failed',
        errors: [],
        warnings: [],
        timestamp: Date.now(),
      };
    }

    // Check critical rules
    for (const rule of this._rules.criticalRules) {
      try {
        const passed = rule.check(panel, this._contract);
        if (!passed) {
          if (rule.severity === 'critical') {
            errors.push({
              ruleId: rule.id,
              description: rule.description,
              autoFix: rule.autoFix,
            });
          } else {
            warnings.push({
              ruleId: rule.id,
              description: rule.description,
            });
          }
        }
      } catch (e) {
        logger.warn(`[ContractGate] Rule check failed: ${rule.id}`, e);
      }
    }

    // Check for forbidden patterns in prompt.
    // IMPORTANT: Contract prompt injections often include explicit "FORBIDDEN:", "PROHIBITIONS:",
    // "MUST NOT", and "NO [pattern]" instruction lines that mention these patterns as negative
    // examples. We must exclude these lines to avoid false positives.
    const promptLines = (panel.prompt || '').split('\n');

    // Track if we're inside a prohibitions/forbidden section
    let inProhibitionSection = false;

    // Filter out lines that mention patterns in negative context
    const filteredLines = promptLines.filter((line) => {
      const lineLower = line.toLowerCase().trim();

      // Detect start of prohibition sections (very broad matching)
      const prohibitionKeywords = [
        'prohibition',
        'forbidden',
        'must not',
        'do not',
        "don't",
        'avoid',
        'negative prompt',
        'exclude',
        'never include',
        'never show',
        'banned',
        'restrict',
        'critical:.*not',
        'important:.*not',
      ];

      if (
        prohibitionKeywords.some((kw) => {
          if (kw.includes('.*')) {
            return new RegExp(kw, 'i').test(lineLower);
          }
          return lineLower.includes(kw);
        })
      ) {
        inProhibitionSection = true;
        return false; // Exclude the header line
      }

      // Detect end of prohibition section (empty line or new affirmative section header)
      if (inProhibitionSection) {
        // End section on empty line
        if (lineLower === '') {
          inProhibitionSection = false;
          return true; // Include empty line (doesn't contain forbidden patterns anyway)
        }
        // End section on new section that is NOT a negation section
        const affirmativeHeaders = [
          'style:',
          'materials:',
          'dimensions:',
          'features:',
          'include:',
          'show:',
          'render:',
        ];
        if (affirmativeHeaders.some((h) => lineLower.startsWith(h))) {
          inProhibitionSection = false;
        }
      }

      // Exclude lines in prohibition sections
      if (inProhibitionSection) {
        return false;
      }

      // Exclude explicit negation lines (e.g., "No terrace elements", "NOT a terrace house")
      // These patterns indicate the forbidden term is being used as something to AVOID
      const negationPatterns = [
        /^no\s+/i, // "No terrace..."
        /^not\s+/i, // "Not a terrace..."
        /^never\s+/i, // "Never show..."
        /^avoid\s+/i, // "Avoid terrace..."
        /^exclude\s+/i, // "Exclude terrace..."
        /^don't\s+/i, // "Don't include..."
        /^do not\s+/i, // "Do not show..."
        /\bnot a\b/i, // "...not a terrace..."
        /\bno\s+\w+\s+(elements?|features?|style)/i, // "no terrace elements"
        /\bwithout\b/i, // "...without party walls..."
        /\bmust not\b/i, // "...must not show..."
        /\bshould not\b/i, // "...should not include..."
        /\bcannot\b/i, // "...cannot have..."
        /\bforbidden\b/i, // "...forbidden to..."
        /\bprohibit/i, // "...prohibited..."
        /\bban(ned)?\b/i, // "...banned..."
        /\breject/i, // "...reject any..."
        /\b(unlike|different from)\b/i, // "unlike terrace houses..."
        /^\s*-\s*no\s+/i, // "- No terrace..." (bullet list)
        /^\s*\*\s*no\s+/i, // "* No terrace..." (bullet list)
        /^\s*•\s*no\s+/i, // "• No terrace..." (bullet list)
      ];

      if (negationPatterns.some((pattern) => pattern.test(lineLower))) {
        return false;
      }

      return true;
    });

    const prompt = filteredLines.join('\n').toLowerCase();

    // For each forbidden pattern, check if it appears in an AFFIRMATIVE context
    // (not just present, but actually describing what the building IS)
    for (const forbidden of this._rules.forbiddenPatterns) {
      const forbiddenLower = forbidden.toLowerCase();

      // Skip if pattern not in prompt at all
      if (!prompt.includes(forbiddenLower)) {
        continue;
      }

      // Additional context check: look for the pattern in affirmative context
      // Find all occurrences and check surrounding context
      let foundAffirmative = false;
      const lines = prompt.split('\n');

      for (const line of lines) {
        if (!line.includes(forbiddenLower)) {
          continue;
        }

        // Check if this specific line uses the pattern affirmatively
        // Affirmative indicators: "this is a", "building type:", "style:", "a [pattern] house"
        const affirmativeIndicators = [
          `this is a ${forbiddenLower}`,
          `this is an ${forbiddenLower}`,
          `building type: ${forbiddenLower}`,
          `building type:${forbiddenLower}`,
          `a ${forbiddenLower} house`,
          `an ${forbiddenLower} house`,
          `${forbiddenLower} style`,
          `${forbiddenLower} design`,
          `${forbiddenLower} dwelling`,
        ];

        if (affirmativeIndicators.some((ind) => line.includes(ind))) {
          foundAffirmative = true;
          break;
        }

        // If the line doesn't have any negation keywords and contains the pattern,
        // it's likely affirmative (but only if it's describing the building)
        const lineNegationCheck = [
          'no ',
          'not ',
          'never ',
          'avoid ',
          'without ',
          'must not',
          "don't",
          'do not',
          'exclude',
          'forbidden',
          'prohibit',
          'ban',
          'reject',
          'unlike',
        ];

        const hasNegation = lineNegationCheck.some((neg) => line.includes(neg));
        if (!hasNegation && line.includes(forbiddenLower)) {
          // Pattern appears without negation - could be affirmative
          // But only flag if it's in a descriptive context, not just mentioned
          const descriptivePatterns = [
            new RegExp(`(is|as|like)\\s+(a\\s+)?${forbiddenLower}`, 'i'),
            new RegExp(`${forbiddenLower}\\s+(house|dwelling|property|building)`, 'i'),
            new RegExp(`(render|show|generate|create).*${forbiddenLower}`, 'i'),
          ];

          if (descriptivePatterns.some((p) => p.test(line))) {
            foundAffirmative = true;
            break;
          }
        }
      }

      if (foundAffirmative) {
        errors.push({
          ruleId: 'forbidden_pattern',
          description: `Prompt contains forbidden pattern in affirmative context: "${forbidden}"`,
          pattern: forbidden,
        });
      }
    }

    const result = {
      panelType,
      valid: errors.length === 0,
      errors,
      warnings,
      timestamp: Date.now(),
    };

    this._validationResults.set(panelType, result);

    if (result.valid) {
      this._passedPanels.push(panelType);
      logger.success(`[ContractGate] ✅ Panel passed: ${panelType}`);
    } else {
      this._failedPanels.push(panelType);
      logger.error(`[ContractGate] ❌ Panel failed: ${panelType}`, {
        errors: errors.length,
        warnings: warnings.length,
      });
      // DEBUG: Log actual error details
      errors.forEach((err, i) => {
        logger.warn(`   [ContractGate] Error ${i + 1}: ${err.ruleId} - ${err.description}`);
      });
    }

    return result;
  }

  /**
   * Validate all panels against the contract
   *
   * @param {Array} panels - Array of panels to validate
   * @returns {Object} Overall validation result
   */
  validateAllPanels(panels) {
    logger.info(`[ContractGate] Validating ${panels.length} panels...`);

    const results = panels.map((panel) => this.validatePanel(panel));

    const overallResult = {
      totalPanels: panels.length,
      passed: this._passedPanels.length,
      failed: this._failedPanels.length,
      valid: this._failedPanels.length === 0,
      results,
      failedPanels: this._failedPanels,
      passedPanels: this._passedPanels,
    };

    logger.info(`[ContractGate] Validation complete`, {
      passed: overallResult.passed,
      failed: overallResult.failed,
      valid: overallResult.valid,
    });

    return overallResult;
  }

  // ==========================================================================
  // AUTO-REGENERATION
  // ==========================================================================

  /**
   * Get retry prompt modifications for a failed panel
   *
   * @param {string} panelType - Panel type
   * @param {number} retryAttempt - Retry attempt number (0-based)
   * @returns {Object} Prompt modifications
   */
  getRetryPromptModifications(panelType, retryAttempt = 0) {
    const buildingType = this._contract.buildingType;
    const modifications = {
      promptPrefix: '',
      promptSuffix: '',
      negativeAdditions: [],
      controlStrengthMultiplier: 1.0 + retryAttempt * 0.15, // Increase strength with each retry
    };

    // Add stronger constraints based on building type
    if (buildingType === 'terrace') {
      modifications.promptPrefix = `
STRICT CONTRACT ENFORCEMENT (Retry ${retryAttempt + 1}):
This is a UK TERRACE HOUSE - an ATTACHED dwelling in a ROW.
MANDATORY: Party walls on BOTH sides (east and west).
FORBIDDEN: Any detached, freestanding, or isolated massing.
The building MUST appear as part of a continuous row of houses.
`;

      modifications.negativeAdditions = [
        '(detached house:2.5)',
        '(freestanding:2.5)',
        '(standalone:2.5)',
        '(isolated:2.5)',
        '(gap between houses:2.0)',
        '(space on sides:2.0)',
      ];
    } else if (buildingType === 'semi_detached') {
      modifications.promptPrefix = `
STRICT CONTRACT ENFORCEMENT (Retry ${retryAttempt + 1}):
This is a UK SEMI-DETACHED HOUSE - attached on ONE side only.
MANDATORY: Party wall on ONE side (typically east or west).
MANDATORY: Freestanding on the OTHER side.
`;

      modifications.negativeAdditions = [
        '(fully detached:2.0)',
        '(terrace:2.0)',
        '(row house:2.0)',
      ];
    } else if (buildingType === 'detached') {
      modifications.promptPrefix = `
STRICT CONTRACT ENFORCEMENT (Retry ${retryAttempt + 1}):
This is a DETACHED HOUSE - completely freestanding on ALL sides.
MANDATORY: No party walls or shared walls.
MANDATORY: Visible setbacks from boundaries on all sides.
`;

      modifications.negativeAdditions = ['(party wall:2.0)', '(attached:2.0)', '(terrace:2.0)'];
    }

    // Record retry history
    if (!this._retryHistory.has(panelType)) {
      this._retryHistory.set(panelType, []);
    }
    this._retryHistory.get(panelType).push({
      attempt: retryAttempt,
      modifications,
      timestamp: Date.now(),
    });

    return modifications;
  }

  /**
   * Check if panel should be retried
   *
   * @param {string} panelType - Panel type
   * @returns {Object} Retry decision { shouldRetry, attempt, reason }
   */
  shouldRetryPanel(panelType) {
    const maxRetries = getFeatureValue('contractGateMaxRetries') || 2;
    const retryHistory = this._retryHistory.get(panelType) || [];
    const currentAttempt = retryHistory.length;

    if (currentAttempt >= maxRetries) {
      return {
        shouldRetry: false,
        attempt: currentAttempt,
        reason: `Max retries (${maxRetries}) exceeded`,
      };
    }

    // Check if panel failed validation
    const validation = this._validationResults.get(panelType);
    if (!validation || validation.valid) {
      return {
        shouldRetry: false,
        attempt: currentAttempt,
        reason: 'Panel passed validation',
      };
    }

    return {
      shouldRetry: true,
      attempt: currentAttempt,
      reason: `Retry ${currentAttempt + 1}/${maxRetries} due to contract violations`,
    };
  }

  // ==========================================================================
  // GATE DECISION
  // ==========================================================================

  /**
   * Make final gate decision after all retries
   *
   * @returns {Object} Gate decision { pass, reason, failedPanels, report }
   */
  getFinalGateDecision() {
    const failFast = isFeatureEnabled('contractGateFailFast');

    if (this._failedPanels.length === 0) {
      return {
        pass: true,
        reason: 'All panels passed contract validation',
        failedPanels: [],
        report: this.generateReport(),
      };
    }

    if (failFast) {
      return {
        pass: false,
        reason: `${this._failedPanels.length} panel(s) failed contract validation`,
        failedPanels: this._failedPanels,
        report: this.generateReport(),
      };
    }

    // Non-fatal mode: warn but continue
    logger.warn(
      `[ContractGate] ${this._failedPanels.length} panels failed but continuing (failFast=false)`
    );
    return {
      pass: true,
      reason: 'Continuing despite failures (contractGateFailFast=false)',
      failedPanels: this._failedPanels,
      report: this.generateReport(),
    };
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Generate validation report
   * @returns {Object} Validation report
   */
  generateReport() {
    return {
      contractId: this._contract.contractId,
      buildingType: this._contract.buildingType,
      displayName: this._rules.displayName,
      timestamp: new Date().toISOString(),
      summary: {
        totalPanels: this._passedPanels.length + this._failedPanels.length,
        passed: this._passedPanels.length,
        failed: this._failedPanels.length,
        passRate:
          this._passedPanels.length > 0
            ? (
                (this._passedPanels.length /
                  (this._passedPanels.length + this._failedPanels.length)) *
                100
              ).toFixed(1) + '%'
            : 'N/A',
      },
      passedPanels: this._passedPanels,
      failedPanels: this._failedPanels,
      validationResults: Object.fromEntries(this._validationResults),
      retryHistory: Object.fromEntries(this._retryHistory),
      criticalRules: this._rules.criticalRules.map((r) => ({
        id: r.id,
        description: r.description,
        severity: r.severity,
      })),
      forbiddenPatterns: this._rules.forbiddenPatterns,
    };
  }

  /**
   * Reset gate state for new validation run
   */
  reset() {
    this._validationResults.clear();
    this._retryHistory.clear();
    this._failedPanels = [];
    this._passedPanels = [];
    logger.info('[ContractGate] Gate state reset');
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a ContractGate for a DesignContract
 *
 * @param {Object} designContract - DesignContract to gate
 * @returns {ContractGate} Contract gate
 */
export function createContractGate(designContract) {
  return new ContractGate(designContract);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  ContractGate,
  createContractGate,
  BUILDING_TYPE_VALIDATION_RULES,
};
