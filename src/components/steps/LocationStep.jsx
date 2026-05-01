/**
 * Location Step — Pro-Level Polish
 *
 * Step 1: Site selection. Clear input → results separation, calmer hierarchy.
 */

import React from "react";
import { motion } from "framer-motion";
import { MapPin, Navigation, ArrowRight } from "lucide-react";
import { SiteBoundaryEditor } from "../site";
import Button from "../ui/Button.jsx";
import Input from "../ui/Input.jsx";
import Card from "../ui/Card.jsx";
import ErrorBanner from "../ui/ErrorBanner.jsx";
import { Skeleton } from "../ui/feedback/Loader.jsx";
import IconWrapper from "../ui/IconWrapper.jsx";
import StepContainer from "../layout/StepContainer.jsx";
import { fadeInUp, staggerChildren } from "../../styles/animations.js";
import { shouldEnableBoundaryAutoDetect } from "../../services/siteBoundaryAutoDetectPolicy.js";

import LocationAccuracyBadge from "../ui/LocationAccuracyBadge.jsx";

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
  const hasResults = !!locationData;
  const boundaryAutoDetectEnabled =
    shouldEnableBoundaryAutoDetect(locationData);

  return (
    <StepContainer
      backgroundVariant="blueprint"
      enableParallax={true}
      maxWidth="6xl"
    >
      <motion.div
        className="space-y-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center">
          <div className="mb-5 flex justify-center">
            <IconWrapper size="lg" variant="gradient">
              <MapPin className="h-7 w-7" strokeWidth={1.75} />
            </IconWrapper>
          </div>
          <p className="text-eyebrow mb-2">Step 1 — Location</p>
          <h2 className="text-display-sm md:text-display-md mb-3 text-balance text-white">
            Where is the project?
          </h2>
          <p className="mx-auto max-w-2xl text-base text-white/65">
            Enter the project address for intelligent site analysis and climate
            data.
          </p>
        </motion.div>

        {/* Address Input Card */}
        <motion.div variants={fadeInUp}>
          <Card variant="glass" padding="lg" className="mx-auto max-w-3xl">
            <div className="space-y-5">
              <Input
                label="Project Address"
                type="text"
                value={address}
                onChange={(e) => onAddressChange(e.target.value)}
                placeholder="Enter full address..."
                fullWidth
                icon={<MapPin className="h-5 w-5" strokeWidth={1.75} />}
                disabled={isDetectingLocation}
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onAnalyzeLocation}
                  disabled={!address || isDetectingLocation}
                  loading={isDetectingLocation}
                  fullWidth
                  icon={<ArrowRight className="h-5 w-5" />}
                  iconPosition="right"
                >
                  Analyze location
                </Button>

                <Button
                  variant="subtle"
                  size="lg"
                  onClick={onDetectUserLocation}
                  disabled={isDetectingLocation}
                  icon={<Navigation className="h-5 w-5" strokeWidth={1.75} />}
                >
                  Use my location
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Geocoding error */}
        {error && (
          <motion.div variants={fadeInUp} className="mx-auto max-w-3xl">
            <ErrorBanner
              variant="error"
              title="Could not analyze location"
              message={error}
              visible={true}
            />
          </motion.div>
        )}

        {/* Map skeleton while geocoding (shown until locationData arrives) */}
        {isDetectingLocation && !locationData && (
          <motion.div variants={fadeInUp}>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <Skeleton
                variant="card"
                className="aspect-[16/9] h-auto w-full"
              />
            </div>
          </motion.div>
        )}

        {/* Results section divider — separates input phase from results phase */}
        {hasResults && (
          <motion.div
            variants={fadeInUp}
            className="flex items-center gap-4"
            aria-hidden="true"
          >
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-eyebrow">Site analysis</span>
            <div className="h-px flex-1 bg-white/10" />
          </motion.div>
        )}

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
              autoDetectEnabled={boundaryAutoDetectEnabled}
              autoDetectOnLoad={boundaryAutoDetectEnabled}
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
              icon={<ArrowRight className="h-5 w-5" />}
              iconPosition="right"
            >
              Continue to Intelligence
            </Button>
          </motion.div>
        )}
      </motion.div>
    </StepContainer>
  );
};

export default LocationStep;
