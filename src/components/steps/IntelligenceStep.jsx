/**
 * Intelligence Step - Deepgram-Inspired Design
 * 
 * Step 2: Intelligence report with climate and zoning data
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Sun, MapPin, Building2, ArrowRight, ArrowLeft } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import StatCard from '../ui/StatCard.jsx';
import IconWrapper from '../ui/IconWrapper.jsx';
// Section component available from '../ui/Section.jsx' if needed
import StepContainer from '../layout/StepContainer.jsx';
import { fadeInUp, staggerChildren, cardReveal } from '../../styles/animations.js';

const IntelligenceStep = ({
  locationData,
  onNext,
  onBack,
}) => {
  if (!locationData) return null;
  
  const { climate, zoning, recommendedStyle, sustainabilityScore } = locationData;
  
  return (
    <StepContainer backgroundVariant="default" enableParallax={true} maxWidth="6xl">
      <motion.div
        className="space-y-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
      {/* Header */}
      <motion.div variants={fadeInUp} className="text-center">
        <div className="flex justify-center mb-6">
          <IconWrapper size="xl" variant="gradient" glow>
            <Sun className="w-12 h-12" />
          </IconWrapper>
        </div>
        <h2 className="text-4xl font-bold text-white mb-4 font-heading">
          Intelligence Report
        </h2>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          AI-powered analysis of your site's climate, zoning, and architectural context
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          value={sustainabilityScore || 85}
          label="Sustainability Score"
          suffix="%"
          icon={<Sun className="w-6 h-6" />}
          animate={true}
        />
        <StatCard
          value={climate?.type === 'temperate' ? 4 : 3}
          label="Climate Zones"
          icon={<Sun className="w-6 h-6" />}
          animate={true}
        />
        <StatCard
          value={12}
          label="Design Recommendations"
          icon={<Building2 className="w-6 h-6" />}
          animate={true}
        />
      </div>

      {/* Climate Data */}
      <motion.div variants={cardReveal}>
        <Card variant="glass" padding="lg">
          <div className="flex items-center gap-4 mb-6">
            <IconWrapper size="md" variant="primary">
              <Sun className="w-6 h-6" />
            </IconWrapper>
            <div>
              <h3 className="text-2xl font-bold text-white font-heading">Climate Analysis</h3>
              <p className="text-gray-400">Site-specific environmental data</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-2">Climate Type</p>
              <p className="text-lg text-white font-semibold capitalize">{climate?.type || 'Temperate'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">Recommended Orientation</p>
              <p className="text-lg text-white font-semibold">South-facing</p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Zoning Information */}
      {zoning && (
        <motion.div variants={cardReveal}>
          <Card variant="glass" padding="lg">
            <div className="flex items-center gap-4 mb-6">
              <IconWrapper size="md" variant="primary">
                <Building2 className="w-6 h-6" />
              </IconWrapper>
              <div>
                <h3 className="text-2xl font-bold text-white font-heading">Zoning & Regulations</h3>
                <p className="text-gray-400">Local planning requirements</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-2">Zone Type</p>
                <p className="text-lg text-white font-semibold">{zoning.type || 'Residential'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-2">Max Height</p>
                <p className="text-lg text-white font-semibold">{zoning.maxHeight || '12m'}</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Recommended Style */}
      {recommendedStyle && (
        <motion.div variants={cardReveal}>
          <Card variant="gradient" padding="lg" gradient={true}>
            <div className="flex items-center gap-4 mb-4">
              <IconWrapper size="md" variant="glass">
                <MapPin className="w-6 h-6" />
              </IconWrapper>
              <div>
                <h3 className="text-2xl font-bold text-white font-heading">Recommended Style</h3>
                <p className="text-gray-300">{recommendedStyle}</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Navigation */}
      <motion.div variants={fadeInUp} className="flex justify-between">
        <Button
          variant="ghost"
          size="lg"
          onClick={onBack}
          icon={<ArrowLeft className="w-5 h-5" />}
        >
          Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={onNext}
          icon={<ArrowRight className="w-5 h-5" />}
          iconPosition="right"
        >
          Continue to Portfolio
        </Button>
      </motion.div>
      </motion.div>
    </StepContainer>
  );
};

export default IntelligenceStep;
