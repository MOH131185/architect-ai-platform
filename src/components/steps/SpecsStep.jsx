/**
 * Specs Step - Enhanced with Building Taxonomy
 * 
 * Step 4: Project specifications with building type selector, entrance orientation, and program generator
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Settings, Sparkles, ArrowRight, ArrowLeft, Download, Upload, Lock, Unlock, Layers } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Card from '../ui/Card.jsx';
// BlueprintPanel available from '../ui/BlueprintPanel.jsx' if needed
import IconWrapper from '../ui/IconWrapper.jsx';
import BuildingTypeSelector from '../specs/BuildingTypeSelector.jsx';
import EntranceDirectionSelector from '../specs/EntranceDirectionSelector.jsx';
import BuildingProgramTable from '../specs/BuildingProgramTable.jsx';
import ProgramReviewCards from '../specs/ProgramReviewCards.jsx';
import StepContainer from '../layout/StepContainer.jsx';
import { fadeInUp, staggerChildren } from '../../styles/animations.js';
import autoLevelAssignmentService from '../../services/autoLevelAssignmentService.js';

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

  const canProceed = projectDetails.area && projectDetails.category && projectDetails.subType;

  const handleBuildingTypeChange = useCallback(({ category, subType }) => {
    onProjectDetailsChange({
      ...projectDetails,
      category,
      subType,
      program: subType || category // Maintain backward compatibility
    });
  }, [projectDetails, onProjectDetailsChange]);

  const handleEntranceChange = useCallback((direction) => {
    onProjectDetailsChange({
      ...projectDetails,
      entranceDirection: direction
    });
  }, [projectDetails, onProjectDetailsChange]);

  const handleProgramRowChange = useCallback((index, field, value) => {
    const updated = [...programSpaces];
    const nextRow = { ...updated[index], [field]: value };
    if (field === 'label') {
      nextRow.name = value;
    }
    if (field === 'name') {
      nextRow.label = value;
    }
    updated[index] = nextRow;

    // Preserve program-level metadata on arrays (used by downstream generators)
    updated._calculatedFloorCount = programSpaces._calculatedFloorCount;
    updated._floorMetrics = programSpaces._floorMetrics;

    onProgramSpacesChange(updated);
  }, [programSpaces, onProgramSpacesChange]);

  const handleAddSpace = useCallback(() => {
    const newSpace = {
      id: `space_${Date.now()}`,
      spaceType: 'generic',
      name: '',
      label: '',
      area: 0,
      count: 1,
      level: 'Ground',
      notes: ''
    };
    const updated = [...programSpaces, newSpace];
    updated._calculatedFloorCount = programSpaces._calculatedFloorCount;
    updated._floorMetrics = programSpaces._floorMetrics;
    onProgramSpacesChange(updated);
  }, [programSpaces, onProgramSpacesChange]);

  const handleRemoveSpace = useCallback((index) => {
    const updated = programSpaces.filter((_, i) => i !== index);
    updated._calculatedFloorCount = programSpaces._calculatedFloorCount;
    updated._floorMetrics = programSpaces._floorMetrics;
    onProgramSpacesChange(updated);
  }, [programSpaces, onProgramSpacesChange]);

  const handleReorderSpace = useCallback((fromIndex, toIndex) => {
    const updated = [...programSpaces];
    const [removed] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, removed);

    updated._calculatedFloorCount = programSpaces._calculatedFloorCount;
    updated._floorMetrics = programSpaces._floorMetrics;

    onProgramSpacesChange(updated);
  }, [programSpaces, onProgramSpacesChange]);

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
              <Settings className="w-12 h-12" />
            </IconWrapper>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 font-heading">
            Project Specifications
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Define building type, entrance, and program spaces
          </p>
        </motion.div>

        {/* Section 1: Building Type & Sub-type */}
        <motion.div variants={fadeInUp}>
          <Card variant="glass" padding="lg">
            <h3 className="text-xl font-semibold text-white mb-4 font-heading">Building Type</h3>
            <BuildingTypeSelector
              selectedCategory={projectDetails.category}
              selectedSubType={projectDetails.subType}
              onSelectionChange={handleBuildingTypeChange}
              validationErrors={validationState?.buildingType || []}
            />
          </Card>
        </motion.div>

        {/* Section 2: Entrance Orientation & Compass */}
        {projectDetails.category && (
          <motion.div variants={fadeInUp}>
            <Card variant="glass" padding="lg">
              <h3 className="text-xl font-semibold text-white mb-4 font-heading">Main Entrance Orientation</h3>
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
              <h3 className="text-xl font-semibold text-white mb-6 font-heading">Building Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="Total Area (m²)"
                  type="number"
                  value={projectDetails.area}
                  onChange={(e) => onProjectDetailsChange({ ...projectDetails, area: e.target.value })}
                  placeholder="e.g., 250"
                  fullWidth
                  required
                />
                <Input
                  label=""
                  type="number"
                  value={projectDetails.floorCount || 2}
                  onChange={(e) => {
                    const maxFloors = projectDetails.floorMetrics?.maxFloorsAllowed || 10;
                    const nextCount = Math.max(1, Math.min(maxFloors, parseInt(e.target.value, 10) || 1));
                    onProjectDetailsChange({
                      ...projectDetails,
                      floorCount: nextCount,
                      floorCountLocked: true,
                    });

                    if (programSpaces?.length > 0) {
                      const buildingType =
                        projectDetails.program || projectDetails.subType || projectDetails.category || 'mixed-use';
                      const reassigned = autoLevelAssignmentService.autoAssignSpacesToLevels(
                        programSpaces,
                        nextCount,
                        buildingType
                      );
                      reassigned._calculatedFloorCount = nextCount;
                      reassigned._floorMetrics = projectDetails.floorMetrics || programSpaces._floorMetrics || null;
                      onProgramSpacesChange(reassigned);
                    }
                  }}
                  placeholder="Number of levels"
                  min="1"
                  fullWidth
                  disabled={!projectDetails.floorCountLocked}
                  icon={<Layers className="w-4 h-4" />}
                />

                <div className="flex items-center gap-3 -mt-2">
                  {!projectDetails.floorCountLocked && (
                    <div className="flex-1 px-4 py-3 rounded-lg bg-navy-800/60 border border-navy-700">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-semibold">
                          {projectDetails.autoDetectedFloorCount || projectDetails.floorCount || 2} floors
                        </span>
                        <span className="text-xs text-gray-400">auto</span>
                      </div>
                      {projectDetails.floorMetrics?.reasoning && (
                        <p className="mt-1 text-xs text-gray-400 line-clamp-2">
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

                      const floorCount = nextLocked
                        ? Math.max(1, parseInt(projectDetails.floorCount, 10) || (autoFloors || 2))
                        : (autoFloors || projectDetails.floorCount || 2);

                      onProjectDetailsChange({
                        ...projectDetails,
                        floorCountLocked: nextLocked,
                        floorCount,
                      });

                      if (!nextLocked && programSpaces?.length > 0 && autoFloors) {
                        const buildingType =
                          projectDetails.program || projectDetails.subType || projectDetails.category || 'mixed-use';
                        const reassigned = autoLevelAssignmentService.autoAssignSpacesToLevels(
                          programSpaces,
                          autoFloors,
                          buildingType
                        );
                        reassigned._calculatedFloorCount = autoFloors;
                        reassigned._floorMetrics = projectDetails.floorMetrics || programSpaces._floorMetrics || null;
                        onProgramSpacesChange(reassigned);
                      }
                    }}
                    icon={projectDetails.floorCountLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  >
                    {projectDetails.floorCountLocked ? 'Unlock' : 'Lock'}
                  </Button>
                </div>

                {projectDetails.floorCountLocked &&
                  projectDetails.autoDetectedFloorCount &&
                  projectDetails.autoDetectedFloorCount !== projectDetails.floorCount && (
                    <p className="-mt-2 text-xs text-amber-300">
                      Auto suggests {projectDetails.autoDetectedFloorCount} levels for this site.
                    </p>
                  )}

                {projectDetails.floorMetrics && (
                  <div className="-mt-2 text-xs text-gray-400 flex flex-wrap gap-4">
                    <span>
                      Footprint ~{projectDetails.floorMetrics.actualFootprint?.toFixed?.(0) || '—'}m²
                    </span>
                    <span>
                      Coverage {projectDetails.floorMetrics.siteCoveragePercent?.toFixed?.(0) || '—'}%
                    </span>
                    {projectDetails.floorMetrics.maxFloorsAllowed && (
                      <span>Max floors {projectDetails.floorMetrics.maxFloorsAllowed}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Custom Notes (Optional)
                </label>
                <textarea
                  value={projectDetails.customNotes || ''}
                  onChange={(e) => onProjectDetailsChange({ ...projectDetails, customNotes: e.target.value })}
                  placeholder="Add any special requirements or notes..."
                  rows={3}
                  className="w-full bg-navy-800/60 border border-navy-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-royal-500 focus:ring-1 focus:ring-royal-500 outline-none transition-colors"
                />
              </div>
            </Card>
          </motion.div>
        )}

        {/* Section 4: Program Generator Controls */}
        {projectDetails.area && projectDetails.category && (
          <motion.div variants={fadeInUp}>
            <Card variant="glass" padding="lg">
              <h3 className="text-xl font-semibold text-white mb-4 font-heading">Program Schedule</h3>
              <div className="flex flex-wrap gap-3 mb-6">
                <Button
                  variant="primary"
                  size="md"
                  onClick={onGenerateProgramSpaces}
                  loading={isGeneratingSpaces}
                  disabled={isGeneratingSpaces}
                  icon={<Sparkles className="w-4 h-4" />}
                >
                  {isGeneratingSpaces ? 'Generating...' : 'Generate Program'}
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
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-white">Program Spaces</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowProgramReview(!showProgramReview)}
                    className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${showProgramReview
                        ? 'bg-royal-500 text-white'
                        : 'bg-navy-700 text-gray-300 hover:bg-navy-600'
                      }`}
                  >
                    {showProgramReview ? '📊 Table View' : '🎴 Card View'}
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
                  floorCount={projectDetails.floorCount || projectDetails.autoDetectedFloorCount || 2}
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
