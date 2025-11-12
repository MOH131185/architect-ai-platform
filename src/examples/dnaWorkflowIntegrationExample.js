/**
 * DNA Workflow Integration Example
 *
 * This file demonstrates how to integrate the Project DNA Pipeline
 * into your application workflow for consistent architectural design generation.
 *
 * Complete workflow:
 * 1. User inputs location and project specifications
 * 2. System initializes project and generates Design DNA
 * 3. System generates 2D floor plan and establishes DNA baseline
 * 4. System generates additional views (3D, elevations, sections) using DNA
 * 5. System validates each view for consistency
 * 6. User reviews final project with consistency report
 */

import dnaWorkflowOrchestrator from '../services/dnaWorkflowOrchestrator';

/**
 * ========================================
 * EXAMPLE 1: Complete Project Workflow
 * ========================================
 */
export async function completeProjectWorkflow() {
  console.log('Starting complete project workflow...\n');

  // ==========================================
  // STEP 1: Initialize Project
  // ==========================================
  const projectData = {
    locationData: {
      address: '123 Main St, San Francisco, CA',
      coordinates: { lat: 37.7749, lng: -122.4194 },
      climate: {
        type: 'Mediterranean',
        seasonal: {
          winter: { temp: 14, rainfall: 'high' },
          summer: { temp: 24, rainfall: 'low' }
        }
      }
    },
    projectContext: {
      buildingProgram: 'house',
      floorArea: 200,
      floors: 2,
      style: 'modern',
      materials: 'brick, glass, wood',
      entranceDirection: 'N'
    },
    portfolioFiles: [] // Optional: user's portfolio images
  };

  const initResult = await dnaWorkflowOrchestrator.initializeProject(projectData);

  if (!initResult.success) {
    console.error('Project initialization failed:', initResult.error);
    return;
  }

  const projectId = initResult.projectId;
  console.log(`✅ Project initialized: ${projectId}\n`);

  // ==========================================
  // STEP 2: Generate Floor Plan
  // ==========================================
  // This would be called by your AI image generation service
  // For example: replicateService.generateFloorPlan(...)

  // Simulate floor plan generation
  const floorPlanResult = {
    imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    prompt: 'Modern 2-story house floor plan, 200m², brick and glass, northern entrance'
  };

  // ==========================================
  // STEP 3: Establish DNA Baseline
  // ==========================================
  const baselineResult = await dnaWorkflowOrchestrator.establishDNABaseline(
    projectId,
    floorPlanResult.imageUrl,
    {
      prompt: floorPlanResult.prompt,
      model: 'FLUX.1-dev',
      seed: 12345
    }
  );

  if (!baselineResult.success) {
    console.error('DNA baseline establishment failed:', baselineResult.error);
    return;
  }

  console.log('✅ DNA baseline established\n');

  // ==========================================
  // STEP 4: Generate Additional Views
  // ==========================================
  const viewsToGenerate = [
    'exterior_3d',
    'elevation_north',
    'elevation_south',
    'section'
  ];

  for (const viewType of viewsToGenerate) {
    console.log(`\nGenerating ${viewType}...`);

    // 4a. Prepare generation parameters
    const prepareResult = await dnaWorkflowOrchestrator.generateConsistentView(
      projectId,
      viewType,
      null, // AI service (Replicate, Together AI, etc.)
      {
        userPrompt: `Professional architectural ${viewType} rendering`
      }
    );

    if (!prepareResult.success) {
      console.error(`Failed to prepare ${viewType}:`, prepareResult.error);
      continue;
    }

    // 4b. Call your AI service with the prepared parameters
    // Example:
    // const generatedImage = await aiService.generate({
    //   prompt: prepareResult.generationParams.enhancedPrompt,
    //   referenceImage: prepareResult.generationParams.referenceImage,
    //   ...prepareResult.generationParams.designDNA
    // });

    // Simulate generation
    const generatedImage = {
      url: `data:image/png;base64,simulated_${viewType}_image`
    };

    // 4c. Validate the generated view
    const validationResult = await dnaWorkflowOrchestrator.validateGeneratedView(
      projectId,
      viewType,
      generatedImage.url
    );

    if (!validationResult.success) {
      console.error(`Failed to validate ${viewType}:`, validationResult.error);
      continue;
    }

    console.log(`✅ ${viewType} validated: ${validationResult.consistency.status}`);
    console.log(`   Consistency: ${(validationResult.consistency.score * 100).toFixed(1)}%`);
    console.log(`   Recommendation: ${validationResult.recommendation.action}`);

    // Handle low consistency scores
    if (validationResult.consistency.score < 0.70) {
      console.warn(`⚠️  Low consistency detected for ${viewType}`);
      console.log(`   Recommendation: ${validationResult.recommendation.message}`);
      // Option: Regenerate view with stronger constraints
    }
  }

  // ==========================================
  // STEP 5: Get Project Summary
  // ==========================================
  const summary = dnaWorkflowOrchestrator.getProjectSummary(projectId);

  if (summary.success) {
    console.log('\n📊 PROJECT SUMMARY:');
    console.log(`   Project ID: ${summary.projectId}`);
    console.log(`   Completion: ${summary.summary.completionPercentage}%`);
    console.log(`   Average Consistency: ${summary.consistency.averagePercentage}`);
    console.log(`   Total Checks: ${summary.consistency.totalChecks}`);
    console.log(`   Views Generated: ${summary.consistency.viewsGenerated}`);
    console.log('\n   Score Distribution:');
    console.log(`     Excellent (≥85%): ${summary.consistency.scoreDistribution.excellent}`);
    console.log(`     Good (80-84%): ${summary.consistency.scoreDistribution.good}`);
    console.log(`     Acceptable (70-79%): ${summary.consistency.scoreDistribution.acceptable}`);
    console.log(`     Poor (<70%): ${summary.consistency.scoreDistribution.poor}`);
  }

  return {
    projectId,
    summary,
    message: 'Project workflow completed successfully'
  };
}

/**
 * ========================================
 * EXAMPLE 2: Integration with Existing ArchitectAIEnhanced.js
 * ========================================
 */
export const integrateWithArchitectAI = {
  /**
   * Add to your ArchitectAIEnhanced component state
   */
  stateAdditions: {
    projectId: null,
    dnaBaseline: null,
    consistencyScores: {},
    workflowOrchestrator: dnaWorkflowOrchestrator
  },

  /**
   * Call this after location and specifications are collected (Step 4)
   */
  initializeProjectWithDNA: async function(locationData, projectContext, portfolioFiles) {
    console.log('Initializing project with DNA pipeline...');

    const result = await dnaWorkflowOrchestrator.initializeProject({
      locationData,
      projectContext,
      portfolioFiles
    });

    if (result.success) {
      // Store project ID in component state
      this.setState({
        projectId: result.projectId,
        masterDNA: result.masterDNA
      });

      console.log('✅ DNA pipeline initialized');
      return result;
    } else {
      console.error('❌ DNA initialization failed:', result.error);
      return null;
    }
  },

  /**
   * Call this after first image generation (floor plan)
   */
  establishBaseline: async function(projectId, floorPlanImageUrl, generationMetadata) {
    console.log('Establishing DNA baseline...');

    const result = await dnaWorkflowOrchestrator.establishDNABaseline(
      projectId,
      floorPlanImageUrl,
      generationMetadata
    );

    if (result.success) {
      this.setState({
        dnaBaseline: result.baseline
      });

      console.log('✅ DNA baseline established');
      return result;
    } else {
      console.error('❌ Baseline establishment failed:', result.error);
      return null;
    }
  },

  /**
   * Call this before each subsequent image generation
   */
  prepareConsistentGeneration: async function(projectId, viewType, userPrompt = '') {
    console.log(`Preparing consistent generation for ${viewType}...`);

    const result = await dnaWorkflowOrchestrator.generateConsistentView(
      projectId,
      viewType,
      null, // Your AI service
      { userPrompt }
    );

    if (result.success) {
      // Use result.generationParams in your AI service call
      return result.generationParams;
    } else {
      console.error('❌ Generation preparation failed:', result.error);
      return null;
    }
  },

  /**
   * Call this after each image generation
   */
  validateGeneration: async function(projectId, viewType, generatedImageUrl) {
    console.log(`Validating ${viewType}...`);

    const result = await dnaWorkflowOrchestrator.validateGeneratedView(
      projectId,
      viewType,
      generatedImageUrl
    );

    if (result.success) {
      // Store consistency score
      this.setState(prevState => ({
        consistencyScores: {
          ...prevState.consistencyScores,
          [viewType]: result.consistency.score
        }
      }));

      // Show consistency notification to user
      this.showConsistencyNotification(
        viewType,
        result.consistency.score,
        result.recommendation
      );

      return result;
    } else {
      console.error('❌ Validation failed:', result.error);
      return null;
    }
  },

  /**
   * Display consistency notification to user
   */
  showConsistencyNotification: function(viewType, score, recommendation) {
    const percentage = (score * 100).toFixed(1);

    let color, icon;
    if (score >= 0.85) {
      color = 'green';
      icon = '✅';
    } else if (score >= 0.80) {
      color = 'blue';
      icon = '✅';
    } else if (score >= 0.70) {
      color = 'orange';
      icon = '⚠️';
    } else {
      color = 'red';
      icon = '❌';
    }

    console.log(`${icon} ${viewType}: ${percentage}% consistency`);
    console.log(`   ${recommendation.message}`);

    // In your React component, you could show a toast notification:
    // toast.info(`${icon} ${viewType}: ${percentage}% consistency`, {
    //   description: recommendation.message,
    //   duration: 5000
    // });
  }
};

/**
 * ========================================
 * EXAMPLE 3: Quick Integration for Testing
 * ========================================
 */
export async function quickTest() {
  console.log('Running quick DNA pipeline test...\n');

  // 1. Initialize
  const init = await dnaWorkflowOrchestrator.initializeProject({
    locationData: {
      address: 'Test Location',
      climate: { type: 'Temperate' }
    },
    projectContext: {
      buildingProgram: 'house',
      floorArea: 150,
      floors: 2
    }
  });

  if (!init.success) {
    console.error('Initialization failed');
    return;
  }

  const projectId = init.projectId;

  // 2. Establish baseline
  const baseline = await dnaWorkflowOrchestrator.establishDNABaseline(
    projectId,
    'data:image/png;base64,test',
    { prompt: 'Test floor plan' }
  );

  if (!baseline.success) {
    console.error('Baseline failed');
    return;
  }

  // 3. Generate and validate a view
  const prepare = await dnaWorkflowOrchestrator.generateConsistentView(
    projectId,
    'exterior_3d',
    null
  );

  if (!prepare.success) {
    console.error('Preparation failed');
    return;
  }

  const validate = await dnaWorkflowOrchestrator.validateGeneratedView(
    projectId,
    'exterior_3d',
    'data:image/png;base64,test_3d'
  );

  if (!validate.success) {
    console.error('Validation failed');
    return;
  }

  // 4. Get summary
  const summary = dnaWorkflowOrchestrator.getProjectSummary(projectId);

  console.log('\n✅ Quick test completed successfully!');
  console.log(`   Project ID: ${projectId}`);
  console.log(`   Completion: ${summary.summary?.completionPercentage}%`);

  return { projectId, summary };
}

/**
 * ========================================
 * USAGE IN REACT COMPONENT
 * ========================================
 */
export const ReactComponentExample = `
import React, { useState, useEffect } from 'react';
import dnaWorkflowOrchestrator from './services/dnaWorkflowOrchestrator';

function ArchitectAIWithDNA() {
  const [projectId, setProjectId] = useState(null);
  const [consistencyScores, setConsistencyScores] = useState({});

  // Initialize project
  const handleStartProject = async () => {
    const result = await dnaWorkflowOrchestrator.initializeProject({
      locationData: {...},
      projectContext: {...}
    });

    if (result.success) {
      setProjectId(result.projectId);
    }
  };

  // Generate floor plan and establish baseline
  const handleGenerateFloorPlan = async () => {
    // 1. Generate floor plan with your AI service
    const floorPlan = await myAIService.generateFloorPlan(...);

    // 2. Establish DNA baseline
    const baseline = await dnaWorkflowOrchestrator.establishDNABaseline(
      projectId,
      floorPlan.url,
      { prompt: floorPlan.prompt }
    );

    if (baseline.success) {
      console.log('✅ Baseline established');
    }
  };

  // Generate additional views
  const handleGenerateView = async (viewType) => {
    // 1. Prepare generation
    const params = await dnaWorkflowOrchestrator.generateConsistentView(
      projectId,
      viewType,
      myAIService
    );

    // 2. Generate with AI service using params
    const generated = await myAIService.generate({
      prompt: params.generationParams.enhancedPrompt,
      ...params.generationParams
    });

    // 3. Validate
    const validation = await dnaWorkflowOrchestrator.validateGeneratedView(
      projectId,
      viewType,
      generated.url
    );

    // 4. Update consistency scores
    setConsistencyScores(prev => ({
      ...prev,
      [viewType]: validation.consistency.score
    }));

    // 5. Show notification
    if (validation.consistency.score < 0.70) {
      alert('Low consistency detected. Consider regenerating.');
    }
  };

  return (
    <div>
      <button onClick={handleStartProject}>Start Project</button>
      <button onClick={handleGenerateFloorPlan}>Generate Floor Plan</button>
      <button onClick={() => handleGenerateView('exterior_3d')}>Generate 3D</button>

      {/* Display consistency scores */}
      <div>
        {Object.entries(consistencyScores).map(([view, score]) => (
          <div key={view}>
            {view}: {(score * 100).toFixed(1)}%
          </div>
        ))}
      </div>
    </div>
  );
}
`;

export default {
  completeProjectWorkflow,
  integrateWithArchitectAI,
  quickTest,
  ReactComponentExample
};
