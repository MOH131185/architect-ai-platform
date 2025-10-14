/**
 * Comprehensive UK Architecture Database
 * Regional styles, materials, climate data, and building regulations
 */

export const ukArchitectureDatabase = {
  regions: {
    // ENGLAND
    "London": {
      country: "England",
      region: "Greater London",
      climate: {
        type: "Temperate maritime",
        avgTempSummer: 20,
        avgTempWinter: 5,
        rainfall: 600, // mm/year
        sunHours: 1500, // hours/year
        prevailingWind: "Southwest",
        humidity: "Moderate to High"
      },
      architecturalStyles: {
        traditional: [
          {
            name: "Georgian",
            period: "1714-1830",
            characteristics: [
              "Symmetrical facades",
              "Sash windows",
              "Red or yellow brick",
              "Classical proportions",
              "White painted window frames",
              "Panelled front doors"
            ],
            commonMaterials: ["London stock brick", "Portland stone", "Slate roofing", "Timber sash windows"],
            examples: ["Terraced houses in Bloomsbury", "Kensington townhouses"]
          },
          {
            name: "Victorian",
            period: "1837-1901",
            characteristics: [
              "Bay windows",
              "Decorative brickwork",
              "Terracotta tiles",
              "Ornate gables",
              "Stained glass",
              "High ceilings"
            ],
            commonMaterials: ["Red brick", "Yellow brick", "Terracotta", "Slate", "Cast iron"],
            examples: ["Terraced houses in Islington", "Mansion blocks in South Kensington"]
          },
          {
            name: "Edwardian",
            period: "1901-1918",
            characteristics: [
              "Red brick with white render details",
              "Larger gardens",
              "Wide hallways",
              "Simpler ornamentation than Victorian",
              "Mock-Tudor features"
            ],
            commonMaterials: ["Red brick", "Render", "Timber", "Tiled roofing"],
            examples: ["Semi-detached houses in Ealing", "Garden suburbs in Hampstead"]
          }
        ],
        contemporary: [
          {
            name: "Modern London",
            period: "2000-Present",
            characteristics: [
              "Glass facades",
              "Steel and concrete structure",
              "Sustainable design",
              "High-density housing",
              "Mixed-use developments",
              "Green roofs and walls"
            ],
            commonMaterials: ["Glass", "Steel", "Concrete", "Timber cladding", "Zinc"],
            examples: ["Shard", "One Blackfriars", "Kings Cross development"]
          }
        ]
      },
      commonMaterials: {
        walls: ["London stock brick (yellow)", "Red brick", "Portland stone", "Glass", "Concrete"],
        roofing: ["Slate", "Clay tiles", "Zinc", "Green roofs", "Flat roofing membrane"],
        windows: ["Timber sash", "uPVC", "Aluminum", "Steel-framed"],
        structure: ["Load-bearing brick", "Steel frame", "Concrete frame", "Timber frame"]
      },
      buildingRegulations: {
        maxHeight: "Varies by conservation area and location",
        setbacks: "Typically 1-3m from boundary",
        parkingRequirements: "Varies - often minimal due to public transport",
        energyStandards: "Part L - U-values: walls 0.18, roof 0.15, windows 1.4 W/m²K",
        fireRegulations: "Strict post-Grenfell - non-combustible cladding for buildings >18m"
      },
      sunPath: {
        summer: "Southeast sunrise (04:43), Southwest sunset (21:21), max altitude 62°",
        winter: "Southeast sunrise (08:06), Southwest sunset (15:53), max altitude 15°",
        optimalOrientation: "South-facing for maximum solar gain"
      },
      sustainabilityConsiderations: [
        "Air quality concerns - ventilation systems required",
        "Heat island effect - green roofs recommended",
        "Flood risk zones - SUDS required",
        "Heritage constraints in conservation areas"
      ]
    },

    "Manchester": {
      country: "England",
      region: "North West England",
      climate: {
        type: "Temperate maritime - wetter than average",
        avgTempSummer: 18,
        avgTempWinter: 4,
        rainfall: 900, // mm/year
        sunHours: 1350, // hours/year
        prevailingWind: "Southwest",
        humidity: "High"
      },
      architecturalStyles: {
        traditional: [
          {
            name: "Industrial Georgian",
            period: "1780-1840",
            characteristics: [
              "Red brick warehouses",
              "Cast iron columns",
              "Large industrial windows",
              "Canal-side development"
            ],
            commonMaterials: ["Red brick", "Cast iron", "Yorkshire stone"],
            examples: ["Castlefield warehouses", "Ancoats mills"]
          },
          {
            name: "Victorian Industrial",
            period: "1840-1900",
            characteristics: [
              "Red brick with terracotta details",
              "Gothic Revival elements",
              "Large factory buildings",
              "Worker housing terraces"
            ],
            commonMaterials: ["Red brick", "Terracotta", "Slate", "Cast iron"],
            examples: ["Northern Quarter buildings", "Salford mills"]
          }
        ],
        contemporary: [
          {
            name: "Modern Manchester",
            period: "1990-Present",
            characteristics: [
              "Post-industrial regeneration",
              "Glass and steel high-rises",
              "Warehouse conversions",
              "Sustainable new-builds"
            ],
            commonMaterials: ["Glass", "Steel", "Brick", "Exposed concrete"],
            examples: ["Beetham Tower", "Spinningfields", "NOMA"]
          }
        ]
      },
      commonMaterials: {
        walls: ["Red brick", "Blue engineering brick", "Glass", "Concrete", "Terracotta"],
        roofing: ["Slate", "Clay tiles", "Standing seam metal", "Green roofs"],
        windows: ["Timber sash", "Steel-framed", "Aluminum", "uPVC"],
        structure: ["Load-bearing brick", "Cast iron", "Steel frame", "Concrete"]
      },
      buildingRegulations: {
        maxHeight: "Varies - high-rise permitted in city center",
        setbacks: "Varies by zone",
        parkingRequirements: "Reduced in city center zones",
        energyStandards: "Part L compliance + Manchester Climate Change Framework",
        fireRegulations: "Standard UK fire safety requirements"
      },
      sunPath: {
        summer: "Northeast sunrise (04:30), Northwest sunset (21:40), max altitude 59°",
        winter: "Southeast sunrise (08:20), Southwest sunset (15:40), max altitude 12°",
        optimalOrientation: "South-facing preferred, west-facing to avoid prevailing rain"
      },
      sustainabilityConsiderations: [
        "High rainfall - robust drainage essential",
        "Flood risk in some areas - elevated ground floors",
        "Strong winds - secure cladding and roofing",
        "Air quality improving - green infrastructure encouraged"
      ]
    },

    "Edinburgh": {
      country: "Scotland",
      region: "Lothian",
      climate: {
        type: "Temperate maritime - cooler",
        avgTempSummer: 16,
        avgTempWinter: 3,
        rainfall: 720, // mm/year
        sunHours: 1400, // hours/year
        prevailingWind: "Southwest",
        humidity: "Moderate to High"
      },
      architecturalStyles: {
        traditional: [
          {
            name: "Scottish Georgian",
            period: "1720-1840",
            characteristics: [
              "Sandstone ashlar facades",
              "Symmetrical elevations",
              "Fanlight doors",
              "Railings and basements",
              "New Town planning grid"
            ],
            commonMaterials: ["Blonde sandstone", "Whinstone", "Slate roofing", "Cast iron"],
            examples: ["Charlotte Square", "George Street", "Royal Circus"]
          },
          {
            name: "Scottish Baronial",
            period: "1830-1900",
            characteristics: [
              "Turrets and towers",
              "Corbelled corners",
              "Stepped gables",
              "Small windows",
              "Crow-stepped gables"
            ],
            commonMaterials: ["Red sandstone", "Harl render", "Slate", "Timber"],
            examples: ["Balmoral Hotel", "Edinburgh Castle additions"]
          },
          {
            name: "Victorian Tenement",
            period: "1850-1914",
            characteristics: [
              "Sandstone blocks",
              "Shared stairways (closes)",
              "Bay windows",
              "Ornate stonework",
              "High density urban living"
            ],
            commonMaterials: ["Red or blonde sandstone", "Slate", "Timber sash windows"],
            examples: ["Marchmont", "Bruntsfield", "Newington"]
          }
        ],
        contemporary: [
          {
            name: "Modern Edinburgh",
            period: "2000-Present",
            characteristics: [
              "Contextual design respecting historic setting",
              "Stone with modern materials",
              "Sustainable design",
              "Respectful heights in Old Town"
            ],
            commonMaterials: ["Sandstone", "Glass", "Zinc", "Timber cladding", "Copper"],
            examples: ["Scottish Parliament", "Quartermile", "Ocean Terminal"]
          }
        ]
      },
      commonMaterials: {
        walls: ["Blonde sandstone", "Red sandstone", "Whinstone", "Harl render", "Glass"],
        roofing: ["Slate (grey or blue)", "Lead", "Zinc", "Copper", "Green roofs"],
        windows: ["Timber sash", "Aluminum", "Timber casement"],
        structure: ["Load-bearing stone", "Steel frame", "Timber frame", "Concrete"]
      },
      buildingRegulations: {
        maxHeight: "Strictly controlled in World Heritage Site and conservation areas",
        setbacks: "Must respect historic building line",
        parkingRequirements: "Minimal in city center",
        energyStandards: "Section 6 (Scottish Building Standards) - stricter than England",
        fireRegulations: "Scottish Building Standards - stricter compartmentation"
      },
      sunPath: {
        summer: "Northeast sunrise (04:26), Northwest sunset (22:03), max altitude 58°",
        winter: "Southeast sunrise (08:42), Southwest sunset (15:39), max altitude 11°",
        optimalOrientation: "South-facing essential due to lower sun angle"
      },
      sustainabilityConsiderations: [
        "Cold climate - high insulation standards (U-values stricter than England)",
        "Strong winds - robust construction required",
        "Historic conservation - sympathetic materials essential",
        "Exposed location - weather-resistant detailing"
      ]
    },

    "Cardiff": {
      country: "Wales",
      region: "South Wales",
      climate: {
        type: "Temperate maritime - mild and wet",
        avgTempSummer: 19,
        avgTempWinter: 5,
        rainfall: 1150, // mm/year
        sunHours: 1600, // hours/year
        prevailingWind: "Southwest",
        humidity: "High"
      },
      architecturalStyles: {
        traditional: [
          {
            name: "Welsh Victorian",
            period: "1840-1900",
            characteristics: [
              "Blue pennant stone",
              "Polychromatic brickwork",
              "Slate roofing",
              "Gothic Revival churches",
              "Terraced miners' houses"
            ],
            commonMaterials: ["Blue pennant stone", "Red brick", "Welsh slate", "Timber"],
            examples: ["Cardiff Castle additions", "Victorian arcades", "Pontcanna terraces"]
          },
          {
            name: "Edwardian Civic",
            period: "1900-1920",
            characteristics: [
              "Portland stone public buildings",
              "Baroque detailing",
              "Large public spaces",
              "Red brick housing"
            ],
            commonMaterials: ["Portland stone", "Red brick", "Terracotta", "Slate"],
            examples: ["Civic Centre", "National Museum", "Cathays Park"]
          }
        ],
        contemporary: [
          {
            name: "Modern Cardiff",
            period: "1990-Present",
            characteristics: [
              "Bay regeneration architecture",
              "Steel and glass",
              "Sustainable design",
              "Welsh materials where possible"
            ],
            commonMaterials: ["Glass", "Steel", "Copper", "Welsh slate", "Timber cladding"],
            examples: ["Wales Millennium Centre", "Senedd", "Cardiff Bay development"]
          }
        ]
      },
      commonMaterials: {
        walls: ["Blue pennant stone", "Red brick", "Render", "Glass", "Timber cladding"],
        roofing: ["Welsh slate (blue-grey)", "Clay tiles", "Zinc", "Green roofs"],
        windows: ["Timber sash", "Aluminum", "uPVC"],
        structure: ["Load-bearing stone/brick", "Steel frame", "Timber frame"]
      },
      buildingRegulations: {
        maxHeight: "Varies - taller buildings in bay area",
        setbacks: "Varies by zone",
        parkingRequirements: "Standard UK requirements",
        energyStandards: "Part L (Wales) - similar to England with Welsh variations",
        fireRegulations: "UK fire safety standards"
      },
      sunPath: {
        summer: "Northeast sunrise (04:50), Northwest sunset (21:30), max altitude 60°",
        winter: "Southeast sunrise (08:10), Southwest sunset (16:00), max altitude 13°",
        optimalOrientation: "South-facing for solar gain, shelter from southwest winds"
      },
      sustainabilityConsiderations: [
        "High rainfall - excellent drainage essential",
        "Coastal location - salt-resistant materials",
        "Strong winds - secure fixings required",
        "Welsh language requirements on signage"
      ]
    },

    "Belfast": {
      country: "Northern Ireland",
      region: "Ulster",
      climate: {
        type: "Temperate maritime - cool and wet",
        avgTempSummer: 17,
        avgTempWinter: 4,
        rainfall: 900, // mm/year
        sunHours: 1300, // hours/year
        prevailingWind: "Southwest",
        humidity: "High"
      },
      architecturalStyles: {
        traditional: [
          {
            name: "Victorian Belfast",
            period: "1850-1900",
            characteristics: [
              "Red brick with sandstone dressings",
              "Gothic Revival",
              "Presbyterian simplicity",
              "Linen mill architecture",
              "Shipyard industrial buildings"
            ],
            commonMaterials: ["Red brick", "Scrabo sandstone", "Limestone", "Slate"],
            examples: ["City Hall", "Queens University", "Linen Quarter"]
          },
          {
            name: "Ulster Vernacular",
            period: "1700-1900",
            characteristics: [
              "Whitewashed walls",
              "Thatched or slate roofs",
              "Small windows",
              "Simple rectangular plan"
            ],
            commonMaterials: ["Stone", "Lime render", "Thatch", "Slate", "Timber"],
            examples: ["Rural Ulster farmhouses", "Ulster Folk Museum"]
          }
        ],
        contemporary: [
          {
            name: "Modern Belfast",
            period: "1995-Present",
            characteristics: [
              "Post-conflict regeneration",
              "Waterfront development",
              "Glass and steel",
              "Titanic Quarter regeneration"
            ],
            commonMaterials: ["Glass", "Steel", "Brick", "Aluminum panels"],
            examples: ["Titanic Belfast", "Waterfront Hall", "Victoria Square"]
          }
        ]
      },
      commonMaterials: {
        walls: ["Red brick", "Basalt stone", "Render", "Glass", "Metal cladding"],
        roofing: ["Slate", "Clay tiles", "Standing seam metal", "Flat roofing"],
        windows: ["uPVC (most common)", "Aluminum", "Timber"],
        structure: ["Cavity brick", "Steel frame", "Concrete", "Timber frame"]
      },
      buildingRegulations: {
        maxHeight: "Varies - taller buildings permitted in city center",
        setbacks: "Standard UK requirements",
        parkingRequirements: "Standard UK requirements",
        energyStandards: "Part F (Northern Ireland) - similar to England Part L",
        fireRegulations: "UK fire safety standards with NI variations"
      },
      sunPath: {
        summer: "Northeast sunrise (04:45), Northwest sunset (22:00), max altitude 57°",
        winter: "Southeast sunrise (08:40), Southwest sunset (16:00), max altitude 10°",
        optimalOrientation: "South-facing essential, protection from southwest winds"
      },
      sustainabilityConsiderations: [
        "Cool, wet climate - high insulation critical",
        "Strong winds - robust construction",
        "High energy costs - passive design beneficial",
        "Flood risk in some areas - SUDS required"
      ]
    },

    // Additional regions can be added...
    "Birmingham": {
      country: "England",
      region: "West Midlands",
      climate: {
        type: "Temperate maritime - continental influence",
        avgTempSummer: 19,
        avgTempWinter: 4,
        rainfall: 750,
        sunHours: 1450,
        prevailingWind: "Southwest",
        humidity: "Moderate"
      },
      architecturalStyles: {
        traditional: [
          {
            name: "Victorian Industrial",
            period: "1840-1900",
            characteristics: ["Red brick", "Terracotta ornamentation", "Industrial heritage", "Back-to-back housing"],
            commonMaterials: ["Red brick", "Terracotta", "Blue engineering brick", "Slate"],
            examples: ["Jewellery Quarter", "Bournville", "Digbeth warehouses"]
          }
        ],
        contemporary: [
          {
            name: "Modern Birmingham",
            period: "2000-Present",
            characteristics: ["Urban regeneration", "Bullring redevelopment", "HS2 integration", "Mixed-use towers"],
            commonMaterials: ["Glass", "Aluminum", "Concrete", "Brick"],
            examples: ["Bullring", "Library of Birmingham", "Arena Central"]
          }
        ]
      },
      commonMaterials: {
        walls: ["Red brick", "Engineering brick", "Render", "Glass", "Metal panels"],
        roofing: ["Slate", "Clay tiles", "Single-ply membrane", "Green roofs"],
        windows: ["uPVC", "Aluminum", "Steel-framed"],
        structure: ["Cavity brick", "Steel frame", "Concrete"]
      },
      sunPath: {
        summer: "Northeast sunrise (04:40), Northwest sunset (21:25), max altitude 60°",
        winter: "Southeast sunrise (08:00), Southwest sunset (15:50), max altitude 13°",
        optimalOrientation: "South to southeast for solar gain"
      }
    }
  },

  // National UK building regulations summary
  buildingRegulations: {
    england: {
      energyEfficiency: {
        partL: {
          walls: "U-value ≤ 0.18 W/m²K",
          roof: "U-value ≤ 0.15 W/m²K",
          floor: "U-value ≤ 0.18 W/m²K",
          windows: "U-value ≤ 1.4 W/m²K",
          doors: "U-value ≤ 1.4 W/m²K"
        },
        airTightness: "≤ 8 m³/(h.m²) at 50 Pa (new dwellings)",
        renewables: "10% carbon reduction from renewables (optional)",
        SAP: "Standard Assessment Procedure rating required"
      },
      fire: {
        cladding: "Non-combustible for buildings >18m (post-Grenfell)",
        compartmentation: "30-60 minute fire resistance",
        escapeRoutes: "Protected stairwells, maximum travel distances"
      },
      accessibility: {
        partM: "Level access, wider doorways, accessible WC on entrance level"
      }
    },
    scotland: {
      energyEfficiency: {
        section6: {
          walls: "U-value ≤ 0.17 W/m²K (stricter than England)",
          roof: "U-value ≤ 0.13 W/m²K",
          floor: "U-value ≤ 0.15 W/m²K",
          windows: "U-value ≤ 1.4 W/m²K",
          doors: "U-value ≤ 1.4 W/m²K"
        },
        airTightness: "≤ 7 m³/(h.m²) at 50 Pa (stricter)",
        renewables: "Must demonstrate CO2 reduction"
      }
    },
    wales: {
      energyEfficiency: {
        partL: "Similar to England with Welsh variations",
        futureHomes: "Working toward zero-carbon homes by 2025"
      }
    },
    northernIreland: {
      energyEfficiency: {
        partF: "Similar to England Part L"
      }
    }
  },

  // Common UK sustainable materials
  sustainableMaterials: [
    {
      name: "Cross-Laminated Timber (CLT)",
      benefits: ["Carbon sequestration", "Fast construction", "Lightweight"],
      suppliers: ["Stora Enso (UK)", "Binderholz", "KLH"],
      cost: "£££",
      suitability: ["Multi-storey residential", "Schools", "Offices"]
    },
    {
      name: "Hempcrete",
      benefits: ["Carbon negative", "Breathable", "Good insulation"],
      suppliers: ["Lime Technology", "Hemp-Lime Build"],
      cost: "££",
      suitability: ["Residential", "Retrofits", "Extensions"]
    },
    {
      name: "Recycled Brick",
      benefits: ["Embodied carbon reduction", "Character", "Local sourcing"],
      suppliers: ["Reclaimed Brick Company", "Trojan Reclamation"],
      cost: "££",
      suitability: ["All building types", "Conservation work"]
    },
    {
      name: "Green Roofs",
      benefits: ["Biodiversity", "SUDS", "Insulation", "Urban cooling"],
      suppliers: ["Bauder", "ZinCo", "Alumasc"],
      cost: "£££",
      suitability: ["Flat roofs", "Extensions", "Commercial"]
    }
  ]
};

export default ukArchitectureDatabase;
