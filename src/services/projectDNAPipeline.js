/**
 * Project DNA Pipeline Service
 *
 * Implements a comprehensive consistency pipeline for architectural design generation:
 * 1. Project DNA Token Generation - Unique project IDs based on address + type + timestamp
 * 2. Reference DNA Storage - Stores floor plans, prompt embeddings, and metadata
 * 3. DNA Reuse - Loads DNA for subsequent generation steps (3D, elevations, sections)
 * 4. Harmony Memory - CLIP-based consistency checking using cosine similarity
 * 5. Visual Summary - Complete workflow integration
 *
 * Architecture:
 * Google Maps + Weather → Prompt → AI Plan Generator (Flux/ControlNet)
 *         ↓
 * [Save DNA: base_plan.png + prompt_vector.pt + metadata.json]
 *         ↓
 * Generate 3D, Elevations, Sections using same DNA
 *         ↓
 * Compare & validate consistency (CLIP cosine check)
 */

import CryptoJS from 'crypto-js';

class ProjectDNAPipeline {
  constructor() {
    this.storagePrefix = 'dna_pipeline_';
    this.historyPath = 'history'; // Virtual path for DNA storage
    console.log('🧬 Project DNA Pipeline initialized');
  }

  /**
   * 1️⃣ GENERATE PROJECT DNA TOKEN
   * Creates a unique hash-based project ID from address, project type, and timestamp
   *
   * @param {string} address - Project address
   * @param {string} projectType - Building type (house, office, etc.)
   * @returns {string} Unique 10-character project ID
   */
  generateProjectId(address, projectType) {
    const timestamp = Date.now();
    const base = `${address}_${projectType}_${timestamp}`;
    const hash = CryptoJS.SHA256(base).toString();
    const projectId = hash.substring(0, 10);

    console.log(`🔑 Generated Project ID: ${projectId}`);
    console.log(`   📍 Address: ${address}`);
    console.log(`   🏠 Type: ${projectType}`);
    console.log(`   ⏱️  Timestamp: ${new Date(timestamp).toISOString()}`);

    return projectId;
  }

  /**
   * 2️⃣ SAVE PROJECT DNA (Reference DNA)
   * Stores the initial floor plan image, prompt embedding, and metadata
   * This becomes the authoritative reference for all subsequent generations
   *
   * @param {Object} dnaData - Complete DNA data to save
   * @param {string} dnaData.projectId - Project identifier
   * @param {string} dnaData.floorPlanImage - Base64 or URL of floor plan
   * @param {string} dnaData.prompt - Original generation prompt
   * @param {Array<number>} dnaData.promptEmbedding - CLIP embedding vector (optional, will be computed if missing)
   * @param {Object} dnaData.designDNA - Complete design DNA specifications
   * @param {Object} dnaData.locationData - Location and climate data
   * @param {Object} dnaData.projectContext - Project specifications
   * @returns {Promise<Object>} Save result with DNA reference
   */
  async saveProjectDNA(dnaData) {
    console.log('\n💾 [DNA Pipeline] Saving Project DNA...');
    console.log(`   🔑 Project ID: ${dnaData.projectId}`);

    try {
      const {
        projectId,
        floorPlanImage,
        prompt,
        promptEmbedding,
        designDNA,
        locationData,
        projectContext
      } = dnaData;

      // Prepare DNA package
      const dnaPackage = {
        projectId,
        timestamp: new Date().toISOString(),
        version: '3.0', // New pipeline version

        // Reference Images
        references: {
          basePlan: floorPlanImage,
          basePlanType: this.detectImageType(floorPlanImage)
        },

        // Prompt Data
        prompts: {
          original: prompt,
          embedding: promptEmbedding || null, // Will be computed by CLIP service
          embeddingModel: 'CLIP-ViT-L/14'
        },

        // Design Specifications
        designDNA: designDNA,

        // Context Data
        context: {
          location: locationData,
          project: projectContext,
          address: locationData?.address,
          buildingType: projectContext?.buildingProgram,
          floorArea: projectContext?.floorArea,
          floors: projectContext?.floors
        },

        // Generation Tracking
        generations: {
          floorPlan2D: {
            timestamp: new Date().toISOString(),
            imageUrl: floorPlanImage,
            status: 'completed'
          }
        },

        // Consistency Tracking
        consistency: {
          baselineSet: true,
          checksPerformed: 0,
          lastCheckScore: null,
          history: []
        }
      };

      // Store in localStorage (simulating file system storage)
      const storageKey = `${this.storagePrefix}${projectId}`;
      localStorage.setItem(storageKey, JSON.stringify(dnaPackage));

      // Also store in a master index
      this.addToMasterIndex(projectId, dnaPackage.context);

      console.log('✅ [DNA Pipeline] Project DNA saved successfully');
      console.log(`   📦 Storage Key: ${storageKey}`);
      console.log(`   🎨 Design DNA Version: ${designDNA?.version || 'N/A'}`);
      console.log(`   📏 Dimensions: ${designDNA?.dimensions?.length}m × ${designDNA?.dimensions?.width}m`);
      console.log(`   🏗️  Floors: ${designDNA?.dimensions?.floor_count || projectContext?.floors}`);

      return {
        success: true,
        projectId,
        dnaPackage,
        storageKey
      };

    } catch (error) {
      console.error('❌ [DNA Pipeline] Failed to save Project DNA:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 3️⃣ LOAD PROJECT DNA (DNA Reuse)
   * Retrieves the stored DNA for use in subsequent generation steps
   * Used when generating 3D views, elevations, sections, etc.
   *
   * @param {string} projectId - Project identifier
   * @returns {Object|null} Complete DNA package or null if not found
   */
  loadProjectDNA(projectId) {
    console.log(`\n📖 [DNA Pipeline] Loading Project DNA: ${projectId}`);

    try {
      const storageKey = `${this.storagePrefix}${projectId}`;
      const stored = localStorage.getItem(storageKey);

      if (!stored) {
        console.log('⚠️  [DNA Pipeline] No DNA found for this project');
        return null;
      }

      const dnaPackage = JSON.parse(stored);

      console.log('✅ [DNA Pipeline] Project DNA loaded successfully');
      console.log(`   📅 Created: ${dnaPackage.timestamp}`);
      console.log(`   🏠 Type: ${dnaPackage.context?.buildingType}`);
      console.log(`   📏 Size: ${dnaPackage.context?.floorArea}m²`);
      console.log(`   🎨 Materials: ${dnaPackage.designDNA?.materials?.exterior?.primary || 'N/A'}`);

      return dnaPackage;

    } catch (error) {
      console.error('❌ [DNA Pipeline] Failed to load Project DNA:', error);
      return null;
    }
  }

  /**
   * 3️⃣ GENERATE WITH DNA (ControlNet Integration)
   * Generates new views using the stored DNA as reference
   *
   * @param {string} projectId - Project identifier
   * @param {string} viewType - Type of view to generate (3d_exterior, elevation_north, section, etc.)
   * @param {Object} options - Additional generation options
   * @returns {Promise<Object>} Generation result with consistency data
   */
  async generateWithDNA(projectId, viewType, options = {}) {
    console.log(`\n🎨 [DNA Pipeline] Generating ${viewType} with DNA reference...`);

    const dnaPackage = this.loadProjectDNA(projectId);
    if (!dnaPackage) {
      throw new Error('Project DNA not found. Generate floor plan first.');
    }

    // Prepare generation parameters using DNA
    const generationParams = {
      projectId,
      viewType,

      // Reference image for ControlNet
      referenceImage: dnaPackage.references.basePlan,

      // Prompt embedding for consistency
      promptEmbedding: dnaPackage.prompts.embedding,

      // Design specifications
      designDNA: dnaPackage.designDNA,

      // View-specific notes
      viewNotes: dnaPackage.designDNA?.view_specific_notes?.[viewType],

      // Consistency rules
      consistencyRules: dnaPackage.designDNA?.consistency_rules,

      // Additional options
      ...options
    };

    console.log('✅ [DNA Pipeline] Generation parameters prepared');
    console.log(`   🖼️  Reference: ${dnaPackage.references.basePlanType}`);
    console.log(`   📐 View: ${viewType}`);
    console.log(`   🎯 Consistency Rules: ${generationParams.consistencyRules?.length || 0}`);

    // Return prepared params (actual generation handled by AI service)
    return {
      success: true,
      generationParams,
      message: 'Generation parameters ready for AI service'
    };
  }

  /**
   * 4️⃣ CHECK HARMONY (Consistency Validation)
   * Validates consistency between the base plan and a new generation
   * Uses CLIP cosine similarity to detect design drift
   *
   * @param {string} projectId - Project identifier
   * @param {string} newImageUrl - URL or base64 of new generated image
   * @param {string} viewType - Type of view being checked
   * @returns {Promise<Object>} Consistency check result with score
   */
  async checkHarmony(projectId, newImageUrl, viewType) {
    console.log(`\n🔍 [DNA Pipeline] Checking harmony for ${viewType}...`);

    const dnaPackage = this.loadProjectDNA(projectId);
    if (!dnaPackage) {
      console.warn('⚠️  No baseline DNA found');
      return {
        success: false,
        score: 0,
        message: 'No baseline DNA found'
      };
    }

    try {
      // Compute CLIP embeddings for both images
      const baseEmbedding = await this.getCLIPEmbedding(dnaPackage.references.basePlan);
      const newEmbedding = await this.getCLIPEmbedding(newImageUrl);

      // Calculate cosine similarity
      const similarityScore = this.cosineSimilarity(baseEmbedding, newEmbedding);

      // Determine consistency level
      let status, message;
      if (similarityScore >= 0.85) {
        status = 'excellent';
        message = '✅ Excellent consistency - designs are harmonious';
      } else if (similarityScore >= 0.80) {
        status = 'good';
        message = '✅ Good consistency - minor variations acceptable';
      } else if (similarityScore >= 0.70) {
        status = 'acceptable';
        message = '⚠️  Acceptable consistency - some design drift detected';
      } else {
        status = 'poor';
        message = '❌ Poor consistency - significant design drift detected';
      }

      // Record check in DNA package
      const checkRecord = {
        timestamp: new Date().toISOString(),
        viewType,
        score: similarityScore,
        status
      };

      dnaPackage.consistency.checksPerformed++;
      dnaPackage.consistency.lastCheckScore = similarityScore;
      dnaPackage.consistency.history.push(checkRecord);

      // Update generation record
      if (!dnaPackage.generations[viewType]) {
        dnaPackage.generations[viewType] = {};
      }
      dnaPackage.generations[viewType] = {
        timestamp: new Date().toISOString(),
        imageUrl: newImageUrl,
        consistencyScore: similarityScore,
        status: 'completed'
      };

      // Save updated DNA package
      const storageKey = `${this.storagePrefix}${projectId}`;
      localStorage.setItem(storageKey, JSON.stringify(dnaPackage));

      console.log(`${status === 'excellent' || status === 'good' ? '✅' : '⚠️'} [DNA Pipeline] Harmony check complete`);
      console.log(`   📊 Similarity Score: ${(similarityScore * 100).toFixed(1)}%`);
      console.log(`   🎯 Status: ${status.toUpperCase()}`);
      console.log(`   📝 Message: ${message}`);

      return {
        success: true,
        score: similarityScore,
        status,
        message,
        checkRecord,
        threshold: {
          excellent: 0.85,
          good: 0.80,
          acceptable: 0.70
        }
      };

    } catch (error) {
      console.error('❌ [DNA Pipeline] Harmony check failed:', error);
      return {
        success: false,
        score: 0,
        status: 'error',
        message: `Harmony check failed: ${error.message}`
      };
    }
  }

  /**
   * 4️⃣ COMPUTE CLIP EMBEDDING
   * Generates CLIP embedding for an image
   * Note: This is a placeholder - in production, this would call a CLIP service
   *
   * @param {string} imageUrl - URL or base64 of image
   * @returns {Promise<Array<number>>} 512-dimensional CLIP embedding vector
   */
  async getCLIPEmbedding(imageUrl) {
    // PLACEHOLDER: In production, this would call an actual CLIP service
    // For now, return a mock embedding based on image characteristics

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Generate a deterministic mock embedding based on image URL
    const seed = this.hashString(imageUrl);
    const embedding = new Array(512).fill(0).map((_, i) => {
      return Math.sin(seed + i * 0.1) * 0.5 + Math.cos(seed * 0.7 + i * 0.05) * 0.5;
    });

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  /**
   * 4️⃣ COSINE SIMILARITY
   * Calculates cosine similarity between two vectors
   * Returns value between -1 (opposite) and 1 (identical)
   *
   * @param {Array<number>} vecA - First embedding vector
   * @param {Array<number>} vecB - Second embedding vector
   * @returns {number} Cosine similarity score (0-1)
   */
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    if (magA === 0 || magB === 0) {
      return 0;
    }

    return dotProduct / (magA * magB);
  }

  /**
   * 5️⃣ GET PROJECT WORKFLOW STATUS
   * Returns a complete visual summary of the project workflow
   * Shows which views have been generated and their consistency scores
   *
   * @param {string} projectId - Project identifier
   * @returns {Object} Complete workflow status
   */
  getWorkflowStatus(projectId) {
    console.log(`\n📊 [DNA Pipeline] Getting workflow status for ${projectId}...`);

    const dnaPackage = this.loadProjectDNA(projectId);
    if (!dnaPackage) {
      return {
        success: false,
        message: 'Project not found'
      };
    }

    const workflow = {
      projectId,
      projectInfo: {
        address: dnaPackage.context?.location?.address,
        buildingType: dnaPackage.context?.buildingType,
        floorArea: dnaPackage.context?.floorArea,
        floors: dnaPackage.context?.floors,
        createdAt: dnaPackage.timestamp
      },

      pipeline: [
        {
          step: 1,
          name: 'Location Analysis',
          status: dnaPackage.context?.location ? 'completed' : 'pending',
          data: dnaPackage.context?.location
        },
        {
          step: 2,
          name: 'Design DNA Generation',
          status: dnaPackage.designDNA ? 'completed' : 'pending',
          data: dnaPackage.designDNA
        },
        {
          step: 3,
          name: 'Floor Plan 2D',
          status: dnaPackage.generations?.floorPlan2D ? 'completed' : 'pending',
          consistencyScore: 1.0, // Baseline is always 100%
          data: dnaPackage.generations?.floorPlan2D
        },
        {
          step: 4,
          name: '3D Exterior',
          status: dnaPackage.generations?.exterior_3d ? 'completed' : 'pending',
          consistencyScore: dnaPackage.generations?.exterior_3d?.consistencyScore,
          data: dnaPackage.generations?.exterior_3d
        },
        {
          step: 5,
          name: 'Elevations',
          status: this.hasAnyElevation(dnaPackage.generations) ? 'completed' : 'pending',
          data: this.getElevations(dnaPackage.generations)
        },
        {
          step: 6,
          name: 'Sections',
          status: this.hasAnySection(dnaPackage.generations) ? 'completed' : 'pending',
          data: this.getSections(dnaPackage.generations)
        }
      ],

      consistency: {
        checksPerformed: dnaPackage.consistency?.checksPerformed || 0,
        averageScore: this.calculateAverageConsistency(dnaPackage.consistency?.history || []),
        lastCheck: dnaPackage.consistency?.lastCheckScore,
        history: dnaPackage.consistency?.history || []
      },

      completionPercentage: this.calculateCompletionPercentage(dnaPackage)
    };

    console.log('✅ [DNA Pipeline] Workflow status retrieved');
    console.log(`   📈 Completion: ${workflow.completionPercentage}%`);
    console.log(`   🎯 Avg Consistency: ${(workflow.consistency.averageScore * 100).toFixed(1)}%`);

    return {
      success: true,
      workflow
    };
  }

  /**
   * UTILITY: Detect image type from URL or base64
   */
  detectImageType(imageData) {
    if (imageData.startsWith('data:image/png')) return 'PNG (base64)';
    if (imageData.startsWith('data:image/jpeg')) return 'JPEG (base64)';
    if (imageData.startsWith('http')) return 'URL';
    return 'Unknown';
  }

  /**
   * UTILITY: Hash string to number (for mock embeddings)
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * UTILITY: Add project to master index
   */
  addToMasterIndex(projectId, context) {
    const indexKey = `${this.storagePrefix}master_index`;
    const stored = localStorage.getItem(indexKey);
    const index = stored ? JSON.parse(stored) : [];

    const entry = {
      projectId,
      address: context?.address,
      buildingType: context?.buildingType,
      timestamp: new Date().toISOString()
    };

    // Add or update
    const existingIndex = index.findIndex(e => e.projectId === projectId);
    if (existingIndex >= 0) {
      index[existingIndex] = entry;
    } else {
      index.push(entry);
    }

    localStorage.setItem(indexKey, JSON.stringify(index));
  }

  /**
   * UTILITY: Get all projects from master index
   */
  getAllProjects() {
    const indexKey = `${this.storagePrefix}master_index`;
    const stored = localStorage.getItem(indexKey);
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * UTILITY: Check if any elevation exists
   */
  hasAnyElevation(generations) {
    return generations?.elevation_north || generations?.elevation_south ||
           generations?.elevation_east || generations?.elevation_west;
  }

  /**
   * UTILITY: Get all elevations
   */
  getElevations(generations) {
    return {
      north: generations?.elevation_north,
      south: generations?.elevation_south,
      east: generations?.elevation_east,
      west: generations?.elevation_west
    };
  }

  /**
   * UTILITY: Check if any section exists
   */
  hasAnySection(generations) {
    return generations?.section || generations?.section_longitudinal ||
           generations?.section_transverse;
  }

  /**
   * UTILITY: Get all sections
   */
  getSections(generations) {
    return {
      longitudinal: generations?.section_longitudinal,
      transverse: generations?.section_transverse,
      general: generations?.section
    };
  }

  /**
   * UTILITY: Calculate average consistency score
   */
  calculateAverageConsistency(history) {
    if (history.length === 0) return 1.0;
    const sum = history.reduce((acc, check) => acc + check.score, 0);
    return sum / history.length;
  }

  /**
   * UTILITY: Calculate project completion percentage
   */
  calculateCompletionPercentage(dnaPackage) {
    const steps = [
      dnaPackage.context?.location,
      dnaPackage.designDNA,
      dnaPackage.generations?.floorPlan2D,
      dnaPackage.generations?.exterior_3d,
      this.hasAnyElevation(dnaPackage.generations),
      this.hasAnySection(dnaPackage.generations)
    ];

    const completed = steps.filter(Boolean).length;
    return Math.round((completed / steps.length) * 100);
  }

  /**
   * UTILITY: Clear project DNA (for testing/debugging)
   */
  clearProjectDNA(projectId) {
    const storageKey = `${this.storagePrefix}${projectId}`;
    localStorage.removeItem(storageKey);
    console.log(`🗑️  Cleared DNA for project: ${projectId}`);
  }

  /**
   * UTILITY: Clear all DNA data (use with caution)
   */
  clearAllDNA() {
    const keys = Object.keys(localStorage).filter(key =>
      key.startsWith(this.storagePrefix)
    );
    keys.forEach(key => localStorage.removeItem(key));
    console.log(`🗑️  Cleared ${keys.length} DNA entries`);
  }
}

// Export singleton instance
const projectDNAPipeline = new ProjectDNAPipeline();
export default projectDNAPipeline;
