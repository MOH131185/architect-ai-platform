import locationAwareDNAModifier from './src/services/locationAwareDNAModifier.js';

console.log('Testing LocationAwareDNAModifier...');

const emptyDNA = {};
const locationData = {
    climate: { type: 'temperate' }
};

try {
    const result = locationAwareDNAModifier.applyClimateAdaptations(emptyDNA, locationData.climate);
    console.log('✅ applyClimateAdaptations handled empty DNA without crash');
    console.log('Result:', JSON.stringify(result, null, 2));
} catch (error) {
    console.error('❌ applyClimateAdaptations crashed:', error);
}
