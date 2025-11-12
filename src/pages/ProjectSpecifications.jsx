import React, { useEffect } from 'react';
import { Building2, ArrowRight, ChevronLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { useDesignContext } from '../context/DesignContext';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow';
import { useProgramSpaces } from '../hooks/useProgramSpaces';
import FloorPlanUpload from '../components/FloorPlanUpload';

/**
 * ProjectSpecifications - Step 4: Define project requirements
 *
 * Features:
 * - Building type selector
 * - Total area input
 * - Entrance direction selector
 * - AI-generated program spaces table
 * - Editable program spaces (add/remove/edit)
 * - Optional floor plan upload
 * - Total area validation
 *
 * @component
 */
const ProjectSpecifications = () => {
  const { projectDetails, setProjectDetails, floorPlanImage, setFloorPlanImage } = useDesignContext();
  const { nextStep, prevStep, canGoForward } = useArchitectWorkflow();
  const {
    programSpaces,
    isGeneratingSpaces,
    autoGenerateProgramSpaces,
    updateProgramSpace,
    removeProgramSpace,
    addProgramSpace,
    getTotalArea,
    validateProgramSpaces
  } = useProgramSpaces();

  // Auto-generate program spaces when building type or area changes
  useEffect(() => {
    if (projectDetails.program && projectDetails.area && programSpaces.length === 0) {
      autoGenerateProgramSpaces();
    }
  }, [projectDetails.program, projectDetails.area]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProjectDetailChange = (field, value) => {
    setProjectDetails(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validation = validateProgramSpaces();
  const totalArea = getTotalArea();

  const buildingTypes = [
    { value: 'detached-house', label: 'Detached House' },
    { value: 'semi-detached-house', label: 'Semi-Detached House' },
    { value: 'terraced-house', label: 'Terraced House' },
    { value: 'apartment-building', label: 'Apartment Building' },
    { value: 'villa', label: 'Villa' },
    { value: 'clinic', label: 'Medical Clinic' },
    { value: 'office', label: 'Office Building' },
    { value: 'retail', label: 'Retail Space' },
    { value: 'school', label: 'Educational Facility' },
    { value: 'mixed-use', label: 'Mixed Use' }
  ];

  const entranceDirections = [
    { value: 'N', label: 'North' },
    { value: 'S', label: 'South' },
    { value: 'E', label: 'East' },
    { value: 'W', label: 'West' }
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center mb-6">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mr-4">
            <Building2 className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Project Specifications</h2>
            <p className="text-gray-600">Define your building requirements</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Building Program */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Building Type <span className="text-red-500">*</span>
            </label>
            <select
              value={projectDetails.program || ''}
              onChange={(e) => handleProjectDetailChange('program', e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none transition-colors"
            >
              <option value="">Select building type...</option>
              {buildingTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Total Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total Floor Area (m²) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={projectDetails.area || ''}
              onChange={(e) => handleProjectDetailChange('area', e.target.value)}
              placeholder="e.g., 200"
              min="50"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Entrance Direction */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Main Entrance Direction
            </label>
            <select
              value={projectDetails.entranceDirection || 'S'}
              onChange={(e) => handleProjectDetailChange('entranceDirection', e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none transition-colors"
            >
              {entranceDirections.map(dir => (
                <option key={dir.value} value={dir.value}>
                  {dir.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Program Spaces */}
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800">Program Schedule</h3>
          {isGeneratingSpaces ? (
            <div className="flex items-center text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Generating spaces...
            </div>
          ) : (
            <button
              onClick={autoGenerateProgramSpaces}
              className="text-sm text-green-600 hover:text-green-700 font-medium"
              disabled={!projectDetails.program || !projectDetails.area}
            >
              Regenerate with AI
            </button>
          )}
        </div>

        {programSpaces.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Space Name</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Area (m²)</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Count</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Level</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700"></th>
                  </tr>
                </thead>
                <tbody>
                  {programSpaces.map((space, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={space.name}
                          onChange={(e) => updateProgramSpace(index, { name: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-200 rounded focus:border-green-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          value={space.area}
                          onChange={(e) => updateProgramSpace(index, { area: e.target.value })}
                          className="w-20 px-2 py-1 border border-gray-200 rounded focus:border-green-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          value={space.count}
                          onChange={(e) => updateProgramSpace(index, { count: parseInt(e.target.value) || 1 })}
                          className="w-16 px-2 py-1 border border-gray-200 rounded focus:border-green-500 focus:outline-none"
                          min="1"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={space.level}
                          onChange={(e) => updateProgramSpace(index, { level: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-200 rounded focus:border-green-500 focus:outline-none"
                        >
                          <option value="Ground">Ground</option>
                          <option value="First">First</option>
                          <option value="Second">Second</option>
                          <option value="Basement">Basement</option>
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <button
                          onClick={() => removeProgramSpace(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => addProgramSpace({ name: 'New Space', area: '20', count: 1, level: 'Ground' })}
                className="flex items-center text-sm text-green-600 hover:text-green-700 font-medium"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Space
              </button>

              <div className="text-right">
                <p className="text-sm text-gray-600">
                  Total: <span className="font-semibold">{totalArea.toFixed(1)} m²</span>
                  {projectDetails.area && (
                    <span className={`ml-2 ${validation.utilizationPercent >= 70 && validation.utilizationPercent <= 115 ? 'text-green-600' : 'text-amber-600'}`}>
                      ({validation.utilizationPercent}% of project area)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {validation.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                {validation.warnings.map((warning, idx) => (
                  <p key={idx} className="text-sm text-amber-700">{warning}</p>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <p>Select building type and area to generate program spaces</p>
          </div>
        )}
      </div>

      {/* Floor Plan Upload */}
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Floor Plan (Optional)</h3>
        <FloorPlanUpload
          onImageChange={setFloorPlanImage}
          currentImage={floorPlanImage}
        />
        <p className="text-sm text-gray-500 mt-2">
          Upload an existing floor plan for AI to reference (optional)
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="flex items-center px-6 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back
        </button>
        <button
          onClick={nextStep}
          disabled={!canGoForward}
          className="flex items-center px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all duration-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to Generation
          <ArrowRight className="w-5 h-5 ml-2" />
        </button>
      </div>
    </div>
  );
};

export default ProjectSpecifications;
