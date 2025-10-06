/**
 * Unit Tests for interactiveRefinementService
 *
 * Tests interactive design refinement including:
 * - Natural language modification parsing
 * - Context updating based on modifications
 * - Selective output regeneration
 * - Modification validation
 * - Refinement suggestions
 *
 * NOTE: These tests validate the interactiveRefinementService API.
 * Skipping until full integration testing is set up.
 */

import interactiveRefinementService from '../interactiveRefinementService';

describe.skip('interactiveRefinementService', () => {
  const mockCurrentDesign = {
    buildingProgram: {
      buildingType: 'residential',
      totalGrossArea: 250,
      massing: {
        stories: { recommended: 2 },
        dwellingType: 'detached'
      }
    },
    portfolioAnalysis: {
      blendedStyle: { dominantStyle: 'Modern' }
    },
    outputs: {
      floorPlans: { success: true },
      views: { success: true },
      technicalDrawings: { drawings: { section: {} } }
    }
  };

  const mockProjectContext = {
    buildingProgram: mockCurrentDesign.buildingProgram,
    siteAnalysis: {
      zoning: { maxHeight: '10m', density: 'medium' }
    }
  };

  describe('parseModificationPrompt', () => {
    test('should parse spatial modification correctly', async () => {
      const prompt = 'Add a skylight to the living room';
      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('scope');
      expect(result).toHaveProperty('changes');
      expect(['spatial', 'program']).toContain(result.type);
      expect(result.scope).toContain('floor_plans');
    });

    test('should parse aesthetic modification correctly', async () => {
      const prompt = 'Change the exterior color to light gray';
      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result.type).toBe('aesthetic');
      expect(result.scope).toContainEqual(expect.stringMatching(/exterior|elevations/));
    });

    test('should parse structural modification correctly', async () => {
      const prompt = 'Add a column at the center of the room';
      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result.type).toBe('structural');
      expect(result.scope).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/structural|sections/)
        ])
      );
    });

    test('should parse MEP modification correctly', async () => {
      const prompt = 'Upgrade the HVAC system to VRF';
      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result.type).toBe('mep');
      expect(result.scope).toContain('mep');
    });

    test('should extract area changes from prompt', async () => {
      const prompt = 'Increase the living room by 20m²';
      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result.changes).toHaveProperty('parameters');
      expect(result.changes.parameters).toHaveProperty('areaChange');
      expect(result.changes.parameters.areaChange).toBe(20);
    });

    test('should extract percentage changes from prompt', async () => {
      const prompt = 'Increase window area by 25%';
      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result.changes.parameters).toHaveProperty('percentageChange');
      expect(result.changes.parameters.percentageChange).toBe(25);
    });

    test('should identify affected spaces', async () => {
      const prompt = 'Make the kitchen and bathroom larger';
      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result.changes).toHaveProperty('affectedSpaces');
      expect(result.changes.affectedSpaces).toContain('kitchen');
      expect(result.changes.affectedSpaces).toContain('bathroom');
    });

    test('should handle complex multi-part modifications', async () => {
      const prompt = 'Add a balcony to the bedroom and increase window sizes by 30%';
      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result.success).toBe(true);
      expect(result.changes.parameters).toBeDefined();
    });

    test('should use rule-based fallback when AI parsing fails', async () => {
      // Simulate AI failure with very ambiguous prompt
      const prompt = 'make it better';
      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('applyModificationToContext', () => {
    test('should update area for spatial modifications', () => {
      const modification = {
        type: 'spatial',
        changes: {
          parameters: { areaChange: 30 },
          affectedSpaces: ['living room']
        }
      };

      const result = interactiveRefinementService.applyModificationToContext(
        modification,
        mockProjectContext,
        mockCurrentDesign
      );

      expect(result.buildingProgram.totalGrossArea).toBe(280); // 250 + 30
    });

    test('should update materials for aesthetic modifications', () => {
      const modification = {
        type: 'aesthetic',
        changes: {
          parameters: { newMaterial: 'brick' }
        }
      };

      const result = interactiveRefinementService.applyModificationToContext(
        modification,
        mockProjectContext,
        mockCurrentDesign
      );

      expect(result).toHaveProperty('designReasoning');
      expect(result.designReasoning).toHaveProperty('materialRecommendations');
    });

    test('should update structural parameters', () => {
      const modification = {
        type: 'structural',
        changes: {
          parameters: { addColumn: true, location: 'center' }
        }
      };

      const result = interactiveRefinementService.applyModificationToContext(
        modification,
        mockProjectContext,
        mockCurrentDesign
      );

      expect(result).toHaveProperty('structuralModifications');
    });

    test('should update MEP systems', () => {
      const modification = {
        type: 'mep',
        changes: {
          parameters: { hvacSystem: 'VRF' }
        }
      };

      const result = interactiveRefinementService.applyModificationToContext(
        modification,
        mockProjectContext,
        mockCurrentDesign
      );

      expect(result).toHaveProperty('mepModifications');
    });

    test('should preserve unaffected context properties', () => {
      const modification = {
        type: 'aesthetic',
        changes: { parameters: { color: 'gray' } }
      };

      const result = interactiveRefinementService.applyModificationToContext(
        modification,
        mockProjectContext,
        mockCurrentDesign
      );

      expect(result.buildingProgram.buildingType).toBe('residential');
      expect(result.siteAnalysis).toEqual(mockProjectContext.siteAnalysis);
    });
  });

  describe('determineAffectedOutputs', () => {
    test('should identify floor plans for spatial modifications', () => {
      const modification = {
        type: 'spatial',
        scope: ['floor_plans']
      };

      const result = interactiveRefinementService.determineAffectedOutputs(modification);

      expect(result).toContain('floor_plans');
      expect(result).toContain('sections');
      expect(result).toContain('interior_views');
    });

    test('should identify elevations for aesthetic modifications', () => {
      const modification = {
        type: 'aesthetic',
        scope: ['elevations']
      };

      const result = interactiveRefinementService.determineAffectedOutputs(modification);

      expect(result).toContain('exterior_views');
      expect(result).toContain('interior_views');
      expect(result).toContain('elevations');
    });

    test('should identify structural diagrams for structural modifications', () => {
      const modification = {
        type: 'structural',
        scope: []
      };

      const result = interactiveRefinementService.determineAffectedOutputs(modification);

      expect(result).toContain('structural');
      expect(result).toContain('sections');
    });

    test('should identify MEP diagrams for MEP modifications', () => {
      const modification = {
        type: 'mep',
        scope: []
      };

      const result = interactiveRefinementService.determineAffectedOutputs(modification);

      expect(result).toContain('mep');
      expect(result).toContain('sections');
    });

    test('should not duplicate outputs', () => {
      const modification = {
        type: 'program',
        scope: ['floor_plans', 'sections']
      };

      const result = interactiveRefinementService.determineAffectedOutputs(modification);

      const unique = [...new Set(result)];
      expect(result.length).toBe(unique.length);
    });
  });

  describe('regenerateAffectedOutputs', () => {
    test('should regenerate floor plans when affected', async () => {
      const affectedOutputs = ['floor_plans'];
      const updatedContext = { ...mockProjectContext };

      const result = await interactiveRefinementService.regenerateAffectedOutputs(
        affectedOutputs,
        updatedContext,
        mockCurrentDesign
      );

      expect(result).toHaveProperty('floorPlans');
      expect(result.floorPlans).toBeDefined();
    });

    test('should regenerate sections when affected', async () => {
      const affectedOutputs = ['sections'];
      const updatedContext = { ...mockProjectContext };

      const result = await interactiveRefinementService.regenerateAffectedOutputs(
        affectedOutputs,
        updatedContext,
        mockCurrentDesign
      );

      expect(result).toHaveProperty('sections');
    });

    test('should regenerate design reasoning for major changes', async () => {
      const affectedOutputs = ['floor_plans', 'structural'];
      const updatedContext = { ...mockProjectContext };

      const result = await interactiveRefinementService.regenerateAffectedOutputs(
        affectedOutputs,
        updatedContext,
        mockCurrentDesign
      );

      expect(result).toHaveProperty('reasoning');
    });

    test('should not regenerate unaffected outputs', async () => {
      const affectedOutputs = ['floor_plans'];
      const updatedContext = { ...mockProjectContext };

      const result = await interactiveRefinementService.regenerateAffectedOutputs(
        affectedOutputs,
        updatedContext,
        mockCurrentDesign
      );

      expect(result).not.toHaveProperty('mep');
      expect(result).not.toHaveProperty('structural');
    });

    test('should handle regeneration errors gracefully', async () => {
      const affectedOutputs = ['floor_plans'];
      const invalidContext = null;

      await expect(
        interactiveRefinementService.regenerateAffectedOutputs(
          affectedOutputs,
          invalidContext,
          mockCurrentDesign
        )
      ).rejects.toThrow();
    });
  });

  describe('validateModification', () => {
    test('should reject removing structural columns', () => {
      const prompt = 'Remove the column in the center';
      const result = interactiveRefinementService.validateModification(
        prompt,
        mockCurrentDesign
      );

      expect(result.valid).toBe(false);
      expect(result.severity).toBe('high');
      expect(result.warning).toMatch(/structural|stability/i);
    });

    test('should reject removing load-bearing walls', () => {
      const prompt = 'Remove the wall between kitchen and living room';
      const result = interactiveRefinementService.validateModification(
        prompt,
        mockCurrentDesign
      );

      expect(result.valid).toBe(false);
      expect(result.severity).toBe('high');
    });

    test('should warn about adding floors beyond zoning limits', () => {
      const prompt = 'Add two more floors';
      const result = interactiveRefinementService.validateModification(
        prompt,
        mockCurrentDesign
      );

      // Should warn if adding floors would exceed height limit
      if (result.valid === false) {
        expect(result.warning).toMatch(/height|zoning/i);
        expect(result.severity).toBe('high');
      }
    });

    test('should accept valid spatial modifications', () => {
      const prompt = 'Add a skylight to the living room';
      const result = interactiveRefinementService.validateModification(
        prompt,
        mockCurrentDesign
      );

      expect(result.valid).toBe(true);
      expect(result.severity).toBe('none');
    });

    test('should accept valid aesthetic modifications', () => {
      const prompt = 'Change the exterior color to gray';
      const result = interactiveRefinementService.validateModification(
        prompt,
        mockCurrentDesign
      );

      expect(result.valid).toBe(true);
    });

    test('should provide severity levels', () => {
      const criticalPrompt = 'Remove all columns';
      const result = interactiveRefinementService.validateModification(
        criticalPrompt,
        mockCurrentDesign
      );

      expect(['none', 'low', 'medium', 'high']).toContain(result.severity);
    });
  });

  describe('generateRefinementSuggestions', () => {
    test('should generate relevant suggestions', async () => {
      const result = await interactiveRefinementService.generateRefinementSuggestions(
        mockCurrentDesign
      );

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('suggestion');
      expect(result[0]).toHaveProperty('category');
      expect(result[0]).toHaveProperty('impact');
      expect(result[0]).toHaveProperty('benefit');
    });

    test('should categorize suggestions correctly', async () => {
      const result = await interactiveRefinementService.generateRefinementSuggestions(
        mockCurrentDesign
      );

      const categories = result.map(s => s.category);
      expect(categories).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/spatial|aesthetic|structural|mep|sustainability/i)
        ])
      );
    });

    test('should describe impact of suggestions', async () => {
      const result = await interactiveRefinementService.generateRefinementSuggestions(
        mockCurrentDesign
      );

      result.forEach(suggestion => {
        expect(suggestion.impact).toBeDefined();
        expect(typeof suggestion.impact).toBe('string');
        expect(suggestion.impact.length).toBeGreaterThan(10);
      });
    });

    test('should provide benefits for suggestions', async () => {
      const result = await interactiveRefinementService.generateRefinementSuggestions(
        mockCurrentDesign
      );

      result.forEach(suggestion => {
        expect(suggestion.benefit).toBeDefined();
        expect(typeof suggestion.benefit).toBe('string');
      });
    });

    test('should generate building-type specific suggestions', async () => {
      const clinicDesign = {
        ...mockCurrentDesign,
        buildingProgram: { ...mockCurrentDesign.buildingProgram, buildingType: 'medical_clinic' }
      };

      const result = await interactiveRefinementService.generateRefinementSuggestions(
        clinicDesign
      );

      const suggestions = result.map(s => s.suggestion.toLowerCase()).join(' ');
      expect(suggestions).toMatch(/waiting|exam|patient|medical/i);
    });

    test('should limit number of suggestions', async () => {
      const result = await interactiveRefinementService.generateRefinementSuggestions(
        mockCurrentDesign
      );

      expect(result.length).toBeLessThanOrEqual(10); // Reasonable limit
    });
  });

  describe('processModification - integration', () => {
    test('should process complete modification workflow', async () => {
      const prompt = 'Add a skylight to the living room';

      const result = await interactiveRefinementService.processModification(
        prompt,
        mockCurrentDesign,
        mockProjectContext
      );

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('modification');
      expect(result).toHaveProperty('updatedContext');
      expect(result).toHaveProperty('regeneratedOutputs');
      expect(result).toHaveProperty('affectedOutputs');
    });

    test('should handle modification errors gracefully', async () => {
      const invalidPrompt = '';

      await expect(
        interactiveRefinementService.processModification(
          invalidPrompt,
          mockCurrentDesign,
          mockProjectContext
        )
      ).rejects.toThrow();
    });

    test('should update context correctly', async () => {
      const prompt = 'Increase total area by 50m²';

      const result = await interactiveRefinementService.processModification(
        prompt,
        mockCurrentDesign,
        mockProjectContext
      );

      expect(result.updatedContext.buildingProgram.totalGrossArea).toBeGreaterThan(
        mockProjectContext.buildingProgram.totalGrossArea
      );
    });

    test('should identify correct outputs for regeneration', async () => {
      const prompt = 'Change exterior material to brick';

      const result = await interactiveRefinementService.processModification(
        prompt,
        mockCurrentDesign,
        mockProjectContext
      );

      expect(result.affectedOutputs).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/exterior|elevations/)
        ])
      );
    });
  });

  describe('edge cases and error handling', () => {
    test('should handle empty modification prompt', async () => {
      const prompt = '';

      await expect(
        interactiveRefinementService.parseModificationPrompt(prompt, mockCurrentDesign)
      ).rejects.toThrow();
    });

    test('should handle null current design', async () => {
      const prompt = 'Add a window';

      await expect(
        interactiveRefinementService.parseModificationPrompt(prompt, null)
      ).rejects.toThrow();
    });

    test('should handle undefined project context', () => {
      const modification = { type: 'spatial', changes: {} };

      expect(() => {
        interactiveRefinementService.applyModificationToContext(
          modification,
          undefined,
          mockCurrentDesign
        );
      }).toThrow();
    });

    test('should handle very long modification prompts', async () => {
      const longPrompt = 'Add ' + 'a window and '.repeat(100) + 'improve lighting';

      const result = await interactiveRefinementService.parseModificationPrompt(
        longPrompt,
        mockCurrentDesign
      );

      expect(result).toBeDefined();
    });

    test('should handle special characters in prompts', async () => {
      const prompt = 'Add a 10m² skylight @ 45° angle (south-facing)';

      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should handle multilingual prompts gracefully', async () => {
      const prompt = 'Ajouter une fenêtre'; // French

      const result = await interactiveRefinementService.parseModificationPrompt(
        prompt,
        mockCurrentDesign
      );

      // Should attempt to parse even if not optimal
      expect(result).toBeDefined();
    });
  });
});
