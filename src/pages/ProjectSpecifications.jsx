import React, { useEffect, useMemo } from 'react';
import { Building2, ArrowRight, ChevronLeft, Loader2, Plus, Trash2, Lock, Unlock, Layers } from 'lucide-react';
import { useDesignContext } from '../context/DesignContext.jsx';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow.js';
import { useProgramSpaces } from '../hooks/useProgramSpaces.js';

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
  const { projectDetails, setProjectDetails } = useDesignContext();
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

  // Level count control from context
  const {
    lockedLevelCount,
    setLockedLevelCount,
    autoDetectedLevelCount,
    levelMetrics,
    siteMetrics
  } = useDesignContext();

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

  // Determine current floor count (locked or auto-detected)
  const currentFloorCount = lockedLevelCount !== null ? lockedLevelCount : (autoDetectedLevelCount || 2);
  const isLevelLocked = lockedLevelCount !== null;

  // Generate dynamic level options based on current floor count
  const levelOptions = useMemo(() => {
    const options = ['Ground'];
    if (currentFloorCount >= 2) options.push('First');
    if (currentFloorCount >= 3) options.push('Second');
    if (currentFloorCount >= 4) options.push('Third');
    for (let i = 5; i <= currentFloorCount; i++) {
      options.push(`${i - 1}th`);
    }
    options.push('Basement'); // Always allow basement
    return options;
  }, [currentFloorCount]);

  // Handle lock/unlock toggle
  const handleLevelLockToggle = () => {
    if (isLevelLocked) {
      // Unlock - return to auto-detect
      setLockedLevelCount(null);
    } else {
      // Lock at current auto-detected value
      setLockedLevelCount(autoDetectedLevelCount || 2);
    }
  };

  // Handle manual level count change
  const handleLevelCountChange = (newCount) => {
    const count = Math.max(1, Math.min(10, parseInt(newCount) || 1));
    setLockedLevelCount(count);
  };

  const buildingTypes = [
    // Residential - Houses
    { value: 'detached-house', label: '🏡 Detached House (Single-family)' },
    { value: 'semi-detached-house', label: '🏡 Semi-detached House (Duplex)' },
    { value: 'terraced-house', label: '🏡 Terraced House (Townhouse)' },
    { value: 'villa', label: '🏡 Villa (Luxury Detached)' },
    { value: 'cottage', label: '🏡 Cottage (Small Detached)' },
    // Residential - Multi-family
    { value: 'apartment-building', label: '🏢 Apartment Building' },
    { value: 'condominium', label: '🏢 Condominium Complex' },
    { value: 'residential-tower', label: '🏢 Residential Tower' },
    // Healthcare
    { value: 'clinic', label: '🏥 Medical Clinic' },
    { value: 'dental-clinic', label: '🏥 Dental Clinic' },
    { value: 'health-center', label: '🏥 Health Center' },
    { value: 'pharmacy', label: '🏥 Pharmacy' },
    // Commercial
    { value: 'office', label: '🏢 Office Building' },
    { value: 'coworking', label: '🏢 Coworking Space' },
    { value: 'retail', label: '🏢 Retail Space' },
    { value: 'shopping-center', label: '🏢 Shopping Center' },
    { value: 'restaurant', label: '🏢 Restaurant' },
    { value: 'cafe', label: '🏢 Café' },
    // Educational
    { value: 'school', label: '🎓 School' },
    { value: 'kindergarten', label: '🎓 Kindergarten' },
    { value: 'training-center', label: '🎓 Training Center' },
    { value: 'library', label: '🎓 Library' },
    // Hospitality
    { value: 'hotel', label: '🏨 Hotel' },
    { value: 'hostel', label: '🏨 Hostel' },
    { value: 'bed-breakfast', label: '🏨 Bed & Breakfast' },
    // Public & Cultural
    { value: 'community-center', label: '🏛️ Community Center' },
    { value: 'museum', label: '🏛️ Museum' },
    { value: 'gallery', label: '🏛️ Art Gallery' },
    { value: 'theater', label: '🏛️ Theater' },
    // Sports & Recreation
    { value: 'gym', label: '🏋️ Gym / Fitness Center' },
    { value: 'sports-hall', label: '🏋️ Sports Hall' },
    { value: 'swimming-pool', label: '🏋️ Swimming Pool Complex' },
    { value: 'tennis-club', label: '🏋️ Tennis Club' },
    { value: 'yoga-studio', label: '🏋️ Yoga Studio' },
    // Industrial & Warehouse
    { value: 'warehouse', label: '🏭 Warehouse' },
    { value: 'factory', label: '🏭 Factory / Manufacturing' },
    { value: 'workshop', label: '🏭 Workshop' },
    { value: 'logistics-center', label: '🏭 Logistics Center' },
    { value: 'storage-facility', label: '🏭 Storage Facility' },
    // Religious
    { value: 'church', label: '⛪ Church' },
    { value: 'mosque', label: '⛪ Mosque' },
    { value: 'temple', label: '⛪ Temple' },
    { value: 'synagogue', label: '⛪ Synagogue' },
    { value: 'chapel', label: '⛪ Chapel' },
    // Transportation
    { value: 'parking-garage', label: '🚗 Parking Garage' },
    { value: 'bus-station', label: '🚗 Bus Station' },
    { value: 'train-station', label: '🚗 Train Station' },
    { value: 'airport-terminal', label: '🚗 Airport Terminal' },
    { value: 'service-station', label: '🚗 Service Station' },
    // Mixed-Use
    { value: 'mixed-use-residential-commercial', label: '🏪 Mixed-Use (Residential + Commercial)' },
    { value: 'mixed-use-office-retail', label: '🏪 Mixed-Use (Office + Retail)' },
    { value: 'live-work', label: '🏪 Live-Work Space' },
    // Senior & Care
    { value: 'nursing-home', label: '🏥 Nursing Home' },
    { value: 'assisted-living', label: '🏥 Assisted Living Facility' },
    { value: 'daycare', label: '🏥 Daycare Center' },
    { value: 'retirement-community', label: '🏥 Retirement Community' },
    // Specialized
    { value: 'research-lab', label: '🎯 Research Laboratory' },
    { value: 'data-center', label: '🎯 Data Center' },
    { value: 'veterinary-clinic', label: '🎯 Veterinary Clinic' },
    { value: 'funeral-home', label: '🎯 Funeral Home' },
    { value: 'fire-station', label: '🎯 Fire Station' },
    { value: 'police-station', label: '🎯 Police Station' },
    { value: 'post-office', label: '🎯 Post Office' },
    { value: 'bank', label: '🎯 Bank' },
    { value: 'cinema', label: '🎯 Cinema / Movie Theater' },
    { value: 'nightclub', label: '🎯 Nightclub' },
    { value: 'spa', label: '🎯 Spa / Wellness Center' },
    { value: 'greenhouse', label: '🎯 Greenhouse' },
    { value: 'observatory', label: '🎯 Observatory' },
    { value: 'aquarium', label: '🎯 Aquarium' },
    { value: 'zoo-building', label: '🎯 Zoo Building' }
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

          {/* Number of Levels Control */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Layers className="w-4 h-4 inline mr-1" />
              Number of Levels
            </label>
            <div className="flex items-center gap-3">
              {isLevelLocked ? (
                // Manual mode - show input
                <div className="flex-1 flex items-center gap-2">
                  <button
                    onClick={() => handleLevelCountChange(currentFloorCount - 1)}
                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                    disabled={currentFloorCount <= 1}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={currentFloorCount}
                    onChange={(e) => handleLevelCountChange(e.target.value)}
                    min="1"
                    max="10"
                    className="w-16 px-3 py-2 text-center border-2 border-green-500 rounded-xl font-semibold text-lg"
                  />
                  <button
                    onClick={() => handleLevelCountChange(currentFloorCount + 1)}
                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-bold transition-colors"
                    disabled={currentFloorCount >= 10}
                  >
                    +
                  </button>
                </div>
              ) : (
                // Auto mode - show detected value
                <div className="flex-1 px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                  <span className="text-green-700 font-semibold">
                    {autoDetectedLevelCount || '—'} floors
                  </span>
                  <span className="text-green-600 text-sm ml-2">(auto-detected)</span>
                </div>
              )}

              {/* Lock/Unlock Button */}
              <button
                onClick={handleLevelLockToggle}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${isLevelLocked
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
                  }`}
                title={isLevelLocked ? 'Unlock to auto-detect' : 'Lock to set manually'}
              >
                {isLevelLocked ? (
                  <><Lock className="w-4 h-4" /> Unlock</>
                ) : (
                  <><Unlock className="w-4 h-4" /> Lock</>
                )}
              </button>
            </div>

            {/* Floor Metrics Display */}
            {levelMetrics && siteMetrics && (
              <div className="mt-2 text-xs text-gray-500 flex gap-4">
                <span>
                  Footprint: ~{levelMetrics.actualFootprint?.toFixed(0) || '—'}m²
                </span>
                <span>
                  Coverage: {levelMetrics.siteCoveragePercent?.toFixed(0) || '—'}%
                </span>
                {levelMetrics.siteCoveragePercent > 60 && (
                  <span className="text-amber-600">⚠️ High coverage</span>
                )}
              </div>
            )}
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
                          {levelOptions.map(level => (
                            <option key={level} value={level}>{level}</option>
                          ))}
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
