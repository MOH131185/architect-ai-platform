// src/data/globalArchitecturalDatabase.js

export const globalArchitecturalDatabase = {
  // Regional hierarchy: Continent -> Country -> Region/State -> City/Area
  regions: {
    'EUROPE': {
      'United Kingdom': {
        patterns: {
          'postcode_prefixes': {
            'DN': { // Doncaster/Scunthorpe
              name: 'South Yorkshire/North Lincolnshire',
              styles: {
                historical: ['Victorian Industrial', 'Georgian Market Town', 'Railway Era Architecture'],
                contemporary: ['Post-Industrial Regeneration', 'Modern Suburban'],
                vernacular: ['Yorkshire Stone Cottages', 'Red Brick Terraces']
              },
              materials: ['Red brick', 'Yorkshire sandstone', 'Welsh slate', 'Cast iron details'],
              characteristics: ['Pitched roofs 35-45°', 'Chimney stacks', 'Bay windows', 'Back-to-back housing']
            },
            'YO': { // York
              name: 'North Yorkshire',
              styles: {
                historical: ['Medieval Timber Frame', 'Georgian Townhouse', 'Victorian Gothic Revival'],
                contemporary: ['Conservation Area Modern', 'Sustainable Rural'],
                vernacular: ['York Stone Buildings', 'Pantile Roofs']
              },
              materials: ['Limestone', 'Timber frame', 'Pantiles', 'Lead roofing'],
              characteristics: ['Narrow medieval streets adaptation', 'Conservation requirements']
            },
            'SW': { // South West London
              name: 'South West London',
              styles: {
                historical: ['Victorian Villa', 'Edwardian Mansion', 'Arts and Crafts'],
                contemporary: ['Glass Box Extension', 'Basement Conversion Modern'],
                vernacular: ['London Stock Brick', 'Stucco Fronted Terrace']
              },
              materials: ['London stock brick', 'Stucco', 'Slate', 'Sash windows'],
              characteristics: ['Front gardens', 'Rear extensions', 'Loft conversions']
            }
            // Add all UK postcode areas...
          }
        }
      },
      'Germany': {
        patterns: {
          'cities': {
            'Berlin': {
              styles: {
                historical: ['Prussian Classicism', 'Bauhaus', 'DDR Plattenbau'],
                contemporary: ['Berlin Modern', 'Eco-Minimalist', 'Industrial Conversion'],
                vernacular: ['Altbau', 'Hinterhof']
              },
              materials: ['Rendered masonry', 'Exposed concrete', 'Steel and glass'],
              characteristics: ['Courtyard buildings', 'High ceilings', 'District heating']
            },
            'Munich': {
              styles: {
                historical: ['Bavarian Baroque', 'Alpine Traditional', 'Art Nouveau'],
                contemporary: ['Alpine Modern', 'Passive House Standard'],
                vernacular: ['Painted facades', 'Wooden balconies']
              },
              materials: ['Rendered walls', 'Timber', 'Clay roof tiles'],
              characteristics: ['Steep roofs for snow', 'Decorative facades', 'Beer garden integration']
            }
          }
        }
      },
      'France': {
        patterns: {
          'regions': {
            'Île-de-France': {
              styles: {
                historical: ['Haussmann', 'Art Nouveau', 'Art Deco'],
                contemporary: ['Grand Paris Modern', 'Eco-Quartier'],
                vernacular: ['Maison de Maître', 'Pavillon']
              },
              materials: ['Pierre de taille', 'Zinc roofing', 'Wrought iron'],
              characteristics: ['Uniform street heights', 'Mansard roofs', 'French balconies']
            }
          }
        }
      }
    },
    'NORTH_AMERICA': {
      'United States': {
        patterns: {
          'states': {
            'California': {
              'San Francisco': {
                styles: {
                  historical: ['Victorian', 'Edwardian', 'Mission Revival', 'Art Deco'],
                  contemporary: ['Tech Campus', 'Modern Bay Area', 'Sustainable Urban'],
                  vernacular: ['San Francisco Bay Tradition', 'Painted Ladies']
                },
                materials: ['Redwood', 'Stucco', 'Steel frame seismic', 'Solar panels'],
                characteristics: ['Seismic requirements', 'Bay windows', 'Steep lots adaptation', 'Fog-resistant materials']
              },
              'Los Angeles': {
                styles: {
                  historical: ['Spanish Colonial Revival', 'Mid-Century Modern', 'Googie'],
                  contemporary: ['LA Modern', 'Indoor-Outdoor Living', 'Minimalist Box'],
                  vernacular: ['Dingbat Apartments', 'Stucco Box']
                },
                materials: ['Stucco', 'Glass walls', 'Concrete', 'Steel'],
                characteristics: ['Pool integration', 'Canyon sites', 'Privacy walls', 'Drought-resistant landscaping']
              }
            },
            'New York': {
              'New York City': {
                styles: {
                  historical: ['Brownstone', 'Art Deco Skyscraper', 'Cast Iron Architecture'],
                  contemporary: ['Glass Tower', 'Industrial Conversion', 'Micro-Housing'],
                  vernacular: ['Walk-up Tenement', 'Row House']
                },
                materials: ['Brick', 'Limestone', 'Glass curtain wall', 'Steel frame'],
                characteristics: ['Vertical living', 'Air rights', 'Mixed-use podiums', 'Setback requirements']
              }
            }
          }
        }
      },
      'Canada': {
        patterns: {
          'provinces': {
            'Ontario': {
              'Toronto': {
                styles: {
                  historical: ['Victorian Bay-and-Gable', 'Edwardian', 'Art Moderne'],
                  contemporary: ['Toronto Modern', 'Condo Tower', 'Laneway House'],
                  vernacular: ['Brick Semi-Detached', 'Toronto Special']
                },
                materials: ['Red brick', 'Concrete', 'Glass', 'Steel'],
                characteristics: ['Winter insulation', 'Snow load roofs', 'Underground parking']
              }
            }
          }
        }
      }
    },
    'ASIA': {
      'Japan': {
        patterns: {
          'prefectures': {
            'Tokyo': {
              styles: {
                historical: ['Machiya', 'Sukiya-zukuri', 'Western Eclectic'],
                contemporary: ['Metabolism', 'Minimalist Concrete', 'Micro-Architecture'],
                vernacular: ['Wooden Townhouse', 'Danchi']
              },
              materials: ['Wood', 'Concrete', 'Steel', 'Ceramic tiles'],
              characteristics: ['Earthquake resistance', 'Compact design', 'Natural light wells', 'Tatami proportions']
            }
          }
        }
      },
      'China': {
        patterns: {
          'cities': {
            'Beijing': {
              styles: {
                historical: ['Siheyuan', 'Imperial Architecture', 'Soviet Influenced'],
                contemporary: ['Contemporary Chinese', 'Eco-City Design', 'Neo-Traditional'],
                vernacular: ['Hutong', 'Danwei Housing']
              },
              materials: ['Grey brick', 'Concrete', 'Glass', 'Traditional tiles'],
              characteristics: ['Courtyard planning', 'North-south orientation', 'Feng shui principles']
            }
          }
        }
      }
    }
  },

  // Climate-based architectural adaptations
  climateAdaptations: {
    'Tropical': {
      features: ['Deep overhangs', 'Cross ventilation', 'Raised floors', 'Light colors'],
      materials: ['Bamboo', 'Timber', 'Corrugated metal', 'Concrete blocks']
    },
    'Desert': {
      features: ['Thermal mass', 'Small windows', 'Courtyards', 'Wind towers'],
      materials: ['Adobe', 'Rammed earth', 'Stone', 'Mud brick']
    },
    'Mediterranean': {
      features: ['Thick walls', 'Shutters', 'Terraces', 'Pergolas'],
      materials: ['Stone', 'Stucco', 'Terracotta', 'Timber']
    },
    'Continental': {
      features: ['Insulation', 'Double glazing', 'Steep roofs', 'Basements'],
      materials: ['Brick', 'Timber', 'Concrete', 'Composite panels']
    },
    'Maritime': {
      features: ['Weather-resistant cladding', 'Storm shutters', 'Elevated foundations'],
      materials: ['Cedar shingle', 'Fiber cement', 'Treated timber', 'Metal roofing']
    }
  },

  // Building regulations by region
  regulations: {
    'EU': {
      energyStandard: 'Nearly Zero Energy Building (NZEB)',
      accessibilityStandard: 'EN 17210',
      fireStandard: 'Eurocode'
    },
    'USA': {
      energyStandard: 'ASHRAE 90.1',
      accessibilityStandard: 'ADA',
      fireStandard: 'NFPA'
    },
    'UK': {
      energyStandard: 'Part L Building Regulations',
      accessibilityStandard: 'Part M',
      fireStandard: 'Approved Document B'
    }
  }
};

// Helper functions to query the database
export const architecturalStyleService = {
  getStylesByLocation(country, region, city, postcode) {
    // Implementation to traverse the hierarchy and return relevant styles
    let styles = {};

    // Start with continent level
    const continent = this.detectContinent(country);
    const continentData = globalArchitecturalDatabase.regions[continent];

    if (continentData && continentData[country]) {
      const countryData = continentData[country];

      // Check different pattern types
      if (countryData.patterns.postcode_prefixes && postcode) {
        const prefix = postcode.substring(0, 2).toUpperCase();
        if (countryData.patterns.postcode_prefixes[prefix]) {
          return countryData.patterns.postcode_prefixes[prefix];
        }
      }

      if (countryData.patterns.cities && city) {
        if (countryData.patterns.cities[city]) {
          return countryData.patterns.cities[city];
        }
      }

      if (countryData.patterns.states && region) {
        const stateData = countryData.patterns.states[region];
        if (stateData && stateData[city]) {
          return stateData[city];
        }
      }
    }

    // Return default for the country
    return this.getDefaultStylesForCountry(country);
  },

  getDefaultStylesForCountry(country) {
    // A simple fallback for any country not explicitly detailed
    return {
      name: `Default for ${country}`,
      styles: {
        historical: ['Local Historical Revival'],
        contemporary: ['Modern Contemporary', 'Sustainable Design'],
        vernacular: ['Regional Vernacular']
      },
      materials: ['Locally Sourced Brick', 'Timber', 'Glass'],
      characteristics: ['Standard construction practices', 'Energy efficiency considerations']
    };
  },

  detectContinent(country) {
    const continentMap = {
      'United Kingdom': 'EUROPE',
      'Germany': 'EUROPE',
      'France': 'EUROPE',
      'United States': 'NORTH_AMERICA',
      'Canada': 'NORTH_AMERICA',
      'Japan': 'ASIA',
      'China': 'ASIA',
      // Add more countries...
    };
    return continentMap[country] || 'GLOBAL';
  },

  getClimateAdaptations(climateType) {
    return globalArchitecturalDatabase.climateAdaptations[climateType] ||
           globalArchitecturalDatabase.climateAdaptations['Continental'];
  },

  getRegulations(country) {
    if (country === 'United Kingdom') return globalArchitecturalDatabase.regulations['UK'];
    if (country === 'United States') return globalArchitecturalDatabase.regulations['USA'];
    if (['Germany', 'France', 'Italy', 'Spain'].includes(country)) {
      return globalArchitecturalDatabase.regulations['EU'];
    }
    return null;
  }
};
