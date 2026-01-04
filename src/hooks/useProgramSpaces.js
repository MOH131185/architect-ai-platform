import { useCallback } from 'react';
import { useDesignContext } from '../context/DesignContext.jsx';
import { sanitizePromptInput, sanitizeDimensionInput } from '../utils/promptSanitizer.js';
import logger from '../utils/logger.js';

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
    showToast,
    siteMetrics  // For auto-level assignment based on site area
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
  const generateProgramSpacesWithAI = useCallback(async (buildingProgram, totalArea, siteArea = null) => {
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
      area: `${sanitizedArea}m²`,
      siteArea: siteArea ? `${siteArea}m²` : 'not provided'
    }, '🤖');

    try {
      // Import the reasoning service
      const togetherAIReasoningService = (await import('../services/togetherAIReasoningService')).default;

      const prompt = `You are an architectural programming expert with expertise in spatial organization and vertical circulation planning. Generate a detailed room schedule for a ${sanitizedProgram} with a total area of ${sanitizedArea}m².

REQUIREMENTS:
- Total of all spaces should be approximately ${sanitizedArea}m² (allowing 10-15% for circulation)
- Include all necessary spaces for this building type
- Specify realistic area for each space in m²
- CRITICAL: Intelligently assign floor levels based on function hierarchy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI REASONING REQUIRED: INTELLIGENT LEVEL ASSIGNMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Apply these ARCHITECTURAL PRINCIPLES for level assignment:

GROUND FLOOR (Highest priority for):
1. PUBLIC ACCESS SPACES: Reception, waiting areas, lobby, entrance halls
2. ACCESSIBILITY-CRITICAL: Spaces requiring wheelchair access (medical treatment, retail sales floor, public toilets)
3. HEAVY SERVICES: Kitchens, laboratories, mechanical rooms, storage with frequent deliveries
4. HIGH-TRAFFIC COMMERCIAL: Sales floors, cafes, restaurants, public dining
5. EMERGENCY ACCESS: First aid rooms, treatment rooms, consultation rooms

FIRST FLOOR (Second priority for):
1. SEMI-PRIVATE: Staff offices, administration, meeting rooms
2. SECONDARY SERVICES: Staff rooms, smaller kitchens, quiet areas
3. EDUCATIONAL: Classrooms (if multi-story school), libraries, study areas
4. RESIDENTIAL: Bedrooms, bathrooms (in houses), private living areas

SECOND+ FLOORS (Upper priority for):
1. MOST PRIVATE: Bedrooms, private studies, home offices (in residential)
2. SPECIALIZED: Server rooms, archives, upper-level storage
3. ROOFTOP AMENITIES: Terraces, roof gardens (if applicable)
4. VIEWS: Spaces benefiting from higher elevation (observation decks, executive offices)

BUILDING TYPE SPECIFIC RULES:

${sanitizedProgram.toLowerCase().includes('clinic') || sanitizedProgram.toLowerCase().includes('hospital') ? `
🏥 HEALTHCARE:
- Ground: Reception, waiting, consultation rooms, treatment rooms, laboratory, pharmacy (accessibility essential)
- First: Administration, staff rooms, medical records, specialized equipment
- NEVER: Bedrooms on ground floor unless specified` : ''}

${sanitizedProgram.toLowerCase().includes('office') ? `
🏢 OFFICE:
- Ground: Reception, lobby, meeting rooms, break room
- First+: Open office areas, private offices, conference rooms
- Top floor: Executive offices, boardrooms` : ''}

${sanitizedProgram.toLowerCase().includes('school') ? `
🏫 SCHOOL:
- Ground: Administration, cafeteria, library, gymnasium, science labs
- First+: Classrooms distributed across floors
- NEVER: All classrooms on ground (poor space efficiency)` : ''}

${sanitizedProgram.toLowerCase().includes('house') || sanitizedProgram.toLowerCase().includes('villa') ? `
🏠 RESIDENTIAL:
- Ground: Living room, dining, kitchen, WC, study
- First: Bedrooms, bathrooms, private spaces
- Second (if 3-story): Master suite, additional bedrooms
- NEVER: Kitchen on upper floor unless specified` : ''}

${sanitizedProgram.toLowerCase().includes('retail') || sanitizedProgram.toLowerCase().includes('shop') ? `
🏪 RETAIL:
- Ground: Sales floor, cashier, customer toilets (100% ground floor public access)
- First (if applicable): Storage, staff room, office
- NEVER: Sales areas on upper floors without elevator` : ''}

CIRCULATION LOGIC:
- If total area > 300m², consider distributing across 2+ floors
- Circulation space per floor: ~15-20% of floor area (hallways, stairs, lifts)
- Vertical access: Include "Staircase" (8-12m²) and "Lift" (6-8m²) if multi-floor

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
            let spaces = JSON.parse(jsonMatch[0]);
            if (Array.isArray(spaces) && spaces.length > 0) {
              logger.info('AI generated program spaces', { count: spaces.length }, '✅');

              // 🤖 AUTO-LEVEL ASSIGNMENT: Calculate optimal floors and assign spaces
              if (siteArea && siteArea > 0) {
                logger.info('🏢 Auto-calculating optimal floor count and assigning levels...', null, '🤖');

                try {
                  const autoLevelAssignmentService = (await import('../services/autoLevelAssignmentService')).default;

                  const result = autoLevelAssignmentService.autoAssignComplete(
                    spaces,
                    siteArea,
                    sanitizedProgram,
                    {} // constraints will come from location data in context
                  );

                  if (result.success) {
                    logger.info('✅ Auto-assignment complete:', {
                      floors: result.floorCount,
                      footprint: `${result.floorMetrics.actualFootprint.toFixed(0)}m²`,
                      coverage: `${result.floorMetrics.siteCoveragePercent.toFixed(1)}%`
                    }, '✅');

                    logger.info(`   ${result.summary.reasoning}`);

                    // Use auto-assigned spaces
                    spaces = result.assignedSpaces;

                    // Store floor count for later use
                    spaces._calculatedFloorCount = result.floorCount;
                    spaces._floorMetrics = result.floorMetrics;
                  } else {
                    logger.warn('Auto-assignment failed, using AI-assigned levels');
                  }
                } catch (autoError) {
                  logger.warn('Auto-level assignment error, using AI-assigned levels:', autoError.message);
                }
              } else {
                logger.info('⚠️ No site area provided, using AI-assigned levels only');
              }

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

    // Get site area from siteMetrics for auto-level assignment
    const siteArea = siteMetrics?.areaM2 || null;

    logger.info(`🏗️ Generating program spaces with auto-level assignment`, {
      program: projectDetails.program,
      totalArea: projectDetails.area,
      siteArea: siteArea ? `${siteArea.toFixed(0)}m²` : 'not available'
    });

    const spaces = await generateProgramSpacesWithAI(
      projectDetails.program,
      projectDetails.area,
      siteArea  // Pass siteArea for auto-level calculation
    );

    setProgramSpaces(spaces);
    showToast(`Generated ${spaces.length} program spaces with ${spaces._calculatedFloorCount || 'default'} floors`);
  }, [projectDetails, siteMetrics, generateProgramSpacesWithAI, setProgramSpaces, showToast]);

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
