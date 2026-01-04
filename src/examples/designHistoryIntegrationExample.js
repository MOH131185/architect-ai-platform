/* eslint-disable no-unused-vars, no-undef */
/**
 * DESIGN HISTORY INTEGRATION EXAMPLE
 *
 * This file shows exactly how to integrate the Design History Service
 * into ArchitectAIEnhanced.js for consistent 2D→3D generation
 *
 * Note: This is example code showing integration patterns.
 * Variables referenced here would exist in the actual component.
 */

import React, { useState, useEffect } from 'react';
import designHistoryService from '../services/designHistoryService.js';
import aiIntegrationService from '../services/aiIntegrationService.js';

// ============================================================================
// STEP 1: Add state variable to track current project
// ============================================================================

function ArchitectAIEnhanced() {
  // ... existing state variables ...

  // 🆕 ADD THIS: Track current project for design history
  const [currentProjectId, setCurrentProjectId] = useState(null);

  // ============================================================================
  // STEP 2: Check for previous project on component mount
  // ============================================================================

  useEffect(() => {
    // 🆕 ADD THIS: Check if there's a previous project to continue
    const latestProject = designHistoryService.getLatestDesignContext();

    if (latestProject) {
      console.log('🔄 Found previous project:', latestProject.projectId);
      console.log('   Location:', latestProject.location?.address);
      console.log('   Building:', latestProject.metadata?.buildingProgram);

      // Optionally prompt user: "Continue previous project?"
      // For now, just log it
    }
  }, []);

  // ============================================================================
  // STEP 3: Save context after GROUND FLOOR generation
  // ============================================================================

  const handleGenerateFloorPlan = async () => {
    try {
      setIsGenerating(true);
      setGenerationStatus('Generating ground floor plan...');

      // Your existing floor plan generation code
      const floorPlanResult = await aiIntegrationService.generateFloorPlan({
        location: locationData,
        buildingProgram: buildingProgram,
        floorArea: floorArea,
        buildingDNA: buildingDNA,
        // ... other parameters
      });

      // ✅ Store the result
      setFloorPlanImage(floorPlanResult.url);

      // 🆕 ADD THIS: Save design context for future consistency
      console.log('💾 Saving design context for consistency...');

      const projectId = designHistoryService.saveDesignContext({
        projectId: currentProjectId || undefined, // Use existing or generate new
        location: locationData,
        buildingDNA: buildingDNA,
        prompt: `${buildingProgram} in ${locationData.address}, ${architecturalStyle} style`,
        outputs: {
          groundFloorPlan: floorPlanResult.url,
          seed: floorPlanResult.seed
        },
        floorPlanUrl: floorPlanResult.url,
        seed: floorPlanResult.seed,
        buildingProgram: buildingProgram,
        floorArea: floorArea,
        floors: numberOfFloors,
        style: architecturalStyle
      });

      // Store project ID for future use
      setCurrentProjectId(projectId);

      console.log('✅ Design context saved:', projectId);
      setGenerationStatus('Ground floor complete! Context saved for consistency.');

    } catch (error) {
      console.error('Floor plan generation failed:', error);
      setGenerationStatus('Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ============================================================================
  // STEP 4: Retrieve context for UPPER FLOORS / ELEVATIONS
  // ============================================================================

  const handleGenerateUpperFloor = async (floorNumber) => {
    try {
      // 🆕 ADD THIS: Check if we have ground floor context
      if (!currentProjectId) {
        alert('⚠️  Please generate ground floor first for consistency.');
        return;
      }

      setIsGenerating(true);
      setGenerationStatus(`Generating floor ${floorNumber}...`);

      // 🆕 ADD THIS: Retrieve ground floor context
      const previousContext = designHistoryService.getDesignContext(currentProjectId);

      if (!previousContext) {
        console.error('❌ No design history found for project:', currentProjectId);
        alert('⚠️  Design history not found. Starting fresh...');
      }

      // 🆕 ADD THIS: Generate continuation prompt
      const continuationPrompt = previousContext
        ? designHistoryService.generateContinuationPrompt(
            currentProjectId,
            `Generate floor ${floorNumber} with bedrooms and bathrooms, maintaining same architectural style`
          )
        : `Generate floor ${floorNumber} for ${buildingProgram}`;

      console.log('📝 Using continuation prompt with historical context');

      // Generate upper floor with same seed for consistency
      const upperFloorResult = await aiIntegrationService.generateFloorPlan({
        prompt: continuationPrompt,
        seed: previousContext?.seed, // ⚠️ CRITICAL: Use same seed!
        buildingDNA: previousContext?.buildingDNA || buildingDNA,
        location: previousContext?.location || locationData,
        // ... other parameters
      });

      setGenerationStatus(`Floor ${floorNumber} complete! Style maintained.`);

    } catch (error) {
      console.error('Upper floor generation failed:', error);
      setGenerationStatus('Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ============================================================================
  // STEP 5: Retrieve context for 3D VISUALIZATION
  // ============================================================================

  const handleGenerate3DView = async (viewType = 'exterior') => {
    try {
      setIsGenerating(true);
      setGenerationStatus(`Generating 3D ${viewType} view...`);

      // 🆕 ADD THIS: Retrieve design context
      const context = currentProjectId
        ? designHistoryService.getDesignContext(currentProjectId)
        : null;

      if (!context) {
        console.warn('⚠️  No design context found. Generating without history...');
      }

      // Build enhanced prompt with context
      const prompt3D = context
        ? `
Photorealistic 3D ${viewType} architectural rendering.

BUILDING SPECIFICATIONS:
- Type: ${context.metadata.buildingProgram}
- Location: ${context.location.address}
- Climate: ${context.location.climate?.type}
- Style: ${context.metadata.style}
- Floors: ${context.metadata.floors}
- Floor Area: ${context.metadata.floorArea} m²

MATERIALS & DESIGN:
- Exterior: ${context.buildingDNA.materials?.exterior?.primary}
- Roof: ${context.buildingDNA.roof?.material}
- Windows: ${context.buildingDNA.windows?.style}
- Color Palette: ${context.buildingDNA.materials?.colors?.primary}

Generate photorealistic ${viewType} view maintaining exact proportions and style from floor plan.
`
        : `Photorealistic 3D ${viewType} view of ${buildingProgram}`;

      // Generate 3D view with same seed
      const render3D = await aiIntegrationService.generateExteriorView({
        prompt: prompt3D,
        seed: context?.seed, // ⚠️ CRITICAL: Use same seed!
        controlImage: context?.floorPlanUrl, // Use floor plan as ControlNet reference
        // ... other parameters
      });

      set3DImage(render3D.url);
      setGenerationStatus('3D view complete! Style matches floor plan.');

    } catch (error) {
      console.error('3D generation failed:', error);
      setGenerationStatus('Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ============================================================================
  // STEP 6: Optional - Export/Import functionality
  // ============================================================================

  const handleExportProject = () => {
    if (!currentProjectId) {
      alert('No active project to export');
      return;
    }

    designHistoryService.exportHistory(currentProjectId);
    console.log('📥 Project exported');
  };

  const handleImportProject = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      await designHistoryService.importHistory(file);
      console.log('📤 Project imported');

      // Reload project list or UI
      const latestProject = designHistoryService.getLatestDesignContext();
      if (latestProject) {
        setCurrentProjectId(latestProject.projectId);
        console.log('🔄 Loaded imported project:', latestProject.projectId);
      }

    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import project');
    }
  };

  // ============================================================================
  // STEP 7: Optional - Browse project history UI
  // ============================================================================

  const ProjectHistoryBrowser = () => {
    const [projects, setProjects] = useState([]);

    useEffect(() => {
      const allProjects = designHistoryService.getAllHistory();
      setProjects(allProjects);
    }, []);

    const loadProject = (projectId) => {
      const context = designHistoryService.getDesignContext(projectId);
      if (context) {
        setCurrentProjectId(projectId);
        // Reload project data into UI
        setLocationData(context.location);
        setBuildingDNA(context.buildingDNA);
        setFloorPlanImage(context.floorPlanUrl);
        console.log('🔄 Loaded project:', projectId);
      }
    };

    return (
      <div className="project-history">
        <h3>Project History</h3>
        {projects.length === 0 ? (
          <p>No saved projects</p>
        ) : (
          <ul>
            {projects.map(project => (
              <li key={project.projectId}>
                <button onClick={() => loadProject(project.projectId)}>
                  <strong>{project.metadata.buildingProgram}</strong>
                  <br />
                  {project.location.address}
                  <br />
                  <small>{new Date(project.timestamp).toLocaleDateString()}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="architect-ai-enhanced">
      {/* Your existing UI */}

      {/* 🆕 ADD THIS: Show current project indicator */}
      {currentProjectId && (
        <div className="project-indicator">
          📋 Project: {currentProjectId}
          <button onClick={handleExportProject}>Export</button>
        </div>
      )}

      {/* Your existing workflow steps */}

      {/* 🆕 ADD THIS: Import button */}
      <input
        type="file"
        accept=".json"
        onChange={handleImportProject}
        style={{ display: 'none' }}
        id="import-project"
      />
      <label htmlFor="import-project">
        <button onClick={() => document.getElementById('import-project').click()}>
          Import Project
        </button>
      </label>

      {/* 🆕 OPTIONAL: Project history browser */}
      {/* <ProjectHistoryBrowser /> */}
    </div>
  );
}

// ============================================================================
// USAGE SUMMARY
// ============================================================================

/*

WORKFLOW:

1. User generates GROUND FLOOR:
   - Generate floor plan
   - Save context with designHistoryService.saveDesignContext()
   - Store projectId in state

2. User generates UPPER FLOOR:
   - Retrieve context with designHistoryService.getDesignContext()
   - Generate continuation prompt with previous context
   - Use SAME SEED for consistency
   - Generate with enhanced prompt

3. User generates 3D VIEW:
   - Retrieve context
   - Build 3D prompt with materials, style, location
   - Use SAME SEED and floor plan as ControlNet reference
   - Generate photorealistic view

4. CONSISTENCY ACHIEVED:
   - Same seed → Same style/proportions
   - Same materials → Same textures
   - Same DNA → Same architectural language
   - Context-aware prompts → Coherent design

*/

export default ArchitectAIEnhanced;
