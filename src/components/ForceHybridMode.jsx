/**
 * Force Enable Hybrid A1 Mode
/**
 * Force Enable Hybrid A1 Mode
 * 
 * Add this component to your App.js to force-enable Hybrid A1 Mode
 * and clear any cached feature flags.
 */

import { useEffect } from 'react';
import { setFeatureFlag, isFeatureEnabled, FEATURE_FLAGS } from '../config/featureFlags.js';
import logger from '../utils/logger.js';


export default function ForceHybridMode() {
    useEffect(() => {
        logger.info('🔧 ForceHybridMode component mounted');

        // Clear old cached flags
        sessionStorage.removeItem('featureFlags');
        logger.info('🗑️ Cleared sessionStorage feature flags');

        // Directly modify the FEATURE_FLAGS object
        FEATURE_FLAGS.hybridA1Mode = true;
        logger.success(' Set FEATURE_FLAGS.hybridA1Mode = true');

        // Also use setFeatureFlag to persist
        setFeatureFlag('hybridA1Mode', true);
        logger.success(' Called setFeatureFlag(hybridA1Mode, true)');

        // Verify multiple ways
        const isEnabled = isFeatureEnabled('hybridA1Mode');
        const directValue = FEATURE_FLAGS.hybridA1Mode;

        logger.info('🎯 Hybrid A1 Mode verification:');
        logger.info('   isFeatureEnabled:', isEnabled);
        logger.info('   FEATURE_FLAGS.hybridA1Mode:', directValue);
        logger.info('   sessionStorage:', sessionStorage.getItem('featureFlags'));

        if (!isEnabled || !directValue) {
            logger.error('❌ CRITICAL: Failed to enable Hybrid A1 Mode!');
            logger.error('   This will result in single-view generation instead of multi-panel A1 sheet');
        } else {
            logger.success(' SUCCESS: Hybrid A1 Mode is ENABLED');
            logger.info('   Next generation will use panel-based workflow');
        }
    }, []);

    return null; // This component doesn't render anything
}
