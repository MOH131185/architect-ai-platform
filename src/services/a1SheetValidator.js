/**
 * A1 Sheet Validator
 *
 * Validates generated A1 architectural sheets for:
 * - View completeness (all required sections present)
 * - Title block content
 * - Material consistency
 * - Dimension accuracy
 * - Professional quality standards
 */

class A1SheetValidator {
  constructor() {
    this.requiredSections = [
      'LOCATION PLAN',
      'GROUND FLOOR PLAN',
      'ELEVATION',
      'SECTION',
      '3D VIEW',
      'MATERIAL PALETTE',
      'TITLE BLOCK',
      'PROJECT DATA'
    ];

    this.requiredTitleBlockFields = [
      'PROJECT',
      'ARCHITECT',
      'DRAWING NO',
      'SCALE',
      'DATE',
      'RIBA STAGE'
    ];
  }

  /**
   * Validate complete A1 sheet result
   * @param {Object} a1Result - A1 sheet generation result
   * @param {Object} masterDNA - Master Design DNA used for generation
   * @param {Object} blendedStyle - Blended style with color palette
   * @returns {Object} { valid: boolean, score: number, issues: [], warnings: [], suggestions: [] }
   */
  validateA1Sheet(a1Result, masterDNA, blendedStyle) {
    console.log('🔍 Starting A1 sheet validation...');

    const validation = {
      valid: true,
      score: 100,
      issues: [],
      warnings: [],
      suggestions: [],
      checks: {}
    };

    // Check 1: Result structure
    validation.checks.structure = this.validateStructure(a1Result);
    if (!validation.checks.structure.passed) {
      validation.valid = false;
      validation.score -= 30;
      validation.issues.push(...validation.checks.structure.issues);
    }

    // Check 2: Image quality
    if (a1Result.url) {
      validation.checks.imageQuality = this.validateImageQuality(a1Result);
      if (!validation.checks.imageQuality.passed) {
        validation.score -= 15;
        validation.warnings.push(...validation.checks.imageQuality.warnings);
      }
    }

    // Check 3: Prompt completeness
    if (a1Result.prompt) {
      validation.checks.promptCompleteness = this.validatePromptCompleteness(a1Result.prompt);
      if (!validation.checks.promptCompleteness.passed) {
        validation.score -= 10;
        validation.warnings.push(...validation.checks.promptCompleteness.warnings);
      }
    }

    // Check 4: Material consistency
    if (masterDNA && blendedStyle) {
      validation.checks.materialConsistency = this.validateMaterialConsistency(
        a1Result.prompt,
        masterDNA,
        blendedStyle
      );
      if (!validation.checks.materialConsistency.passed) {
        validation.score -= 20;
        validation.issues.push(...validation.checks.materialConsistency.issues);
      }
    }

    // Check 5: Metadata completeness
    if (a1Result.metadata) {
      validation.checks.metadata = this.validateMetadata(a1Result.metadata);
      if (!validation.checks.metadata.passed) {
        validation.score -= 5;
        validation.suggestions.push(...validation.checks.metadata.suggestions);
      }
    }

    // Final score adjustment
    validation.score = Math.max(0, Math.min(100, validation.score));
    validation.valid = validation.score >= 70; // 70% minimum for validity

    console.log(`✅ Validation complete: ${validation.score}% score`);
    console.log(`   Issues: ${validation.issues.length}, Warnings: ${validation.warnings.length}`);

    return validation;
  }

  /**
   * Validate result structure
   */
  validateStructure(a1Result) {
    const check = { passed: true, issues: [] };

    if (!a1Result) {
      check.passed = false;
      check.issues.push('A1 result object is null or undefined');
      return check;
    }

    if (!a1Result.url || typeof a1Result.url !== 'string') {
      check.passed = false;
      check.issues.push('Missing or invalid image URL');
    }

    if (!a1Result.prompt || typeof a1Result.prompt !== 'string') {
      check.passed = false;
      check.issues.push('Missing or invalid generation prompt');
    }

    if (!a1Result.metadata || typeof a1Result.metadata !== 'object') {
      check.passed = false;
      check.issues.push('Missing metadata object');
    }

    return check;
  }

  /**
   * Validate image quality parameters
   */
  validateImageQuality(a1Result) {
    const check = { passed: true, warnings: [] };

    const meta = a1Result.metadata || {};

    // 🔒 LANDSCAPE ENFORCEMENT: A1 sheets are ALWAYS landscape (width > height)
    const isLandscape = meta.orientation === 'landscape' || (meta.width && meta.height && meta.width > meta.height);

    // Validate that image is actually landscape
    if (!isLandscape) {
      check.passed = false;
      check.warnings.push('CRITICAL: Image appears to be portrait orientation. A1 sheets must be landscape (width > height).');
    }

    // Check resolution (A1 landscape should be 1792×1269 minimum for Together.ai, 9933×7016 for 300 DPI)
    const minWidth = 1792; // FIXED: Always landscape minimum
    const minHeight = 1269; // FIXED: Always landscape minimum
    
    if (meta.width && meta.width < minWidth) {
      check.passed = false;
      check.warnings.push(`Image width ${meta.width}px is below recommended ${minWidth}px for A1 ${isLandscape ? 'landscape' : 'portrait'}`);
    }

    if (meta.height && meta.height < minHeight) {
      check.passed = false;
      check.warnings.push(`Image height ${meta.height}px is below recommended ${minHeight}px for A1 ${isLandscape ? 'landscape' : 'portrait'}`);
    }

    // Check aspect ratio (A1 landscape is ALWAYS 1.414:1)
    if (meta.width && meta.height) {
      const aspectRatio = meta.width / meta.height;
      const targetRatio = 1.414; // FIXED: Always landscape A1 (841×594mm)
      const deviation = Math.abs(aspectRatio - targetRatio);

      // Strict landscape validation
      if (aspectRatio < 1.0) {
        check.passed = false;
        check.warnings.push(
          `CRITICAL: Aspect ratio ${aspectRatio.toFixed(3)} indicates portrait orientation. A1 sheets must be landscape (aspect ratio > 1.0).`
        );
      } else if (deviation > 0.05) {
        check.warnings.push(
          `Aspect ratio ${aspectRatio.toFixed(3)} deviates from A1 landscape standard ${targetRatio} by ${(deviation * 100).toFixed(1)}%`
        );
      }

      // Validate metadata matches actual orientation
      if (meta.orientation && meta.orientation !== 'landscape') {
        check.passed = false;
        check.warnings.push('CRITICAL: Metadata indicates non-landscape orientation. A1 sheets must be landscape.');
      }
    }

    // Check if seed is present (for reproducibility)
    if (!a1Result.seed && !meta.seed) {
      check.warnings.push('Missing seed value - design may not be reproducible');
    }

    return check;
  }

  /**
   * Validate prompt completeness (check for required sections)
   */
  validatePromptCompleteness(prompt) {
    const check = { passed: true, warnings: [] };

    // Check for required section keywords
    const missingSections = this.requiredSections.filter(section => {
      return !prompt.toUpperCase().includes(section);
    });

    if (missingSections.length > 0) {
      check.passed = false;
      check.warnings.push(
        `Prompt missing ${missingSections.length} required sections: ${missingSections.join(', ')}`
      );
    }
    
    // 🗺️ SITE PLAN VALIDATION: Check for site plan presence and position
    const hasSitePlan = prompt.toUpperCase().includes('SITE PLAN') ||
                        prompt.toUpperCase().includes('LOCATION PLAN') ||
                        prompt.toUpperCase().includes('SITE PLAN IMAGE PROVIDED') ||
                        prompt.toUpperCase().includes('SITE PLAN PLACEHOLDER');

    if (!hasSitePlan) {
      check.passed = false;
      check.warnings.push('CRITICAL: Site plan section not specified in prompt. Site plan is mandatory for A1 sheets.');
    }

    // Check for site plan position enforcement (top-left)
    const hasSitePlanPosition = prompt.toUpperCase().includes('TOP-LEFT') ||
                                 prompt.toUpperCase().includes('TOP LEFT');

    if (hasSitePlan && !hasSitePlanPosition) {
      check.warnings.push('Site plan position not specified. Should be locked to top-left corner.');
    }

    // Check for landscape orientation in prompt
    const hasLandscapeKeyword = prompt.toUpperCase().includes('LANDSCAPE') ||
                                 prompt.includes('841×594') ||
                                 prompt.includes('841 × 594') ||
                                 prompt.includes('WIDTH > HEIGHT');

    if (!hasLandscapeKeyword) {
      check.passed = false;
      check.warnings.push('CRITICAL: Landscape orientation not clearly specified in prompt.');
    }

    // Check for title block fields
    const missingTitleFields = this.requiredTitleBlockFields.filter(field => {
      return !prompt.toUpperCase().includes(field);
    });

    if (missingTitleFields.length > 0) {
      check.warnings.push(
        `Title block missing ${missingTitleFields.length} fields: ${missingTitleFields.join(', ')}`
      );
    }

    return check;
  }

  /**
   * Validate material consistency in prompt
   */
  validateMaterialConsistency(prompt, masterDNA, blendedStyle) {
    const check = { passed: true, issues: [] };

    if (!prompt) {
      check.passed = false;
      check.issues.push('No prompt provided for material validation');
      return check;
    }

    // Check if blended style colors are mentioned in prompt
    if (blendedStyle && blendedStyle.colorPalette) {
      const palette = blendedStyle.colorPalette;

      if (palette.facade && !prompt.includes(palette.facade)) {
        check.passed = false;
        check.issues.push(`Facade color ${palette.facade} not found in prompt - inconsistency risk`);
      }

      if (palette.roof && !prompt.includes(palette.roof)) {
        check.passed = false;
        check.issues.push(`Roof color ${palette.roof} not found in prompt - inconsistency risk`);
      }

      if (palette.trim) {
        // White trim (#FFFFFF or #ffffff) is often implicit in architectural renders
        // Skip validation for white trim colors
        const isWhiteTrim = palette.trim.toUpperCase() === '#FFFFFF' ||
                           palette.trim.toUpperCase() === '#FFF' ||
                           palette.trim.toLowerCase() === 'white';

        if (!isWhiteTrim && !prompt.includes(palette.trim) && !prompt.toLowerCase().includes('trim')) {
          check.passed = false;
          check.issues.push(`Trim color ${palette.trim} not found in prompt - inconsistency risk`);
        }
      }
    }

    // Check if DNA materials are referenced
    if (masterDNA && masterDNA.materials) {
      const materials = Array.isArray(masterDNA.materials) ? masterDNA.materials : [];

      materials.forEach((material, idx) => {
        if (material.hexColor && !prompt.includes(material.hexColor)) {
          check.warnings = check.warnings || [];
          check.warnings.push(
            `Material ${idx + 1} color ${material.hexColor} (${material.name}) not explicitly referenced in prompt`
          );
        }
      });
    }

    // Check for consistency keywords
    const consistencyKeywords = [
      'EXACTLY',
      'IDENTICAL',
      'CONSISTENT',
      'ALL VIEWS',
      'SAME',
      'NO VARIATION'
    ];

    const foundKeywords = consistencyKeywords.filter(keyword =>
      prompt.toUpperCase().includes(keyword)
    );

    if (foundKeywords.length < 3) {
      check.issues.push(
        `Insufficient consistency enforcement - only ${foundKeywords.length}/6 keywords found in prompt`
      );
    }

    return check;
  }

  /**
   * Validate metadata completeness
   */
  validateMetadata(metadata) {
    const check = { passed: true, suggestions: [] };

    const recommendedFields = [
      'width',
      'height',
      'aspectRatio',
      'format',
      'generationTime',
      'designId',
      'sha256Hash'
    ];

    const missingFields = recommendedFields.filter(field => !metadata[field]);

    if (missingFields.length > 0) {
      check.suggestions.push(
        `Consider adding metadata fields: ${missingFields.join(', ')} for better traceability`
      );
    }

    // Check if design hash is present for verification
    if (!metadata.sha256Hash && !metadata.designId) {
      check.passed = false;
      check.suggestions.push('Add design hash (SHA256) or unique ID for verification and version control');
    }

    return check;
  }

  /**
   * Generate validation report summary
   */
  generateReport(validation) {
    const report = {
      timestamp: new Date().toISOString(),
      overallScore: validation.score,
      passed: validation.valid,
      summary: {
        totalChecks: Object.keys(validation.checks).length,
        passedChecks: Object.values(validation.checks).filter(c => c.passed).length,
        issues: validation.issues.length,
        warnings: validation.warnings.length,
        suggestions: validation.suggestions.length
      },
      details: validation.checks,
      recommendations: this.generateRecommendations(validation)
    };

    return report;
  }

  /**
   * Generate improvement recommendations based on validation
   */
  generateRecommendations(validation) {
    const recommendations = [];

    if (validation.score < 70) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Regenerate A1 sheet',
        reason: 'Validation score below 70% threshold - critical issues detected'
      });
    }

    if (validation.issues.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Fix critical issues',
        issues: validation.issues.slice(0, 3), // Top 3 issues
        reason: 'Critical issues affecting sheet quality'
      });
    }

    if (validation.warnings.length > 3) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Review prompt engineering',
        reason: `${validation.warnings.length} warnings detected - may indicate incomplete specifications`
      });
    }

    if (validation.suggestions.length > 0) {
      recommendations.push({
        priority: 'LOW',
        action: 'Enhance metadata',
        suggestions: validation.suggestions,
        reason: 'Improve traceability and version control'
      });
    }

    // Score-based recommendations
    if (validation.score >= 95) {
      recommendations.push({
        priority: 'INFO',
        action: 'Excellent quality - ready for client review',
        reason: 'A1 sheet meets all professional standards'
      });
    } else if (validation.score >= 85) {
      recommendations.push({
        priority: 'INFO',
        action: 'Good quality - minor improvements possible',
        reason: 'A1 sheet is acceptable with room for optimization'
      });
    }

    return recommendations;
  }
}

// Export singleton instance
const a1SheetValidator = new A1SheetValidator();

export default a1SheetValidator;
export { A1SheetValidator };
