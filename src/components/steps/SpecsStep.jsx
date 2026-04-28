/**
 * Specs Step - Enhanced with Building Taxonomy
 *
 * Step 4: Project specifications with building type selector, entrance orientation, and program generator
 */

import React, { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Download,
  Upload,
  Lock,
  Unlock,
  Layers,
} from "lucide-react";
import Button from "../ui/Button.jsx";
import Input from "../ui/Input.jsx";
import Card from "../ui/Card.jsx";
// BlueprintPanel available from '../ui/BlueprintPanel.jsx' if needed
import IconWrapper from "../ui/IconWrapper.jsx";
import BuildingTypeSelector from "../specs/BuildingTypeSelector.jsx";
import EntranceDirectionSelector from "../specs/EntranceDirectionSelector.jsx";
import BuildingProgramTable from "../specs/BuildingProgramTable.jsx";
import ProgramReviewCards from "../specs/ProgramReviewCards.jsx";
import StepContainer from "../layout/StepContainer.jsx";
import { fadeInUp, staggerChildren } from "../../styles/animations.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { isSupportedResidentialV2SubType } from "../../services/project/v2ProjectContracts.js";
import {
  levelIndexFromLabel,
  levelName,
  normalizeLevelIndex,
} from "../../services/project/levelUtils.js";
import {
  resolveAuthoritativeFloorCount,
  syncProgramToFloorCount,
} from "../../services/project/floorCountAuthority.js";

const SpecsStep = ({
  projectDetails,
  programSpaces,
  programWarnings = [],
  onProjectDetailsChange,
  onProgramSpacesChange,
  onGenerateProgramSpaces,
  isGeneratingSpaces,
  onNext,
  onBack,
  onImportProgram,
  onExportProgram,
  onAutoDetectEntrance,
  isDetectingEntrance,
  autoDetectResult,
  validationState,
}) => {
  const [showProgramReview, setShowProgramReview] = useState(false);
  const restrictToResidentialV2 =
    isFeatureEnabled("ukResidentialV2") &&
    isFeatureEnabled("hideExperimentalBuildingTypes");
  const supportedResidentialSubtype =
    projectDetails.category === "residential" &&
    isSupportedResidentialV2SubType(projectDetails.subType);

  const canProceed =
    projectDetails.area &&
    projectDetails.category &&
    projectDetails.subType &&
    (!restrictToResidentialV2 || supportedResidentialSubtype);

  const handleBuildingTypeChange = useCallback(
    ({ category, subType }) => {
      onProjectDetailsChange({
        ...projectDetails,
        category,
        subType,
        program: subType || category, // Maintain backward compatibility
      });
    },
    [projectDetails, onProjectDetailsChange],
  );

  const handleEntranceChange = useCallback(
    (direction) => {
      onProjectDetailsChange({
        ...projectDetails,
        entranceDirection: direction,
      });
    },
    [projectDetails, onProjectDetailsChange],
  );

  // Single source of truth for floor count across the row clamp, the table
  // dropdown options, and any downstream consumer in this component. Stale
  // programSpaces._calculatedFloorCount must never override the live
  // resolveAuthoritativeFloorCount result.
  const authoritativeFloorCount = useMemo(
    () =>
      resolveAuthoritativeFloorCount(projectDetails, { fallback: 2 })
        .floorCount,
    [projectDetails],
  );

  // Shared helper used by the manual Number-of-Levels input, the Lock/Unlock
  // button, and the "Use recommended N levels" action. Centralising this means
  // every path that mutates floor count also re-syncs the programme rows.
  const applyFloorCountChange = useCallback(
    ({ nextLocked, nextFloorCount }) => {
      const nextProjectDetails = {
        ...projectDetails,
        floorCountLocked: nextLocked,
        floorCount: nextFloorCount,
      };
      onProjectDetailsChange(nextProjectDetails);

      if (programSpaces?.length > 0) {
        const buildingType =
          projectDetails.program ||
          projectDetails.subType ||
          projectDetails.category ||
          "mixed-use";
        const syncResult = syncProgramToFloorCount(
          programSpaces,
          nextFloorCount,
          {
            buildingType,
            projectDetails: nextProjectDetails,
          },
        );
        onProgramSpacesChange(syncResult.spaces);
      }
    },
    [
      projectDetails,
      programSpaces,
      onProjectDetailsChange,
      onProgramSpacesChange,
    ],
  );

  const handleProgramRowChange = useCallback(
    (index, field, value) => {
      const updated = [...programSpaces];
      const nextRow = { ...updated[index], [field]: value };
      if (field === "label") {
        nextRow.name = value;
      }
      if (field === "name") {
        nextRow.label = value;
      }
      if (field === "level") {
        const parsedIndex = levelIndexFromLabel(value);
        const levelIndex = normalizeLevelIndex(
          parsedIndex,
          authoritativeFloorCount,
        );
        nextRow.level = levelName(levelIndex);
        nextRow.levelIndex = levelIndex;
        nextRow.level_index = levelIndex;
      }
      if (field === "levelIndex" || field === "level_index") {
        const levelIndex = normalizeLevelIndex(value, authoritativeFloorCount);
        nextRow.levelIndex = levelIndex;
        nextRow.level_index = levelIndex;
        nextRow.level = levelName(levelIndex);
      }
      updated[index] = nextRow;

      updated._calculatedFloorCount = programSpaces._calculatedFloorCount;
      updated._floorMetrics = programSpaces._floorMetrics;

      onProgramSpacesChange(updated);
    },
    [programSpaces, authoritativeFloorCount, onProgramSpacesChange],
  );

  const handleAddSpace = useCallback(() => {
    const newSpace = {
      id: `space_${Date.now()}`,
      spaceType: "generic",
      name: "",
      label: "",
      area: 0,
      count: 1,
      level: "Ground",
      levelIndex: 0,
      level_index: 0,
      notes: "",
    };
    const updated = [...programSpaces, newSpace];
    updated._calculatedFloorCount = programSpaces._calculatedFloorCount;
    updated._floorMetrics = programSpaces._floorMetrics;
    onProgramSpacesChange(updated);
  }, [programSpaces, onProgramSpacesChange]);

  const handleRemoveSpace = useCallback(
    (index) => {
      const updated = programSpaces.filter((_, i) => i !== index);
      updated._calculatedFloorCount = programSpaces._calculatedFloorCount;
      updated._floorMetrics = programSpaces._floorMetrics;
      onProgramSpacesChange(updated);
    },
    [programSpaces, onProgramSpacesChange],
  );

  const handleReorderSpace = useCallback(
    (fromIndex, toIndex) => {
      const updated = [...programSpaces];
      const [removed] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, removed);

      updated._calculatedFloorCount = programSpaces._calculatedFloorCount;
      updated._floorMetrics = programSpaces._floorMetrics;

      onProgramSpacesChange(updated);
    },
    [programSpaces, onProgramSpacesChange],
  );

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
              <Settings className="h-7 w-7" strokeWidth={1.75} />
            </IconWrapper>
          </div>
          <p className="text-eyebrow mb-2">Step 4 — Specifications</p>
          <h2 className="text-display-sm md:text-display-md mb-3 text-balance text-white">
            Project specifications
          </h2>
          <p className="mx-auto max-w-2xl text-base text-white/65">
            Define building type, entrance, and program spaces.
          </p>
        </motion.div>

        {/* Section 1: Building Type & Sub-type */}
        <motion.div variants={fadeInUp}>
          <Card variant="glass" padding="lg">
            <h3 className="mb-4 text-lg font-semibold tracking-tight text-white">
              Building type
            </h3>
            {restrictToResidentialV2 && (
              <div className="mb-4 rounded-xl border border-success-500/30 bg-success-500/10 px-4 py-3 text-sm text-success-200">
                UK Residential V2 is live. Production generation is restricted
                to supported low-rise residential types, and unsupported types
                are intentionally marked experimental/off.
              </div>
            )}
            <BuildingTypeSelector
              selectedCategory={projectDetails.category}
              selectedSubType={projectDetails.subType}
              onSelectionChange={handleBuildingTypeChange}
              validationErrors={validationState?.buildingType || []}
            />
            {restrictToResidentialV2 &&
              projectDetails.category &&
              projectDetails.subType &&
              !supportedResidentialSubtype && (
                <p className="mt-4 text-sm text-warning-300">
                  This subtype is outside the supported UK Residential V2
                  production scope. Choose a supported residential subtype to
                  continue.
                </p>
              )}
          </Card>
        </motion.div>

        {/* Section 2: Entrance Orientation & Compass */}
        {projectDetails.category && (
          <motion.div variants={fadeInUp}>
            <Card variant="glass" padding="lg">
              <h3 className="mb-4 text-lg font-semibold tracking-tight text-white">
                Main entrance orientation
              </h3>
              <EntranceDirectionSelector
                selectedDirection={projectDetails.entranceDirection}
                onDirectionChange={handleEntranceChange}
                onAutoDetect={onAutoDetectEntrance}
                isDetecting={isDetectingEntrance}
                autoDetectResult={autoDetectResult}
                showAutoDetect={!!onAutoDetectEntrance}
              />
            </Card>
          </motion.div>
        )}

        {/* Section 3: Core Metrics */}
        {projectDetails.category && projectDetails.subType && (
          <motion.div variants={fadeInUp}>
            <Card variant="glass" padding="lg">
              <h3 className="mb-6 text-lg font-semibold tracking-tight text-white">
                Building metrics
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="Total Area (m²)"
                  type="number"
                  value={projectDetails.area}
                  onChange={(e) =>
                    onProjectDetailsChange({
                      ...projectDetails,
                      area: e.target.value,
                    })
                  }
                  placeholder="e.g., 250"
                  fullWidth
                  required
                />
                <Input
                  label=""
                  type="number"
                  value={projectDetails.floorCount || 2}
                  onChange={(e) => {
                    const maxFloors =
                      projectDetails.floorMetrics?.maxFloorsAllowed || 10;
                    const nextCount = Math.max(
                      1,
                      Math.min(maxFloors, parseInt(e.target.value, 10) || 1),
                    );
                    applyFloorCountChange({
                      nextLocked: true,
                      nextFloorCount: nextCount,
                    });
                  }}
                  placeholder="Number of levels"
                  min="1"
                  fullWidth
                  icon={<Layers className="w-4 h-4" />}
                />

                <div className="-mt-2 flex items-center gap-3">
                  {!projectDetails.floorCountLocked && (
                    <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white tabular-nums">
                          {projectDetails.autoDetectedFloorCount ||
                            projectDetails.floorCount ||
                            2}{" "}
                          floors
                        </span>
                        <span className="text-xs uppercase tracking-wider text-white/45">
                          auto
                        </span>
                      </div>
                      {projectDetails.floorMetrics?.reasoning && (
                        <p className="mt-1 line-clamp-2 text-xs text-white/55">
                          {projectDetails.floorMetrics.reasoning}
                        </p>
                      )}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      const currentlyLocked = !!projectDetails.floorCountLocked;
                      const autoFloors = projectDetails.autoDetectedFloorCount;
                      const nextLocked = !currentlyLocked;

                      const nextFloorCount = nextLocked
                        ? Math.max(
                            1,
                            parseInt(projectDetails.floorCount, 10) ||
                              autoFloors ||
                              2,
                          )
                        : autoFloors || projectDetails.floorCount || 2;

                      applyFloorCountChange({
                        nextLocked,
                        nextFloorCount,
                      });
                    }}
                    icon={
                      projectDetails.floorCountLocked ? (
                        <Unlock className="w-4 h-4" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )
                    }
                  >
                    {projectDetails.floorCountLocked ? "Unlock" : "Lock"}
                  </Button>
                </div>

                {projectDetails.floorCountLocked &&
                  projectDetails.autoDetectedFloorCount &&
                  projectDetails.autoDetectedFloorCount !==
                    projectDetails.floorCount && (
                    <div className="-mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-warning-500/30 bg-warning-500/5 px-3 py-2">
                      <p className="flex-1 text-xs text-warning-200">
                        Manual floor count locked: programme will use{" "}
                        <span className="font-semibold">
                          {projectDetails.floorCount}
                        </span>{" "}
                        level
                        {projectDetails.floorCount === 1 ? "" : "s"}. Auto
                        recommendation:{" "}
                        <span className="font-semibold">
                          {projectDetails.autoDetectedFloorCount}
                        </span>
                        .
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          applyFloorCountChange({
                            nextLocked: false,
                            nextFloorCount:
                              projectDetails.autoDetectedFloorCount,
                          })
                        }
                      >
                        Use {projectDetails.autoDetectedFloorCount} levels
                      </Button>
                    </div>
                  )}

                {projectDetails.floorMetrics && (
                  <div className="-mt-2 flex flex-wrap gap-4 text-xs text-white/55">
                    <span>
                      Footprint ~
                      {projectDetails.floorMetrics.actualFootprint?.toFixed?.(
                        0,
                      ) || "—"}
                      m²
                    </span>
                    <span>
                      Coverage{" "}
                      {projectDetails.floorMetrics.siteCoveragePercent?.toFixed?.(
                        0,
                      ) || "—"}
                      %
                    </span>
                    {projectDetails.floorMetrics.maxFloorsAllowed && (
                      <span>
                        Max floors{" "}
                        {projectDetails.floorMetrics.maxFloorsAllowed}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-6">
                <label
                  htmlFor="custom-notes"
                  className="text-eyebrow mb-2 block"
                >
                  Custom notes (optional)
                </label>
                <textarea
                  id="custom-notes"
                  value={projectDetails.customNotes || ""}
                  onChange={(e) =>
                    onProjectDetailsChange({
                      ...projectDetails,
                      customNotes: e.target.value,
                    })
                  }
                  placeholder="Add any special requirements or notes..."
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-all duration-200 hover:border-white/20 focus:border-royal-500 focus:ring-2 focus:ring-royal-500/20"
                />
              </div>
            </Card>
          </motion.div>
        )}

        {/* Section 4: Program Generator Controls */}
        {projectDetails.area && projectDetails.category && (
          <motion.div variants={fadeInUp}>
            <Card variant="glass" padding="lg">
              <h3 className="mb-4 text-lg font-semibold tracking-tight text-white">
                Program schedule
              </h3>
              <div className="flex flex-wrap gap-3 mb-6">
                <Button
                  variant="primary"
                  size="md"
                  onClick={onGenerateProgramSpaces}
                  loading={isGeneratingSpaces}
                  disabled={isGeneratingSpaces}
                  icon={<Sparkles className="w-4 h-4" />}
                >
                  {isGeneratingSpaces
                    ? "Compiling..."
                    : restrictToResidentialV2 && supportedResidentialSubtype
                      ? "Compile Program"
                      : "Generate Program"}
                </Button>
                {onImportProgram && (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={onImportProgram}
                    icon={<Upload className="w-4 h-4" />}
                  >
                    Import
                  </Button>
                )}
                {onExportProgram && programSpaces.length > 0 && (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={onExportProgram}
                    icon={<Download className="w-4 h-4" />}
                  >
                    Export
                  </Button>
                )}
              </div>

              {/* Section 5: Program Table */}
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-white/70">
                  Program spaces
                </h4>
                <div
                  role="tablist"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!showProgramReview}
                    onClick={() => setShowProgramReview(false)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      !showProgramReview
                        ? "bg-white/10 text-white"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    Table
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={showProgramReview}
                    onClick={() => setShowProgramReview(true)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      showProgramReview
                        ? "bg-white/10 text-white"
                        : "text-white/55 hover:text-white"
                    }`}
                  >
                    Cards
                  </button>
                </div>
              </div>

              {showProgramReview ? (
                <ProgramReviewCards
                  programSpaces={programSpaces}
                  onEdit={(space) => {
                    // Find space index and switch to table view for editing
                    setShowProgramReview(false);
                  }}
                />
              ) : (
                <BuildingProgramTable
                  programSpaces={programSpaces}
                  floorCount={authoritativeFloorCount}
                  onChange={handleProgramRowChange}
                  onAdd={handleAddSpace}
                  onRemove={handleRemoveSpace}
                  onReorder={handleReorderSpace}
                  onImport={onProgramSpacesChange}
                  validationWarnings={programWarnings}
                />
              )}
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
            disabled={!canProceed}
            icon={<ArrowRight className="w-5 h-5" />}
            iconPosition="right"
          >
            Generate Design
          </Button>
        </motion.div>
      </motion.div>
    </StepContainer>
  );
};

export default SpecsStep;
