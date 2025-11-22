/**
 * Floor Plan Reasoning Service
 *
 * Generates intelligent, context-aware floor plan layouts based on:
 * - Project type (house, office, retail, etc.)
 * - Site constraints (plot shape, orientation, setbacks)
 * - Functional requirements
 * - Best practice design principles
 */

import togetherAIReasoningService from './togetherAIReasoningService.js';
import openaiService from './openaiService.js';
import logger from '../utils/logger.js';


class FloorPlanReasoningService {
  constructor() {
    this.openai = openaiService;
    logger.info('📐 Floor Plan Reasoning Service initialized');
  }

  /**
   * Generate intelligent floor plan layout based on project type and site context
   */
  async generateFloorPlanReasoning(projectContext, siteAnalysis) {
    logger.ai(` Generating floor plan reasoning for ${projectContext.building_program}...`);

    try {
      const reasoningPrompt = this.buildFloorPlanPrompt(projectContext, siteAnalysis);

      const response = await this.openai.chatCompletion([
        {
          role: 'system',
          content: `You are an expert architectural planner specializing in functional, efficient floor plan design.

Generate intelligent floor plan layouts that:
- Match the building program (house, office, retail, etc.)
- Respect site constraints (plot shape, setbacks, orientation)
- Follow best practice design principles
- Optimize circulation, natural light, and space usage
- Consider functional relationships between spaces

Always return valid JSON only.`
        },
        {
          role: 'user',
          content: reasoningPrompt
        }
      ], {
        model: 'gpt-4o',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 2000
      });

      const reasoning = JSON.parse(response.choices[0].message.content);

      logger.success(' Floor plan reasoning generated');
      logger.info(`   Layout strategy: ${reasoning.layout_strategy}`);
      logger.info(`   Ground floor rooms: ${reasoning.ground_floor?.rooms?.length || 0}`);
      logger.info(`   Upper floor rooms: ${reasoning.upper_floor?.rooms?.length || 0}`);

      return {
        success: true,
        reasoning: reasoning,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('❌ Floor plan reasoning failed:', error);
      return {
        success: false,
        reasoning: this.getFallbackReasoning(projectContext, siteAnalysis),
        error: error.message
      };
    }
  }

  /**
   * Build comprehensive floor plan reasoning prompt
   */
  buildFloorPlanPrompt(projectContext, siteAnalysis) {
    const {
      building_program,
      floors,
      floor_area,
      location,
      style
    } = projectContext;

    const {
      plotDimensions,
      buildableArea,
      isCornerLot,
      optimalBuildingOrientation,
      constraints
    } = siteAnalysis;

    return `Generate a detailed, intelligent floor plan layout for this project:

PROJECT DETAILS:
- Building Type: ${building_program}
- Total Floors: ${floors}
- Total Floor Area: ${floor_area}m²
- Architectural Style: ${style}
- Location: ${location}

SITE CONTEXT:
- Plot Dimensions: ${plotDimensions.width}m × ${plotDimensions.depth}m
- Buildable Area: ${buildableArea.width}m × ${buildableArea.depth}m (${buildableArea.area}m²)
- Is Corner Lot: ${isCornerLot ? 'Yes - dual frontage' : 'No - single frontage'}
- Primary Frontage: ${optimalBuildingOrientation.primaryFrontage}
- Main Entrance: ${optimalBuildingOrientation.mainEntrance}
- Front Setback: ${constraints.frontSetback}m
- Side Setbacks: ${constraints.sideSetbacks}m each side

FLOOR PLAN REQUIREMENTS BY BUILDING TYPE:

${this.getTypeSpecificRequirements(building_program, floors, floor_area)}

RETURN JSON FORMAT:
{
  "layout_strategy": "Brief description of overall layout approach",

  "building_footprint": {
    "length": number (meters, fitting within buildable area),
    "width": number (meters, fitting within buildable area),
    "shape": "rectangular/L-shaped/etc",
    "orientation": "how building is oriented on site"
  },

  "ground_floor": {
    "purpose": "primary function of ground floor",
    "rooms": [
      {
        "name": "room name",
        "area": number (m²),
        "dimensions": "approx length × width",
        "position": "north/south/east/west side",
        "reasoning": "why this room is positioned here"
      }
    ],
    "circulation": "how movement flows through ground floor",
    "access_points": ["main entrance", "rear access", etc.]
  },

  ${floors > 1 ? `"upper_floor": {
    "purpose": "primary function of upper floor(s)",
    "rooms": [
      {
        "name": "room name",
        "area": number (m²),
        "dimensions": "approx length × width",
        "position": "north/south/east/west side",
        "reasoning": "why this room is positioned here"
      }
    ],
    "circulation": "staircase location and hallway layout",
    "vertical_alignment": "what is directly above ground floor"
  },` : ''}

  "design_principles": [
    "key principle 1",
    "key principle 2",
    "key principle 3"
  ],

  "natural_light_strategy": "how natural light is maximized",
  "privacy_strategy": "how privacy is maintained",
  "circulation_efficiency": "percentage of floor area for circulation (10-15% is good)"
}

CRITICAL REQUIREMENTS:
1. ALL room areas must add up to approximately ${floor_area}m² total
2. Building footprint must FIT within buildable area ${buildableArea.width}m × ${buildableArea.depth}m
3. Room placement must be LOGICAL for ${building_program} function
4. Consider natural light, privacy, and circulation
5. For ${floors}-story building, distribute functions appropriately across floors

ENTRY CONSISTENCY RULES (MANDATORY):
- The MAIN ENTRANCE must be located on the GROUND FLOOR and connect to the PRIMARY STREET FRONTAGE indicated above ("Primary Frontage: ${optimalBuildingOrientation.primaryFrontage}").
- The UPPER FLOOR(S) must NOT include a main entrance from the outside. If there is any external access on upper floors (e.g., terrace/balcony), label it clearly as "terrace access" or "balcony access" — NEVER "main entrance".
- Ensure the ground floor rooms include a clearly labeled entry space (e.g., "Entry", "Foyer", or "Entrance Hall") located at the street-facing side consistent with the site orientation.
- Ensure access_points on the ground floor explicitly include "main entrance"; access_points on upper floors must NOT include "main entrance".`;
  }

  /**
   * Get type-specific floor plan requirements
   */
  getTypeSpecificRequirements(buildingType, floors, floorArea) {
    const perFloorArea = floorArea / floors;

    switch (buildingType.toLowerCase()) {
      case 'house':
      case 'residential':
      case 'dwelling':
        return `RESIDENTIAL HOUSE REQUIREMENTS:
- Ground Floor: Living areas (living room, dining, kitchen), WC, possibly 1 bedroom, garage/carport
- Upper Floor${floors > 1 ? ': Bedrooms (master + additional), bathrooms, possibly study' : ' (if single story): All bedrooms'}
- Master bedroom should have ensuite and possibly walk-in robe
- Living areas should connect to outdoor (garden/patio)
- Kitchen should be central or connect to dining
- Minimize corridor space (max 15% of floor area)
- Provide storage/laundry
- Entry should have separation from living areas
- Per floor area: ~${perFloorArea}m² per floor`;

      case 'office':
      case 'commercial office':
        return `OFFICE BUILDING REQUIREMENTS:
- Ground Floor: Reception, open workspace, meeting rooms, amenities (kitchen, WC)
- Upper Floor${floors > 1 ? ': Additional workspace, private offices, meeting rooms, WC' : ''}
- Reception should be immediately visible from entrance
- Open plan workspace (60-70% of area)
- Meeting rooms (15-20% of area)
- Support spaces (10-15%): kitchen, storage, WC
- Maximize natural light to workspaces
- Efficient circulation (corridor max 10% of area)
- Per floor area: ~${perFloorArea}m² per floor`;

      case 'retail':
      case 'shop':
        return `RETAIL BUILDING REQUIREMENTS:
- Ground Floor: Shop floor/display area (70%), checkout, back of house (storage, staff), WC
- Upper Floor${floors > 1 ? ': Additional storage, office, staff room' : ' (if applicable)'}
- Storefront should maximize street visibility
- Display area should be open and inviting
- Back of house (storage, staff areas) should be separate but accessible
- Checkout near entrance for security
- Customer WC accessible but discrete
- Loading/delivery access at rear if possible
- Per floor area: ~${perFloorArea}m² per floor`;

      case 'cafe':
      case 'restaurant':
        return `CAFE/RESTAURANT REQUIREMENTS:
- Ground Floor: Seating area (60%), kitchen/prep (25%), counter/service, WC (staff + customer)
- Upper Floor${floors > 1 ? ': Additional seating or function space' : ''}
- Seating should maximize street frontage (outdoor if possible)
- Kitchen must comply with health codes, separate from customer area
- Counter/service area central and visible
- Staff and customer WC separate
- Storage for supplies
- Per floor area: ~${perFloorArea}m² per floor`;

      default:
        return `GENERAL BUILDING REQUIREMENTS:
- Distribute functions logically across ${floors} floor(s)
- Ground floor: Public/primary functions
- Upper floor${floors > 1 ? 's' : ''}: Secondary/private functions
- Provide appropriate circulation, WC facilities
- Total area: ${floorArea}m² (${perFloorArea}m² per floor)`;
    }
  }

  /**
   * Fallback floor plan reasoning when generation fails
   */
  getFallbackReasoning(projectContext, siteAnalysis) {
    const isHouse = projectContext.building_program?.toLowerCase().includes('house') ||
                    projectContext.building_program?.toLowerCase().includes('residential');

    if (isHouse) {
      return this.getFallbackHouseLayout(projectContext, siteAnalysis);
    } else {
      return this.getFallbackGeneralLayout(projectContext, siteAnalysis);
    }
  }

  /**
   * Fallback house layout
   */
  getFallbackHouseLayout(projectContext, siteAnalysis) {
    const floors = projectContext.floors || 2;
    const floorArea = projectContext.floor_area || 200;
    const perFloorArea = floorArea / floors;

    return {
      layout_strategy: "Traditional residential layout with living areas on ground floor and bedrooms on upper floor",

      building_footprint: {
        length: Math.min(siteAnalysis.buildableArea.width, 12),
        width: Math.min(siteAnalysis.buildableArea.depth * 0.5, 10),
        shape: "rectangular",
        orientation: "Long axis along plot depth"
      },

      ground_floor: {
        purpose: "Living and entertainment spaces",
        rooms: [
          { name: "Living Room", area: perFloorArea * 0.3, dimensions: "5m × 4m", position: "north", reasoning: "North for natural light" },
          { name: "Dining Area", area: perFloorArea * 0.15, dimensions: "3.5m × 3m", position: "central", reasoning: "Connect kitchen and living" },
          { name: "Kitchen", area: perFloorArea * 0.15, dimensions: "3m × 3.5m", position: "east", reasoning: "Morning light for kitchen" },
          { name: "WC", area: perFloorArea * 0.05, dimensions: "1.5m × 2m", position: "near entry", reasoning: "Guest convenience" },
          { name: "Entry", area: perFloorArea * 0.1, dimensions: "2m × 3m", position: "south", reasoning: "Primary frontage entrance" },
          { name: "Garage/Carport", area: perFloorArea * 0.25, dimensions: "3m × 6m", position: "side", reasoning: "Vehicle access" }
        ],
        circulation: "Central hallway connecting all spaces",
        access_points: ["Main entrance (south)", "Rear garden access", "Garage access"]
      },

      upper_floor: floors > 1 ? {
        purpose: "Private sleeping areas",
        rooms: [
          { name: "Master Bedroom", area: perFloorArea * 0.35, dimensions: "4m × 4.5m", position: "north", reasoning: "Best light and views" },
          { name: "Master Ensuite", area: perFloorArea * 0.1, dimensions: "2m × 2.5m", position: "north", reasoning: "Adjacent to master" },
          { name: "Bedroom 2", area: perFloorArea * 0.2, dimensions: "3m × 3.5m", position: "east", reasoning: "Morning light" },
          { name: "Bedroom 3", area: perFloorArea * 0.2, dimensions: "3m × 3.5m", position: "west", reasoning: "Afternoon light" },
          { name: "Main Bathroom", area: perFloorArea * 0.1, dimensions: "2m × 2.5m", position: "central", reasoning: "Shared access" },
          { name: "Hallway", area: perFloorArea * 0.05, dimensions: "1.5m wide", position: "central", reasoning: "Circulation" }
        ],
        circulation: "Central hallway with staircase at one end",
        vertical_alignment: "Staircase above entry area"
      } : null,

      design_principles: [
        "Public spaces (living) on ground floor, private spaces (bedrooms) on upper floor",
        "Maximize natural light - north-facing living areas",
        "Efficient circulation - minimal corridor space",
        "Privacy - bedrooms away from street"
      ],

      natural_light_strategy: "North-facing living areas, large windows on all bedrooms, possible skylights in circulation spaces",
      privacy_strategy: "Bedrooms on upper floor away from street, living areas have garden buffer",
      circulation_efficiency: "12% (within good range of 10-15%)",

      isFallback: true
    };
  }

  /**
   * Fallback general layout
   */
  getFallbackGeneralLayout(projectContext, siteAnalysis) {
    const floors = projectContext.floors || 2;
    const floorArea = projectContext.floor_area || 200;
    const perFloorArea = floorArea / floors;

    return {
      layout_strategy: "Functional layout with public functions on ground floor",

      building_footprint: {
        length: Math.min(siteAnalysis.buildableArea.width, 12),
        width: Math.min(siteAnalysis.buildableArea.depth * 0.5, 10),
        shape: "rectangular",
        orientation: "Maximize street frontage"
      },

      ground_floor: {
        purpose: "Primary functional spaces",
        rooms: [
          { name: "Main Space", area: perFloorArea * 0.6, dimensions: "8m × 6m", position: "front", reasoning: "Primary function" },
          { name: "Support Space", area: perFloorArea * 0.2, dimensions: "4m × 3m", position: "rear", reasoning: "Back of house" },
          { name: "WC", area: perFloorArea * 0.1, dimensions: "2m × 2m", position: "rear", reasoning: "Service area" },
          { name: "Circulation", area: perFloorArea * 0.1, dimensions: "corridor", position: "central", reasoning: "Access" }
        ],
        circulation: "Central corridor or open plan",
        access_points: ["Main entrance", "Service entrance (rear)"]
      },

      design_principles: [
        "Functional efficiency",
        "Clear separation of public and service areas",
        "Good natural light and ventilation"
      ],

      natural_light_strategy: "Windows on all external walls, maximize street frontage glazing",
      privacy_strategy: "Service areas at rear, buffer from street",
      circulation_efficiency: "10%",

      isFallback: true
    };
  }
}

// Export singleton
export default new FloorPlanReasoningService();
