/**
 * Specs Step - Enhanced with Building Taxonomy
 * 
 * Step 4: Project specifications with building type selector, entrance orientation, and program generator
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Settings, Sparkles, ArrowRight, ArrowLeft, Download, Upload } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Card from '../ui/Card.jsx';
import BlueprintPanel from '../ui/BlueprintPanel.jsx';
import IconWrapper from '../ui/IconWrapper.jsx';
import BuildingTypeSelector from '../specs/BuildingTypeSelector.jsx';
import EntranceDirectionSelector from '../specs/EntranceDirectionSelector.jsx';
import BuildingProgramTable from '../specs/BuildingProgramTable.jsx';
import ProgramReviewCards from '../specs/ProgramReviewCards.jsx';
import StepContainer from '../layout/StepContainer.jsx';
import { fadeInUp, staggerChildren } from '../../styles/animations.js';

const SpecsStep = ({
  projectDetails,
  programSpaces,
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
  const [programWarnings, setProgramWarnings] = useState([]);
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
    updated[index] = { ...updated[index], [field]: value };
    onProgramSpacesChange(updated);
  }, [programSpaces, onProgramSpacesChange]);

  const handleAddSpace = useCallback(() => {
    const newSpace = {
      id: `space_${Date.now()}`,
      spaceType: 'generic',
      label: '',
      area: 0,
      count: 1,
      level: 'Ground',
      notes: ''
    };
    onProgramSpacesChange([...programSpaces, newSpace]);
  }, [programSpaces, onProgramSpacesChange]);

  const handleRemoveSpace = useCallback((index) => {
    const updated = programSpaces.filter((_, i) => i !== index);
    onProgramSpacesChange(updated);
  }, [programSpaces, onProgramSpacesChange]);

  const handleReorderSpace = useCallback((fromIndex, toIndex) => {
    const updated = [...programSpaces];
    const [removed] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, removed);
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
                  label="Number of Floors"
                  type="number"
                  value={projectDetails.floorCount || 2}
                  onChange={(e) => onProjectDetailsChange({ ...projectDetails, floorCount: parseInt(e.target.value) || 2 })}
                  placeholder="e.g., 2"
                  min="1"
                  fullWidth
                />
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
