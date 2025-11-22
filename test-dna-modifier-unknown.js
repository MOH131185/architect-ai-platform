import locationAwareDNAModifier from './src/services/locationAwareDNAModifier.js';

console.log('Testing LocationAwareDNAModifier with unknown climate...');

const emptyDNA = {};
const locationData = {
    climate: { type: 'unknown_climate_type' }
};

try {
    const result = locationAwareDNAModifier.applyClimateAdaptations(emptyDNA, locationData.climate);
    console.log('✅ applyClimateAdaptations handled unknown climate without crash');
    console.log('Consistency Rules:', JSON.stringify(result.consistencyRules, null, 2));
} catch (error) {
    console.error('❌ applyClimateAdaptations crashed:', error);
}
