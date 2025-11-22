/**
 * Intelligent Level Assignment Service
 *
 * AI-powered automatic floor/level assignment for program spaces
 * Based on architectural best practices, building type, and functional requirements
 */

class IntelligentLevelAssignment {
  constructor() {
    this.levelRules = this.initializeLevelRules();
  }

  /**
   * Initialize level assignment rules by space function
   */
  initializeLevelRules() {
    return {
      // Public/Customer-Facing Spaces (Always Ground Floor)
      reception: { preferredLevel: 'Ground', priority: 100, reason: 'Main entry point - accessibility' },
      lobby: { preferredLevel: 'Ground', priority: 100, reason: 'Main entry point' },
      entrance: { preferredLevel: 'Ground', priority: 100, reason: 'Building entry' },
      'waiting area': { preferredLevel: 'Ground', priority: 95, reason: 'Public access - accessibility' },
      'reception/lobby': { preferredLevel: 'Ground', priority: 100, reason: 'Main entry' },
      'emergency department': { preferredLevel: 'Ground', priority: 100, reason: 'Emergency access critical' },

      // Retail/Public Services (Ground Floor Preferred)
      'sales floor': { preferredLevel: 'Ground', priority: 90, reason: 'Public access and visibility' },
      'checkout area': { preferredLevel: 'Ground', priority: 90, reason: 'Part of main sales floor' },
      retail: { preferredLevel: 'Ground', priority: 85, reason: 'Customer accessibility' },
      shop: { preferredLevel: 'Ground', priority: 85, reason: 'Customer access' },
      cafe: { preferredLevel: 'Ground', priority: 80, reason: 'Public amenity' },
      restaurant: { preferredLevel: 'Ground', priority: 80, reason: 'Public dining' },

      // Healthcare Ground Floor (Accessibility)
      'consultation room': { preferredLevel: 'Ground', priority: 85, reason: 'Patient accessibility' },
      'treatment room': { preferredLevel: 'Ground', priority: 85, reason: 'Patient care accessibility' },
      'x-ray room': { preferredLevel: 'Ground', priority: 75, reason: 'Heavy equipment' },
      laboratory: { preferredLevel: 'Ground', priority: 70, reason: 'Equipment and access' },
      pharmacy: { preferredLevel: 'Ground', priority: 75, reason: 'Public access' },

      // Service/Support Spaces (Ground or Basement)
      kitchen: { preferredLevel: 'Ground', priority: 80, reason: 'Service delivery access' },
      'loading bay': { preferredLevel: 'Ground', priority: 95, reason: 'Vehicle access required' },
      storage: { preferredLevel: 'Ground', priority: 60, fallback: 'Basement', reason: 'Flexible placement' },
      'mechanical room': { preferredLevel: 'Basement', priority: 70, reason: 'Noise isolation' },
      'plant room': { preferredLevel: 'Basement', priority: 70, fallback: 'Roof', reason: 'Service distribution' },
      laundry: { preferredLevel: 'Ground', priority: 70, fallback: 'Basement', reason: 'Service area' },

      // Office/Administration (Can be Upper Floors)
      'open office': { preferredLevel: 'First', priority: 60, reason: 'Natural light and quiet' },
      'private office': { preferredLevel: 'First', priority: 60, reason: 'Privacy and focus' },
      'meeting room': { preferredLevel: 'First', priority: 50, reason: 'Flexible placement' },
      'conference room': { preferredLevel: 'First', priority: 55, reason: 'Executive level' },
      'executive office': { preferredLevel: 'Second', priority: 50, reason: 'Top floor prestige' },
      administration: { preferredLevel: 'First', priority: 60, reason: 'Staff area' },
      'staff room': { preferredLevel: 'Ground', priority: 70, reason: 'Staff accessibility' },

      // Residential Spaces (Distribute Vertically)
      'living room': { preferredLevel: 'Ground', priority: 85, reason: 'Main living area - entry level' },
      bedroom: { preferredLevel: 'First', priority: 80, reason: 'Privacy and security on upper floor' },
      'master bedroom': { preferredLevel: 'Second', priority: 75, reason: 'Maximum privacy' },
      bathroom: { preferredLevel: 'First', priority: 70, reason: 'Near bedrooms' },
      'en-suite': { preferredLevel: 'First', priority: 75, reason: 'Attached to bedroom' },

      // Education (Typically Ground/First Floor)
      classroom: { preferredLevel: 'Ground', priority: 75, fallback: 'First', reason: 'Accessibility for students' },
      library: { preferredLevel: 'First', priority: 65, reason: 'Quiet environment' },
      'science lab': { preferredLevel: 'Ground', priority: 80, reason: 'Equipment and safety' },
      'computer lab': { preferredLevel: 'First', priority: 60, reason: 'Climate controlled' },
      gymnasium: { preferredLevel: 'Ground', priority: 90, reason: 'High ceiling and accessibility' },
      'assembly hall': { preferredLevel: 'Ground', priority: 90, reason: 'Large gathering space' },
      cafeteria: { preferredLevel: 'Ground', priority: 85, reason: 'Service access' },

      // Hotel/Hospitality
      'guest room': { preferredLevel: 'First', priority: 70, reason: 'Upper floors for privacy' },
      'hotel room': { preferredLevel: 'First', priority: 70, reason: 'Upper floors' },
      suite: { preferredLevel: 'Second', priority: 65, reason: 'Premium upper floors' },
      'bar/lounge': { preferredLevel: 'Ground', priority: 75, reason: 'Public amenity' },
      'swimming pool': { preferredLevel: 'Ground', priority: 80, reason: 'Structural and waterproofing' },
      'spa/wellness': { preferredLevel: 'First', priority: 60, fallback: 'Basement', reason: 'Tranquil environment' },
      gym: { preferredLevel: 'Ground', priority: 70, fallback: 'Basement', reason: 'Heavy equipment' },

      // Circulation (All Floors)
      corridor: { preferredLevel: 'All', priority: 100, reason: 'Required on every floor' },
      circulation: { preferredLevel: 'All', priority: 100, reason: 'Required on every floor' },
      stairs: { preferredLevel: 'All', priority: 100, reason: 'Vertical circulation' },
      elevator: { preferredLevel: 'All', priority: 100, reason: 'Vertical circulation' },
      lobby: { preferredLevel: 'Ground', priority: 95, reason: 'Entry level' },

      // Utilities (Basement/Ground)
      'utility room': { preferredLevel: 'Ground', priority: 75, fallback: 'Basement', reason: 'Service area' },
      'server room': { preferredLevel: 'Ground', priority: 70, reason: 'Climate control and security' },
      'electrical room': { preferredLevel: 'Basement', priority: 75, reason: 'Service distribution' },
      wc: { preferredLevel: 'Ground', priority: 85, reason: 'Public accessibility' },
      'accessible wc': { preferredLevel: 'Ground', priority: 95, reason: 'Accessibility requirement' },
      'wc block': { preferredLevel: 'Ground', priority: 80, reason: 'Multiple floors if needed' },

      // Default fallback
      default: { preferredLevel: 'Ground', priority: 50, reason: 'Default level' }
    };
  }

  /**
   * Assign levels to program spaces intelligently
   * @param {Array} programSpaces - Array of program space objects
   * @param {Object} buildingSpec - Building specifications
   * @returns {Array} Program spaces with assigned levels
   */
  assignLevels(programSpaces, buildingSpec = {}) {
    const {
      floorCount = 2,
      category = 'residential',
      subType = '',
      totalArea = 0
    } = buildingSpec;

    // Determine available floors
    const availableFloors = this.getAvailableFloors(floorCount);

    // Create a copy of program spaces with level assignments
    const spacesWithLevels = programSpaces.map((space, index) => {
      const assignment = this.assignLevelToSpace(space, availableFloors, category, subType, programSpaces);

      return {
        ...space,
        level: assignment.level,
        levelReason: assignment.reason,
        levelConfidence: assignment.confidence,
        aiAssigned: true,
        originalLevel: space.level // Keep original if user had set one
      };
    });

    // Balance floors to distribute spaces evenly
    const balancedSpaces = this.balanceFloorsIfNeeded(spacesWithLevels, availableFloors, floorCount);

    return balancedSpaces;
  }

  /**
   * Assign level to a single space
   * @private
   */
  assignLevelToSpace(space, availableFloors, category, subType, allSpaces) {
    const spaceName = (space.label || space.name || '').toLowerCase();
    const spaceType = (space.spaceType || '').toLowerCase();

    // Find matching rule
    let rule = null;
    let matchType = null;

    // Try exact match on label
    if (this.levelRules[spaceName]) {
      rule = this.levelRules[spaceName];
      matchType = 'exact';
    }
    // Try exact match on type
    else if (this.levelRules[spaceType]) {
      rule = this.levelRules[spaceType];
      matchType = 'type';
    }
    // Try partial match
    else {
      for (const [key, value] of Object.entries(this.levelRules)) {
        if (key !== 'default' && (spaceName.includes(key) || key.includes(spaceName.split(' ')[0]))) {
          rule = value;
          matchType = 'partial';
          break;
        }
      }
    }

    // Use default if no match
    if (!rule) {
      rule = this.levelRules.default;
      matchType = 'default';
    }

    // Determine final level
    let assignedLevel = rule.preferredLevel;
    let confidence = matchType === 'exact' ? 0.95 : matchType === 'type' ? 0.85 : matchType === 'partial' ? 0.70 : 0.50;

    // Handle special cases
    if (assignedLevel === 'All') {
      assignedLevel = 'Ground'; // Default to ground for "All" floors
      confidence = 1.0;
    }

    // Check if preferred level is available
    if (!availableFloors.includes(assignedLevel)) {
      // Try fallback
      if (rule.fallback && availableFloors.includes(rule.fallback)) {
        assignedLevel = rule.fallback;
        confidence *= 0.9; // Slightly reduce confidence for fallback
      } else {
        // Pick nearest available floor
        assignedLevel = this.getNearestFloor(assignedLevel, availableFloors);
        confidence *= 0.8;
      }
    }

    // Apply building-type specific adjustments
    assignedLevel = this.applyBuildingTypeAdjustments(
      assignedLevel,
      space,
      category,
      subType,
      availableFloors
    );

    return {
      level: assignedLevel,
      reason: rule.reason || 'Auto-assigned',
      confidence: confidence,
      rule: matchType
    };
  }

  /**
   * Get available floors based on floor count
   * @private
   */
  getAvailableFloors(floorCount) {
    const floors = ['Ground'];

    const floorNames = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

    for (let i = 1; i < floorCount && i <= floorNames.length; i++) {
      floors.push(floorNames[i - 1]);
    }

    // Add basement option for larger buildings
    if (floorCount >= 3) {
      floors.unshift('Basement');
    }

    return floors;
  }

  /**
   * Get nearest available floor
   * @private
   */
  getNearestFloor(targetLevel, availableFloors) {
    const levelOrder = ['Basement', 'Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
    const targetIndex = levelOrder.indexOf(targetLevel);

    if (targetIndex === -1) return 'Ground';

    // Find closest available floor
    let closestFloor = 'Ground';
    let minDistance = Infinity;

    availableFloors.forEach(floor => {
      const floorIndex = levelOrder.indexOf(floor);
      const distance = Math.abs(floorIndex - targetIndex);
      if (distance < minDistance) {
        minDistance = distance;
        closestFloor = floor;
      }
    });

    return closestFloor;
  }

  /**
   * Apply building type specific adjustments
   * @private
   */
  applyBuildingTypeAdjustments(level, space, category, subType, availableFloors) {
    const spaceName = (space.label || space.name || '').toLowerCase();

    // Healthcare: Keep most patient-facing spaces on ground
    if (category === 'healthcare') {
      if (spaceName.includes('patient') || spaceName.includes('consultation') ||
          spaceName.includes('treatment') || spaceName.includes('waiting')) {
        return 'Ground';
      }
    }

    // Residential: Bedrooms on upper floors
    if (category === 'residential') {
      if (spaceName.includes('bedroom') && availableFloors.includes('First')) {
        return 'First';
      }
      if (spaceName.includes('living') || spaceName.includes('kitchen')) {
        return 'Ground';
      }
    }

    // Commercial/Office: Reception ground, offices upper
    if (category === 'commercial') {
      if (spaceName.includes('reception') || spaceName.includes('lobby')) {
        return 'Ground';
      }
      if (spaceName.includes('office') && availableFloors.length > 1) {
        return availableFloors[Math.min(1, availableFloors.length - 1)];
      }
    }

    // Education: Keep classrooms accessible
    if (category === 'education') {
      if (spaceName.includes('classroom')) {
        return availableFloors.includes('Ground') ? 'Ground' : 'First';
      }
    }

    return level;
  }

  /**
   * Balance floor distribution if needed
   * @private
   */
  balanceFloorsIfNeeded(spaces, availableFloors, floorCount) {
    if (floorCount <= 1) return spaces;

    // Count spaces per floor
    const floorCounts = {};
    availableFloors.forEach(floor => floorCounts[floor] = 0);

    spaces.forEach(space => {
      if (space.level && floorCounts[space.level] !== undefined) {
        floorCounts[space.level]++;
      }
    });

    // Check if ground floor is overloaded (>70% of spaces)
    const totalSpaces = spaces.length;
    const groundCount = floorCounts['Ground'] || 0;
    const groundPercentage = groundCount / totalSpaces;

    if (groundPercentage > 0.7 && availableFloors.length > 1) {
      // Redistribute some flexible spaces to upper floors
      const flexibleSpaces = spaces.filter(s =>
        s.level === 'Ground' &&
        s.levelConfidence < 0.85 && // Not high priority for ground floor
        !s.label?.toLowerCase().includes('reception') &&
        !s.label?.toLowerCase().includes('entrance') &&
        !s.label?.toLowerCase().includes('lobby')
      );

      // Move some to First floor
      const toMove = Math.min(flexibleSpaces.length, Math.floor(groundCount * 0.2));
      for (let i = 0; i < toMove; i++) {
        if (flexibleSpaces[i]) {
          flexibleSpaces[i].level = 'First';
          flexibleSpaces[i].levelReason += ' (Redistributed for balance)';
        }
      }
    }

    return spaces;
  }

  /**
   * Get level assignment explanation
   * @param {string} spaceType - Space type/name
   * @returns {Object} Explanation
   */
  getLevelExplanation(spaceType) {
    const spaceName = spaceType.toLowerCase();
    let rule = this.levelRules[spaceName];

    if (!rule) {
      // Try partial match
      for (const [key, value] of Object.entries(this.levelRules)) {
        if (spaceName.includes(key)) {
          rule = value;
          break;
        }
      }
    }

    if (!rule) rule = this.levelRules.default;

    return {
      preferredLevel: rule.preferredLevel,
      reason: rule.reason,
      fallback: rule.fallback || null
    };
  }

  /**
   * Validate level assignments
   * @param {Array} spaces - Program spaces with levels
   * @returns {Object} Validation result
   */
  validateLevelAssignments(spaces) {
    const warnings = [];
    const errors = [];

    // Check if critical ground floor spaces are present
    const groundSpaces = spaces.filter(s => s.level === 'Ground');
    const hasReception = groundSpaces.some(s =>
      s.label?.toLowerCase().includes('reception') ||
      s.label?.toLowerCase().includes('entrance')
    );

    if (groundSpaces.length > 0 && !hasReception) {
      warnings.push('No reception or entrance area detected on ground floor');
    }

    // Check for isolated floors
    const floorCounts = {};
    spaces.forEach(space => {
      floorCounts[space.level] = (floorCounts[space.level] || 0) + 1;
    });

    Object.entries(floorCounts).forEach(([floor, count]) => {
      if (count === 1 && floor !== 'Basement') {
        warnings.push(`Only one space assigned to ${floor} floor - consider redistribution`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      floorDistribution: floorCounts
    };
  }
}

export default new IntelligentLevelAssignment();
