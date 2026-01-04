/**
 * Location Step - Deepgram-Inspired Design
 * 
 * Step 1: Site selection with blueprint aesthetic
 */

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation, ArrowRight, Loader2 } from 'lucide-react';
import { SiteBoundaryEditor } from '../site';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Card from '../ui/Card.jsx';
import BlueprintPanel from '../ui/BlueprintPanel.jsx';
import IconWrapper from '../ui/IconWrapper.jsx';
import StepContainer from '../layout/StepContainer.jsx';
import { fadeInUp, staggerChildren } from '../../styles/animations.js';

import LocationAccuracyBadge from '../ui/LocationAccuracyBadge.jsx';

const LocationStep = ({
  address,
  isDetectingLocation,
  locationData,
  sitePolygon,
  locationAccuracy,
  onAddressChange,
  onAnalyzeLocation,
  onDetectUserLocation,
  onBoundaryUpdated,
  onNext,
  error,
}) => {
  const canProceed = locationData && address;

  return (
    <StepContainer backgroundVariant="blueprint" enableParallax={true} maxWidth="6xl">
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
              <MapPin className="w-12 h-12" />
            </IconWrapper>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 font-heading">
            Location Analysis
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Enter your project address for intelligent site analysis and climate data
          </p>
        </motion.div>

        {/* Address Input Card */}
        <motion.div variants={fadeInUp}>
          <Card variant="elevated" padding="lg" className="max-w-3xl mx-auto bg-navy-800 border-navy-700">
            <div className="space-y-6">
              <Input
                label="Project Address"
                type="text"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                placeholder="Enter full address..."
                fullWidth
                icon={<MapPin className="w-5 h-5" />}
                disabled={isDetectingLocation}
                inputClassName="!bg-slate-900 !text-white !border-navy-700"
                style={{ color: '#FFFFFF', backgroundColor: '#0F172A' }}
              />

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  variant="gradient"
                  size="lg"
                  onClick={onAnalyzeLocation}
                  disabled={!address || isDetectingLocation}
                  loading={isDetectingLocation}
                  fullWidth
                  icon={<ArrowRight className="w-5 h-5" />}
                  iconPosition="right"
                >
                  Analyze Location
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={onDetectUserLocation}
                  disabled={isDetectingLocation}
                  icon={<Navigation className="w-5 h-5" />}
                >
                  Use My Location
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Location Accuracy Badge */}
        {locationAccuracy && (
          <motion.div variants={fadeInUp} className="flex justify-center">
            <LocationAccuracyBadge
              accuracy={locationAccuracy.accuracy}
              qualityScore={locationAccuracy.qualityScore}
              address={address}
            />
          </motion.div>
        )}

        {/* Site Boundary Editor */}
        {locationData && (
          <motion.div variants={fadeInUp}>
            <SiteBoundaryEditor
              initialBoundaryPolygon={sitePolygon}
              siteAddress={address}
              onBoundaryChange={onBoundaryUpdated}
              apiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
              center={locationData.coordinates}
            />
          </motion.div>
        )}

        {/* Navigation */}
        {canProceed && (
          <motion.div variants={fadeInUp} className="flex justify-end">
            <Button
              variant="primary"
              size="lg"
              onClick={onNext}
              icon={<ArrowRight className="w-5 h-5" />}
              iconPosition="right"
            >
              Continue to Intelligence Report
            </Button>
          </motion.div>
        )}
      </motion.div>
    </StepContainer>
  );
};

export default LocationStep;
