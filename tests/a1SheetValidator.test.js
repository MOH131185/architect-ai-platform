/**
 * Unit tests for A1 Sheet Validator
 * Tests template spec, completeness validation, and quality checks
 */

import a1SheetValidator from '../src/services/a1SheetValidator';

describe('A1SheetValidator', () => {
  describe('Template Specification', () => {
    test('should have canonical A1 template spec', () => {
      expect(a1SheetValidator.a1TemplateSpec).toBeDefined();
      expect(a1SheetValidator.a1TemplateSpec.mandatory).toBeInstanceOf(Array);
      expect(a1SheetValidator.a1TemplateSpec.recommended).toBeInstanceOf(Array);
    });

    test('should include all mandatory sections', () => {
      const mandatory = a1SheetValidator.a1TemplateSpec.mandatory;
      const mandatoryIds = mandatory.map(s => s.id);

      expect(mandatoryIds).toContain('site-context');
      expect(mandatoryIds).toContain('ground-floor-plan');
      expect(mandatoryIds).toContain('elevations');
      expect(mandatoryIds).toContain('sections');
      expect(mandatoryIds).toContain('3d-exterior');
      expect(mandatoryIds).toContain('material-palette');
      expect(mandatoryIds).toContain('title-block');
    });

    test('should specify minimum counts for multi-instance sections', () => {
      const elevations = a1SheetValidator.a1TemplateSpec.mandatory.find(s => s.id === 'elevations');
      const sections = a1SheetValidator.a1TemplateSpec.mandatory.find(s => s.id === 'sections');

      expect(elevations.minCount).toBe(2);
      expect(elevations.idealCount).toBe(4);
      expect(sections.minCount).toBe(1);
      expect(sections.idealCount).toBe(2);
    });
  });

  describe('getRequiredSections', () => {
    test('should return mandatory sections for single-storey building', () => {
      const sections = a1SheetValidator.getRequiredSections({ floors: 1 });
      
      expect(sections.length).toBeGreaterThanOrEqual(7); // 7 mandatory
      expect(sections.some(s => s.id === 'ground-floor-plan')).toBe(true);
      expect(sections.some(s => s.id === 'site-context')).toBe(true);
    });

    test('should include upper floor for multi-storey building', () => {
      const sections = a1SheetValidator.getRequiredSections({ floors: 2 });
      
      expect(sections.some(s => s.id === 'upper-floor-plan')).toBe(true);
    });

    test('should always include interior and environmental sections', () => {
      const sections = a1SheetValidator.getRequiredSections({});
      
      expect(sections.some(s => s.id === 'interior-view')).toBe(true);
      expect(sections.some(s => s.id === 'environmental')).toBe(true);
    });
  });

  describe('validateA1TemplateCompleteness', () => {
    const mockDNA = {
      dimensions: { length: 15, width: 10, height: 7, floorCount: 2 },
      materials: [
        { name: 'Brick', hexColor: '#8B4513' },
        { name: 'Glass', hexColor: '#87CEEB' }
      ],
      architecturalStyle: 'Contemporary'
    };

    test('should pass for complete prompt with all mandatory sections', () => {
      const completePrompt = `
        Professional A1 sheet with:
        SITE PLAN showing location context
        GROUND FLOOR PLAN with all rooms
        NORTH ELEVATION, SOUTH ELEVATION, EAST ELEVATION, WEST ELEVATION
        SECTION A-A longitudinal, SECTION B-B transverse
        3D EXTERIOR VIEW photorealistic
        MATERIAL PALETTE with specifications
        TITLE BLOCK with project information
      `;

      const validation = a1SheetValidator.validateA1TemplateCompleteness({
        prompt: completePrompt,
        masterDNA: mockDNA,
        projectContext: { floors: 2 }
      });

      expect(validation.valid).toBe(true);
      expect(validation.missingMandatory.length).toBe(0);
      expect(validation.score).toBeGreaterThanOrEqual(85);
    });

    test('should fail for incomplete prompt missing mandatory sections', () => {
      const incompletePrompt = `
        A1 sheet with:
        GROUND FLOOR PLAN
        3D VIEW
      `;

      const validation = a1SheetValidator.validateA1TemplateCompleteness({
        prompt: incompletePrompt,
        masterDNA: mockDNA,
        projectContext: {}
      });

      expect(validation.valid).toBe(false);
      expect(validation.missingMandatory.length).toBeGreaterThan(0);
      expect(validation.score).toBeLessThan(100);
    });

    test('should detect missing elevations', () => {
      const promptWithOneElevation = `
        SITE PLAN, GROUND FLOOR PLAN, NORTH ELEVATION, SECTION A-A, 
        3D VIEW, MATERIAL PALETTE, TITLE BLOCK
      `;

      const validation = a1SheetValidator.validateA1TemplateCompleteness({
        prompt: promptWithOneElevation,
        masterDNA: mockDNA,
        projectContext: {}
      });

      const elevationCheck = validation.details['elevations'];
      expect(elevationCheck.count).toBeLessThan(elevationCheck.idealCount);
    });

    test('should detect missing sections', () => {
      const promptWithoutSections = `
        SITE PLAN, GROUND FLOOR PLAN, NORTH ELEVATION, SOUTH ELEVATION,
        3D VIEW, MATERIAL PALETTE, TITLE BLOCK
      `;

      const validation = a1SheetValidator.validateA1TemplateCompleteness({
        prompt: promptWithoutSections,
        masterDNA: mockDNA,
        projectContext: {}
      });

      const sectionCheck = validation.details['sections'];
      expect(sectionCheck.found).toBe(false);
    });

    test('should warn about missing upper floor for multi-storey building', () => {
      const promptWithoutUpperFloor = `
        SITE PLAN, GROUND FLOOR PLAN, ELEVATIONS, SECTIONS,
        3D VIEW, MATERIAL PALETTE, TITLE BLOCK
      `;

      const validation = a1SheetValidator.validateA1TemplateCompleteness({
        prompt: promptWithoutUpperFloor,
        masterDNA: mockDNA,
        projectContext: { floors: 3 }
      });

      expect(validation.missingRecommended.some(m => m.includes('Upper Floor'))).toBe(true);
    });
  });

  describe('validatePanelMetadata', () => {
    test('should fail when panels metadata missing', () => {
      const check = a1SheetValidator.validatePanelMetadata({ metadata: {} });
      expect(check.passed).toBe(false);
      expect(check.issues[0]).toContain('Metadata missing panels');
    });

    test('should identify missing mandatory panels', () => {
      const metadata = {
        panels: [
          { id: 'site', name: 'SITE PLAN' },
          { id: 'plan_ground', name: 'GROUND FLOOR PLAN' }
        ]
      };

      const check = a1SheetValidator.validatePanelMetadata({ metadata });
      expect(check.passed).toBe(false);
      expect(check.issues[0]).toContain('Missing mandatory panels');
    });
  });

  describe('validateA1Sheet', () => {
    const mockDNA = {
      dimensions: { length: 15, width: 10, height: 7 },
      materials: [{ name: 'Brick', hexColor: '#8B4513' }],
      architecturalStyle: 'Contemporary'
    };

    const mockBlendedStyle = {
      colorPalette: {
        facade: '#8B4513',
        roof: '#654321',
        trim: '#FFFFFF'
      }
    };

    const buildPanelMetadata = () => ([
      { id: 'site', name: 'SITE PLAN' },
      { id: 'plan_ground', name: 'GROUND FLOOR PLAN' },
      { id: 'elev_north', name: 'NORTH ELEVATION' },
      { id: 'elev_south', name: 'SOUTH ELEVATION' },
      { id: 'sect_long', name: 'SECTION A-A' },
      { id: 'v_exterior', name: '3D EXTERIOR VIEW' },
      { id: 'materials', name: 'MATERIAL PALETTE' },
      { id: 'title_block', name: 'TITLE BLOCK' }
    ]);

    test('should validate complete A1 sheet result', () => {
      const mockResult = {
        url: 'https://example.com/sheet.jpg',
        seed: 123456,
        prompt: 'SITE PLAN, GROUND FLOOR PLAN, ELEVATION, SECTION, 3D VIEW, MATERIAL PALETTE, TITLE BLOCK with #8B4513 facade',
        metadata: {
          width: 1792,
          height: 1269,
          orientation: 'landscape',
          designId: 'test-123',
          panels: buildPanelMetadata()
        }
      };

      const validation = a1SheetValidator.validateA1Sheet(
        mockResult,
        mockDNA,
        mockBlendedStyle
      );

      expect(validation).toBeDefined();
      expect(validation.score).toBeGreaterThan(0);
      expect(validation.valid).toBeDefined();
    });

    test('should detect missing URL', () => {
      const mockResult = {
        prompt: 'Complete prompt',
        metadata: {
          panels: buildPanelMetadata()
        }
      };

      const validation = a1SheetValidator.validateA1Sheet(
        mockResult,
        mockDNA,
        mockBlendedStyle
      );

      expect(validation.valid).toBe(false);
      expect(validation.issues.some(i => i.includes('URL'))).toBe(true);
    });

    test('should validate landscape orientation', () => {
      const mockResult = {
        url: 'https://example.com/sheet.jpg',
        prompt: 'Complete prompt',
        metadata: {
          width: 1269,
          height: 1792,
          orientation: 'portrait',
          panels: buildPanelMetadata()
        }
      };

      const validation = a1SheetValidator.validateA1Sheet(
        mockResult,
        mockDNA,
        mockBlendedStyle
      );

      expect(validation.checks.imageQuality.passed).toBe(false);
      expect(validation.checks.imageQuality.warnings.some(w => w.includes('portrait'))).toBe(true);
    });
  });

  describe('generateReport', () => {
    test('should generate comprehensive validation report', () => {
      const mockValidation = {
        valid: true,
        score: 95,
        issues: [],
        warnings: ['Minor warning'],
        suggestions: ['Add metadata'],
        checks: {
          structure: { passed: true },
          imageQuality: { passed: true },
          promptCompleteness: { passed: true }
        }
      };

      const report = a1SheetValidator.generateReport(mockValidation);

      expect(report).toBeDefined();
      expect(report.overallScore).toBe(95);
      expect(report.passed).toBe(true);
      expect(report.summary).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
    });

    test('should recommend regeneration for low scores', () => {
      const mockValidation = {
        valid: false,
        score: 65,
        issues: ['Critical issue'],
        warnings: [],
        suggestions: [],
        checks: {}
      };

      const report = a1SheetValidator.generateReport(mockValidation);

      expect(report.recommendations.some(r => r.action.includes('Regenerate'))).toBe(true);
      expect(report.recommendations.some(r => r.priority === 'HIGH')).toBe(true);
    });
  });
});

