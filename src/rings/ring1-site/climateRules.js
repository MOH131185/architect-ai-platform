const CLIMATE_RULE_MAP = {
  'Temperate Oceanic': [
    { rule: 'overhang', value: '0.8m - 1.2m on south façades', reason: 'Summer sun altitude 55°-65°' },
    { rule: 'glazing', value: '55% on south, 35% elsewhere', reason: 'Balance daylight and heat gain' },
    { rule: 'insulation', value: 'U-value ≤ 0.18 W/m²K', reason: 'UK Part L compliance' },
    { rule: 'ventilation', value: 'Cross-ventilation east-west', reason: 'Prevailing westerly winds' }
  ],
  Mediterranean: [
    { rule: 'overhang', value: '1.2m - 1.5m on south façades', reason: 'High summer altitude >70°' },
    { rule: 'thermalMass', value: 'High-mass walls (0.35m+)', reason: 'Even out day/night swings' },
    { rule: 'shading', value: 'Fixed louvers on west façades', reason: 'Low evening sun' }
  ],
  'Hot Desert': [
    { rule: 'glazing', value: '<30% overall', reason: 'Minimise heat gain' },
    { rule: 'roof', value: 'High albedo (SRI > 78)', reason: 'Reduce solar absorption' },
    { rule: 'courtyard', value: 'Add shaded courtyard', reason: 'Passive cooling' }
  ],
  'Subarctic': [
    { rule: 'glazing', value: 'Maximise south glazing, minimise north', reason: 'Capture winter sun' },
    { rule: 'airtightness', value: 'n50 ≤ 1.0 ACH', reason: 'Reduce heat loss' },
    { rule: 'thermalMass', value: 'Moderate mass with insulation exterior', reason: 'Maintain comfort' }
  ]
};

const DEFAULT_RULES = CLIMATE_RULE_MAP['Temperate Oceanic'];

export function getClimateDesignRules(climateType = 'Temperate Oceanic', context = {}) {
  const baseRules = CLIMATE_RULE_MAP[climateType] || DEFAULT_RULES;
  const solar = context.solar;
  const boundary = context.boundaryContext;

  const solarNote = solar
    ? [
        {
          rule: 'solarOrientation',
          value: `Orient primary glazing toward ${Math.round(
            solar.optimalOrientation ?? 180
          )}°`,
          reason: 'Align with optimal solar gain'
        }
      ]
    : [];

  const siteNote =
    boundary && boundary.orientationDeg !== undefined
      ? [
          {
            rule: 'siteOrientation',
            value: `Align footprint long axis to ${Math.round(boundary.orientationDeg)}°`,
            reason: 'Maximise useable depth within boundary'
          }
        ]
      : [];

  return [...baseRules, ...solarNote, ...siteNote];
}

