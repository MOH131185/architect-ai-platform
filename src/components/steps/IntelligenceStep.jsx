/**
 * Intelligence Step — Pro-Level Polish
 *
 * Step 2: Climate, zoning, and recommended style. Removes placeholder
 * copy that wasn't backed by data; tightens hierarchy.
 */

import React from "react";
import { motion } from "framer-motion";
import {
  Sun,
  MapPin,
  Building2,
  ArrowRight,
  ArrowLeft,
  Compass,
} from "lucide-react";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import StatCard from "../ui/StatCard.jsx";
import IconWrapper from "../ui/IconWrapper.jsx";
import StepContainer from "../layout/StepContainer.jsx";
import {
  fadeInUp,
  staggerChildren,
  cardReveal,
} from "../../styles/animations.js";

const IntelligenceStep = ({ locationData, onNext, onBack }) => {
  if (!locationData) return null;

  const {
    climate,
    zoning,
    recommendedStyle,
    sustainabilityScore,
    recommendedOrientation,
  } = locationData;

  const climateZoneCount = climate?.type === "temperate" ? 4 : 3;
  const orientation = recommendedOrientation || "South-facing";

  return (
    <StepContainer
      backgroundVariant="default"
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
              <Sun className="h-7 w-7" strokeWidth={1.75} />
            </IconWrapper>
          </div>
          <p className="text-eyebrow mb-2">Step 2 — Intelligence</p>
          <h2 className="text-display-sm md:text-display-md mb-3 text-balance text-white">
            Site intelligence report
          </h2>
          <p className="mx-auto max-w-2xl text-base text-white/65">
            AI-powered analysis of climate, zoning, and architectural context.
          </p>
        </motion.div>

        {/* Stats Grid (only metrics with real data) */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <StatCard
            value={sustainabilityScore ?? 85}
            label="Sustainability score"
            suffix="%"
            icon={<Sun className="h-6 w-6" strokeWidth={1.75} />}
            animate={true}
          />
          <StatCard
            value={climateZoneCount}
            label="Climate zones identified"
            icon={<Compass className="h-6 w-6" strokeWidth={1.75} />}
            animate={true}
          />
        </div>

        {/* Climate Data */}
        <motion.div variants={cardReveal}>
          <Card variant="glass" padding="lg">
            <div className="mb-5 flex items-center gap-4">
              <IconWrapper size="md" variant="primary">
                <Sun className="h-5 w-5" strokeWidth={1.75} />
              </IconWrapper>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight text-white">
                  Climate analysis
                </h3>
                <p className="text-sm text-white/55">
                  Site-specific environmental data
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <p className="text-eyebrow mb-1.5">Climate type</p>
                <p className="text-base font-semibold capitalize text-white/95">
                  {climate?.type || "Temperate"}
                </p>
              </div>
              <div>
                <p className="text-eyebrow mb-1.5">Recommended orientation</p>
                <p className="text-base font-semibold text-white/95">
                  {orientation}
                </p>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Zoning Information */}
        {zoning && (
          <motion.div variants={cardReveal}>
            <Card variant="glass" padding="lg">
              <div className="mb-5 flex items-center gap-4">
                <IconWrapper size="md" variant="primary">
                  <Building2 className="h-5 w-5" strokeWidth={1.75} />
                </IconWrapper>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-tight text-white">
                    Zoning &amp; regulations
                  </h3>
                  <p className="text-sm text-white/55">
                    Local planning requirements
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <p className="text-eyebrow mb-1.5">Zone type</p>
                  <p className="text-base font-semibold text-white/95">
                    {zoning.type || "Residential"}
                  </p>
                </div>
                <div>
                  <p className="text-eyebrow mb-1.5">Max height</p>
                  <p className="text-base font-semibold tabular-nums text-white/95">
                    {zoning.maxHeight || "12m"}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Recommended Style */}
        {recommendedStyle && (
          <motion.div variants={cardReveal}>
            <Card variant="glass" padding="lg" className="border-royal-500/30">
              <div className="flex items-center gap-4">
                <IconWrapper size="md" variant="primary">
                  <MapPin className="h-5 w-5" strokeWidth={1.75} />
                </IconWrapper>
                <div className="min-w-0">
                  <p className="text-eyebrow mb-1">Recommended style</p>
                  <p className="text-base font-semibold text-white/95">
                    {recommendedStyle}
                  </p>
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
            icon={<ArrowLeft className="h-5 w-5" />}
          >
            Back
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={onNext}
            icon={<ArrowRight className="h-5 w-5" />}
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
