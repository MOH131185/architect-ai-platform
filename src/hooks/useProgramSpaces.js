import { useCallback } from 'react';
import { useDesignContext } from '../context/DesignContext';
import { sanitizePromptInput, sanitizeDimensionInput } from '../utils/promptSanitizer';
import logger from '../utils/logger';

/**
 * useProgramSpaces - Program Space Generation Hook
 *
 * Handles AI-powered generation of program spaces (room schedules):
 * - Generate program spaces based on building type and area
 * - Provide default fallback spaces
 * - Validate and manage program spaces
 *
 * @returns {Object} Program space functions and state
 */
export const useProgramSpaces = () => {
  const {
    programSpaces,
    setProgramSpaces,
    projectDetails,
    isGeneratingSpaces,
    setIsGeneratingSpaces,
    showToast
  } = useDesignContext();

  /**
   * Default program spaces by building type (fallback)
   */
  const getDefaultProgramSpaces = useCallback((type) => {
    // Map building program values to simple keys
    const typeMap = {
      'detached-house': 'house',
      'semi-detached-house': 'house',
      'terraced-house': 'house',
      'villa': 'house',
      'cottage': 'house',
      'apartment-building': 'apartment',
      'condominium': 'apartment',
      'residential-tower': 'apartment',
      'clinic': 'hospital',
      'dental-clinic': 'hospital',
      'health-center': 'hospital',
      'pharmacy': 'retail',
      'office': 'office',
      'coworking': 'office',
      'retail': 'retail',
      'shopping-center': 'retail',
      'restaurant': 'retail',
      'cafe': 'retail',
      'school': 'school',
      'kindergarten': 'school',
      'training-center': 'office',
      'library': 'school'
    };

    const mappedType = typeMap[type] || type;

    const defaults = {
      'house': [
        { name: 'Living Room', area: '35', count: 1, level: 'Ground' },
        { name: 'Kitchen', area: '20', count: 1, level: 'Ground' },
        { name: 'Dining Area', area: '18', count: 1, level: 'Ground' },
        { name: 'WC', area: '4', count: 1, level: 'Ground' },
        { name: 'Master Bedroom', area: '20', count: 1, level: 'First' },
        { name: 'Bedroom', area: '15', count: 2, level: 'First' },
        { name: 'Bathroom', area: '8', count: 2, level: 'First' },
        { name: 'Hallway/Circulation', area: '15', count: 1, level: 'Ground' },
        { name: 'Storage', area: '8', count: 1, level: 'Ground' }
      ],
      'apartment': [
        { name: 'Living/Dining', area: '30', count: 1, level: 'Ground' },
        { name: 'Kitchen', area: '12', count: 1, level: 'Ground' },
        { name: 'Master Bedroom', area: '18', count: 1, level: 'Ground' },
        { name: 'Bedroom', area: '12', count: 2, level: 'Ground' },
        { name: 'Bathroom', area: '6', count: 2, level: 'Ground' },
        { name: 'Balcony', area: '8', count: 1, level: 'Ground' },
        { name: 'Storage', area: '4', count: 1, level: 'Ground' }
      ],
      'hospital': [
        { name: 'Reception/Waiting', area: '40', count: 1, level: 'Ground' },
        { name: 'Consultation Room', area: '18', count: 4, level: 'Ground' },
        { name: 'Treatment Room', area: '25', count: 2, level: 'Ground' },
        { name: 'Laboratory', area: '30', count: 1, level: 'Ground' },
        { name: 'Pharmacy', area: '20', count: 1, level: 'Ground' },
        { name: 'Staff Room', area: '15', count: 1, level: 'Ground' },
        { name: 'Storage', area: '12', count: 1, level: 'Ground' },
        { name: 'Restrooms', area: '10', count: 2, level: 'Ground' }
      ],
      'office': [
        { name: 'Open Office Area', area: '100', count: 1, level: 'Ground' },
        { name: 'Meeting Room', area: '25', count: 3, level: 'Ground' },
        { name: 'Private Office', area: '15', count: 4, level: 'Ground' },
        { name: 'Reception', area: '20', count: 1, level: 'Ground' },
        { name: 'Break Room', area: '18', count: 1, level: 'Ground' },
        { name: 'Server Room', area: '12', count: 1, level: 'Ground' },
        { name: 'Storage', area: '10', count: 1, level: 'Ground' }
      ],
      'retail': [
        { name: 'Sales Floor', area: '120', count: 1, level: 'Ground' },
        { name: 'Storage/Stock', area: '40', count: 1, level: 'Ground' },
        { name: 'Office', area: '15', count: 1, level: 'Ground' },
        { name: 'Staff Room', area: '12', count: 1, level: 'Ground' },
        { name: 'Restrooms', area: '8', count: 2, level: 'Ground' }
      ],
      'school': [
        { name: 'Classroom', area: '60', count: 8, level: 'Ground' },
        { name: 'Computer Lab', area: '80', count: 1, level: 'Ground' },
        { name: 'Library', area: '100', count: 1, level: 'Ground' },
        { name: 'Staff Room', area: '30', count: 1, level: 'Ground' },
        { name: 'Cafeteria', area: '120', count: 1, level: 'Ground' },
        { name: 'Administration', area: '40', count: 1, level: 'Ground' }
      ]
    };

    return defaults[mappedType] || defaults['house'];
  }, []);

  /**
   * Generate program spaces using AI
   */
  const generateProgramSpacesWithAI = useCallback(async (buildingProgram, totalArea) => {
    // Sanitize inputs for security
    const sanitizedProgram = sanitizePromptInput(buildingProgram, { maxLength: 100, allowNewlines: false });
    const sanitizedArea = sanitizeDimensionInput(totalArea);

    if (!sanitizedProgram || !sanitizedArea) {
      logger.debug('Skipping program space generation - inputs not provided yet');
      return [];
    }

    setIsGeneratingSpaces(true);
    logger.info('Generating program spaces with AI', {
      program: sanitizedProgram,
      area: `${sanitizedArea}m²`
    }, '🤖');

    try {
      // Import the reasoning service
      const togetherAIReasoningService = (await import('../services/togetherAIReasoningService')).default;

      const prompt = `You are an architectural programming expert. Generate a detailed room schedule for a ${sanitizedProgram} with a total area of ${sanitizedArea}m².

REQUIREMENTS:
- Total of all spaces should be approximately ${sanitizedArea}m² (allowing 10-15% for circulation)
- Include all necessary spaces for this building type
- Specify realistic area for each space in m²
- Indicate which floor level each space should be on
- Include appropriate count for repeated spaces

CRITICAL: Return ONLY a valid JSON array. No explanations, no markdown, no code blocks. Just the raw JSON array.

Format (copy this structure exactly with double quotes):
[
  {"name": "Space Name", "area": "50", "count": 1, "level": "Ground"},
  {"name": "Another Space", "area": "30", "count": 2, "level": "First"}
]

Building type: ${sanitizedProgram}
Total area: ${sanitizedArea}m²

IMPORTANT: Use double quotes for all strings, no trailing commas, no comments.`;

      const response = await togetherAIReasoningService.chatCompletion([
        {
          role: 'system',
          content: 'You are an architectural programming expert. Generate room schedules in JSON format only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        max_tokens: 1000,
        temperature: 0.7
      });

      // Extract content from Together.ai response structure
      const content = response?.choices?.[0]?.message?.content || '';

      if (content) {
        // Try to parse JSON from the response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const spaces = JSON.parse(jsonMatch[0]);
            if (Array.isArray(spaces) && spaces.length > 0) {
              logger.info('AI generated program spaces', { count: spaces.length }, '✅');
              return spaces;
            } else {
              logger.warn('AI returned empty or invalid array, using defaults');
            }
          } catch (parseError) {
            logger.warn('JSON parse error in AI response', parseError);
          }
        } else {
          logger.warn('No JSON array found in AI response');
        }
      }

      // Fallback to default spaces
      logger.info('AI generation failed, using defaults');
      return getDefaultProgramSpaces(buildingProgram);

    } catch (error) {
      logger.error('Error generating program spaces with AI', error);
      return getDefaultProgramSpaces(buildingProgram);
    } finally {
      setIsGeneratingSpaces(false);
    }
  }, [getDefaultProgramSpaces, setIsGeneratingSpaces]);

  /**
   * Auto-generate program spaces when building type or area changes
   */
  const autoGenerateProgramSpaces = useCallback(async () => {
    if (!projectDetails?.program || !projectDetails?.area) {
      logger.debug('Cannot auto-generate - missing program or area');
      return;
    }

    const spaces = await generateProgramSpacesWithAI(
      projectDetails.program,
      projectDetails.area
    );

    setProgramSpaces(spaces);
    showToast(`Generated ${spaces.length} program spaces`);
  }, [projectDetails, generateProgramSpacesWithAI, setProgramSpaces, showToast]);

  /**
   * Add a program space manually
   */
  const addProgramSpace = useCallback((space) => {
    const newSpace = {
      name: space.name || 'New Space',
      area: space.area || '20',
      count: space.count || 1,
      level: space.level || 'Ground'
    };

    setProgramSpaces(prev => [...prev, newSpace]);
    logger.info('Program space added', newSpace);
  }, [setProgramSpaces]);

  /**
   * Update a program space by index
   */
  const updateProgramSpace = useCallback((index, updates) => {
    setProgramSpaces(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });

    logger.info('Program space updated', { index, updates });
  }, [setProgramSpaces]);

  /**
   * Remove a program space by index
   */
  const removeProgramSpace = useCallback((index) => {
    setProgramSpaces(prev => prev.filter((_, i) => i !== index));
    logger.info('Program space removed', { index });
  }, [setProgramSpaces]);

  /**
   * Calculate total area of all program spaces
   */
  const getTotalArea = useCallback(() => {
    return programSpaces.reduce((total, space) => {
      const area = parseFloat(space.area) || 0;
      const count = parseInt(space.count) || 1;
      return total + (area * count);
    }, 0);
  }, [programSpaces]);

  /**
   * Validate program spaces against project area
   */
  const validateProgramSpaces = useCallback(() => {
    const totalArea = getTotalArea();
    const projectArea = parseFloat(projectDetails?.area) || 0;
    const errors = [];
    const warnings = [];

    if (programSpaces.length === 0) {
      errors.push('At least one program space is required');
    }

    if (projectArea > 0) {
      const ratio = totalArea / projectArea;

      if (ratio > 1.15) {
        errors.push(`Program spaces total ${totalArea.toFixed(1)}m² exceeds project area ${projectArea}m² by ${((ratio - 1) * 100).toFixed(0)}%`);
      }

      if (ratio < 0.70) {
        warnings.push(`Program spaces total ${totalArea.toFixed(1)}m² is only ${(ratio * 100).toFixed(0)}% of project area ${projectArea}m²`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalArea,
      projectArea,
      utilizationPercent: projectArea > 0 ? (totalArea / projectArea * 100).toFixed(0) : 0
    };
  }, [programSpaces, projectDetails, getTotalArea]);

  return {
    // State
    programSpaces,
    isGeneratingSpaces,

    // Actions
    generateProgramSpacesWithAI,
    autoGenerateProgramSpaces,
    addProgramSpace,
    updateProgramSpace,
    removeProgramSpace,

    // Utilities
    getTotalArea,
    validateProgramSpaces,
    getDefaultProgramSpaces,

    // Convenience flags
    hasProgramSpaces: programSpaces.length > 0,
    programSpaceCount: programSpaces.length
  };
};

export default useProgramSpaces;
