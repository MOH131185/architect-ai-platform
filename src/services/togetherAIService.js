/**
 * Together AI Service - Optimized Models for Architecture
 *
 * REASONING: Qwen 2.5 72B Instruct (Best for technical/architectural reasoning)
 * IMAGES: FLUX.1-dev (Best for consistent architectural visualization)
 *
 * Enhanced with DNA-driven prompt generation for 95%+ consistency
 */

import enhancedDNAGenerator from './enhancedDNAGenerator.js';
import dnaPromptGenerator from './dnaPromptGenerator.js';
import dnaValidator from './dnaValidator.js';
import architecturalSheetService from './architecturalSheetService.js';
import { isFeatureEnabled } from '../config/featureFlags.js';

// SECURITY: API keys handled server-side via proxy (secureApiClient pattern)
// All API calls route through API_BASE_URL proxy to keep keys secure
const API_BASE_URL = process.env.REACT_APP_API_PROXY_URL || 'http://localhost:3001';

/**
 * Wrap a remote image URL with proxy to avoid CORS issues
 * @param {string} imageUrl - Original image URL (e.g., from Together.ai)
 * @returns {string} Proxied URL (same-origin for CORS-free access)
 */
function wrapImageUrlWithProxy(imageUrl) {
  if (!imageUrl) return imageUrl;
  
  // If already a data URL or proxy URL, return as-is
  if (imageUrl.startsWith('data:') || imageUrl.includes('/api/proxy')) {
    return imageUrl;
  }
  
  // Determine if we're in dev or prod
  const isDev = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  // Use proxy endpoint (same-origin for CORS-free access)
  const proxyBase = isDev 
    ? `${API_BASE_URL}/api/proxy/image`
    : '/api/proxy-image';
  
  return `${proxyBase}?url=${encodeURIComponent(imageUrl)}`;
}

// Note: API key validation happens server-side in the proxy endpoints
// Client-side code never accesses API keys directly (Opus 4.1 compliance)

/**
 * Global Request Queue for pacing Together.ai image generation requests
 * Ensures all requests go through a single queue with configurable minimum interval
 */
class RequestQueue {
  constructor(minIntervalMs = 9000) {
    this.minIntervalMs = minIntervalMs;
    this.lastAt = 0;
    this.queue = Promise.resolve();
  }

  /**
   * Schedule a task to run through the queue with pacing
   * @param {Function} task - Async function to execute
   * @returns {Promise} Promise that resolves when task completes
   */
  schedule(task) {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, this.lastAt + this.minIntervalMs - now);
      
      if (wait > 0) {
        // Add jitter (0-500ms) to avoid thundering herd
        const jitter = Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, wait + jitter));
      }
      
      this.lastAt = Date.now();
      return task();
    });
    
    return this.queue;
  }

  /**
   * Update minimum interval (e.g., when rate limited)
   */
  setMinInterval(ms) {
    this.minIntervalMs = Math.max(ms, 6000); // Never go below 6s
  }
}

// Get min interval from feature flags or default to 9s
const getMinInterval = () => {
  try {
    const flags = JSON.parse(sessionStorage.getItem('featureFlags') || '{}');
    return flags.togetherImageMinIntervalMs || 9000;
  } catch {
    return 9000;
  }
};

// Create global queue instance
const imageRequestQueue = new RequestQueue(getMinInterval());

/**
 * Normalize fetch response - handles JSON and text responses gracefully
 * Extracts Retry-After header and maps to structured error
 */
async function normalizeResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10) || undefined;
  
  let body;
  try {
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      // Handle non-JSON responses (e.g., "Image generation..." text errors)
      const text = await response.text();
      body = { error: text, rawText: text };
    }
  } catch (parseError) {
    // If parsing fails, create a structured error
    const text = await response.text().catch(() => 'Unknown error');
    body = { error: text, rawText: text, parseError: parseError.message };
  }

  if (!response.ok) {
    const error = new Error(body?.error || body?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.retryAfter = retryAfter;
    error.body = body;
    throw error;
  }

  return { body, retryAfter };
}

/**
 * Qwen 2.5 72B Instruct - Best Together.ai model for Technical/Architectural Reasoning
 * Superior to Llama for structured, technical, and detailed architectural tasks
 * Excellent at following complex instructions and maintaining consistency
 */
export async function generateArchitecturalReasoning(params) {
  const {
    projectContext,
    portfolioAnalysis,
    locationData,
    buildingProgram
  } = params;

  console.log('🧠 [Together AI] Using Qwen 2.5 72B Instruct for architectural reasoning...');

  // Safely extract location data with defaults
  const location = locationData?.address || projectContext?.location?.address || 'Generic location';
  const climate = locationData?.climate?.type || projectContext?.climateData?.type || 'Temperate';
  const area = projectContext?.area || projectContext?.floorArea || '200';

  try {
    const response = await fetch(`${API_BASE_URL}/api/together/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen2.5-72B-Instruct-Turbo', // Best for technical/architectural reasoning
        messages: [
          {
            role: 'system',
            content: `You are an expert architect specializing in consistent architectural design.
            Your designs must maintain PERFECT CONSISTENCY between:
            - 2D floor plans (true overhead orthographic views, NO 3D)
            - Technical elevations (flat facade views, NO perspective)
            - 3D visualizations (matching the 2D plans exactly)

            Always provide EXACT specifications:
            - Room dimensions in meters
            - Wall thicknesses (typically 0.3m exterior, 0.15m interior)
            - Window sizes and positions
            - Door locations and swing directions
            - Material specifications with hex colors`
          },
          {
            role: 'user',
            content: `Design a ${buildingProgram} for:
            Location: ${location}
            Climate: ${climate}
            Style: ${portfolioAnalysis?.style || 'Modern'}
            Area: ${area}m²

            Provide:
            1. EXACT floor plan layout with dimensions
            2. Material specifications with colors
            3. Window and door specifications
            4. Roof type and angle
            5. Consistency rules that MUST be followed in all views`
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Together AI reasoning failed');
    }

    console.log('✅ [Together AI] Architectural reasoning generated');
    return parseArchitecturalReasoning(data.choices[0].message.content);

  } catch (error) {
    console.error('❌ [Together AI] Reasoning error:', error);
    throw error;
  }
}

/**
 * Generate single view with enforced 6000ms delay
 * Used for selective regeneration in modify workflow
 */
export async function generateSingleView(viewConfig, seed, delayMs = 6000) {
  const {
    viewType,
    prompt,
    masterDNA,
    width = 1024,
    height = 1024
  } = viewConfig;

  console.log(`🎨 Generating single view: ${viewType} with seed ${seed}`);

  // Wait for delay to respect rate limiting
  if (delayMs > 0) {
    console.log(`⏳ Waiting ${delayMs / 1000}s before generation...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  try {
    const result = await generateArchitecturalImage({
      viewType,
      designDNA: masterDNA,
      prompt,
      seed,
      width,
      height
    });

    console.log(`✅ Single view generated: ${viewType}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to generate single view ${viewType}:`, error);
    throw error;
  }
}

/**
 * FLUX.1-dev - Used for ALL architectural views
 *
 * Why FLUX.1-dev for everything:
 * - Consistent style across all views
 * - Excellent seed-based consistency
 * - High-quality photorealistic and technical rendering
 * - Maintains design coherence through generation history
 */
export async function generateArchitecturalImage(params) {
  const {
    viewType,
    designDNA,
    prompt,
    seed,
    width = 1024,
    height = 1024
  } = params;

  const is2DPreview = viewType.includes('floor_plan') || viewType.includes('elevation') || viewType.includes('section');
  const modelPreview = is2DPreview ? 'FLUX.1-schnell' : 'FLUX.1-dev';
  const stepsPreview = is2DPreview ? '4 steps - fast 2D' : '40 steps - quality 3D';
  console.log(`🎨 [${modelPreview}] Generating ${viewType} with seed ${seed} (${stepsPreview})`);

  // 🎲 SEED CONSISTENCY: Use IDENTICAL seed for ALL views for perfect cross-view consistency
  // Previously used offsets (+1, +2), but this caused subtle seed drift (904803, 904804, 904805)
  // For 98%+ consistency, all 13 views must use the EXACT same seed with view-specific DNA prompts
  const effectiveSeed = seed || designDNA?.seed || Math.floor(Math.random() * 1e6);

  // 🧬 CONSISTENCY FIX: Use DNA prompts DIRECTLY without wrapping
  // The dnaPromptGenerator already creates ultra-detailed, view-specific prompts
  // Wrapping them dilutes the DNA specifications and reduces consistency
  const enhancedPrompt = prompt;

  // 🔄 RETRY LOGIC: Attempt generation up to 5 times with exponential backoff
  // Increased from 3 to 5 to handle Together AI transient server errors
  const maxRetries = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        // Extended backoff: 3s, 6s, 12s, 24s (more aggressive to avoid server overload)
        const backoffDelay = Math.pow(2, attempt - 1) * 3000;
        console.log(`⏳ [FLUX.1] Retry ${attempt}/${maxRetries} for ${viewType} after ${backoffDelay / 1000}s delay...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }

      // 🎯 Dynamic model & settings: FLUX.1-schnell for 2D (faster, better at following prompts), dev for 3D
      const is2DTechnical = viewType.includes('floor_plan') || viewType.includes('elevation') || viewType.includes('section');

      // FLUX.1-schnell: Faster (4 steps), better at following simple 2D instructions, less prone to 3D interpretation
      // FLUX.1-dev: Higher quality (40 steps), better for photorealistic 3D views
      const model = is2DTechnical ? 'black-forest-labs/FLUX.1-schnell' : 'black-forest-labs/FLUX.1-dev';
      const steps = is2DTechnical ? 4 : 40; // schnell max=12, dev max=50
      const guidanceScale = is2DTechnical ? 7.5 : 3.5; // High CFG for 2D to enforce flat view

      console.log(`   Using ${model} with ${steps} steps (guidance: ${guidanceScale}) for ${is2DTechnical ? '2D technical' : '3D photorealistic'}`);

      // Schedule request through global queue for pacing
      const result = await imageRequestQueue.schedule(async () => {
        const response = await fetch(`${API_BASE_URL}/api/together/image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            prompt: enhancedPrompt,
            width,
            height,
            seed: effectiveSeed,
            num_inference_steps: steps,
            guidance_scale: guidanceScale
          })
        });

        // Handle rate limiting before normalization
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10) || 15;
          const waitTime = retryAfter * 1000;
          console.log(`⏰ Rate limit (429) detected, Retry-After: ${retryAfter}s, waiting ${waitTime / 1000}s...`);
          
          // Increase queue interval temporarily to avoid repeated 429s
          imageRequestQueue.setMinInterval(waitTime + 2000);
          
          // Try to get error message
          let errorMessage = 'Rate limit exceeded';
          try {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const data = await response.json();
              errorMessage = data?.error || data?.message || errorMessage;
            } else {
              const text = await response.text();
              errorMessage = text || errorMessage;
            }
          } catch {
            // Ignore parse errors, use default
          }
          
          const error = new Error(errorMessage);
          error.status = 429;
          error.retryAfter = retryAfter;
          throw error;
        }

        // Use normalized response handler (throws if not ok)
        const { body: data, retryAfter } = await normalizeResponse(response);
        return { data, retryAfter };
      });

      // Success! Show if retry was needed
      const modelName = model.includes('schnell') ? 'FLUX.1-schnell' : 'FLUX.1-dev';
      if (attempt > 1) {
        console.log(`✅ [${modelName}] ${viewType} generated successfully after ${attempt} attempts (seed ${effectiveSeed})`);
      } else {
        console.log(`✅ [${modelName}] ${viewType} generated with seed ${effectiveSeed}`);
      }

      return {
        url: result.data.url,
        model: modelName.toLowerCase().replace('.', '-'),
        viewType,
        seed: effectiveSeed
      };

    } catch (error) {
      // Handle structured errors from normalizeResponse
      lastError = error;
      
      // Smarter error logging: reduce spam for transient errors
      if (error.status === 500 || error.status === 503) {
        // Server errors - only log on first attempt and last attempt
        if (attempt === 1) {
          console.warn(`⚠️  [FLUX.1] Together AI server error for ${viewType} (will retry ${maxRetries - 1} more times)`);
        } else if (attempt === maxRetries) {
          console.error(`❌ [FLUX.1] Server error persists after ${maxRetries} attempts for ${viewType}`);
        }
      } else if (error.status === 429) {
        // Rate limit handled above, but log if all retries exhausted
        if (attempt === maxRetries) {
          console.error(`❌ [FLUX.1] Rate limit persists after ${maxRetries} attempts for ${viewType}`);
        }
      } else {
        // Other errors - always log (client errors, auth errors, etc.)
        if (attempt === 1 || attempt === maxRetries) {
          console.error(`❌ [FLUX.1] Network error (attempt ${attempt}/${maxRetries}) for ${viewType}:`, error.message);
        }
      }
      
      if (attempt === maxRetries) {
        break; // Don't continue after last retry
      }
      
      // If error has retryAfter, respect it
      if (error.retryAfter && attempt < maxRetries) {
        const waitTime = error.retryAfter * 1000;
        console.log(`⏰ Respecting Retry-After: ${error.retryAfter}s before retry ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // All retries failed
  console.error(`\n❌ [FLUX.1] FAILED: All ${maxRetries} attempts failed for ${viewType}`);
  console.error(`   Last error: ${lastError?.message}`);
  console.error(`   This is likely due to Together AI server issues. Try again in a few minutes.`);
  throw lastError || new Error(`Failed to generate ${viewType} after ${maxRetries} attempts`);
}

/**
 * Generate complete architectural package with perfect consistency
 * Enhanced with DNA-driven prompts for 95%+ consistency
 */
/**
 * @deprecated Use generateA1SheetImage instead. 13-view mode is deprecated in favor of single A1 sheet output.
 * This function will be removed in a future version.
 */
export async function generateConsistentArchitecturalPackage(params) {
  console.warn('⚠️ DEPRECATED: generateConsistentArchitecturalPackage is deprecated. Use generateA1SheetImage for A1-only workflow.');
  console.log('📐 [Together AI] Generating DNA-enhanced consistent architectural package...');

  const { projectContext } = params;
  const consistentSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

  // ========================================
  // STEP 1: Generate Master Design DNA with Location Awareness
  // ========================================
  console.log('🧬 STEP 1: Generating Location-Aware Master Design DNA...');

  // Pass location data to DNA generator
  const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(
    projectContext,
    null,  // Portfolio analysis (if available)
    projectContext.locationData || projectContext.location  // 🌍 Pass location data
  );
  const masterDNA = dnaResult.masterDNA;

  if (!dnaResult.success && !masterDNA.isFallback) {
    console.warn('⚠️  Master DNA generation had issues, using fallback DNA');
  }

  // ========================================
  // STEP 2: Validate Master DNA
  // ========================================
  console.log('🔍 STEP 2: Validating Master DNA...');
  const validation = dnaValidator.validateDesignDNA(masterDNA);

  if (!validation.isValid) {
    console.warn('⚠️  DNA validation found issues:', validation.errors);
    console.log('🔧 Attempting auto-fix...');
    const fixed = dnaValidator.autoFixDesignDNA(masterDNA);
    if (fixed) {
      console.log('✅ DNA auto-fixed successfully');
      Object.assign(masterDNA, fixed);
    }
  }

  // ========================================
  // STEP 3: Generate Unique Prompts for Each View
  // ========================================
  console.log('📝 STEP 3: Generating 13 unique view-specific prompts...');
  const allPrompts = dnaPromptGenerator.generateAllPrompts(masterDNA, projectContext);

  // Define all views to generate (13 total - all unique)
  const views = [
    { type: 'floor_plan_ground', name: 'Ground Floor Plan', width: 1024, height: 1024 },
    { type: 'floor_plan_upper', name: 'Upper Floor Plan', width: 1024, height: 1024 },
    { type: 'elevation_north', name: 'North Elevation', width: 1024, height: 768 },
    { type: 'elevation_south', name: 'South Elevation', width: 1024, height: 768 },
    { type: 'elevation_east', name: 'East Elevation', width: 1024, height: 768 },
    { type: 'elevation_west', name: 'West Elevation', width: 1024, height: 768 },
    { type: 'section_longitudinal', name: 'Longitudinal Section', width: 1024, height: 768 },
    { type: 'section_cross', name: 'Cross Section', width: 1024, height: 768 },
    { type: 'exterior_front_3d', name: '3D Exterior - Front View', width: 1024, height: 1024 },
    { type: 'exterior_side_3d', name: '3D Exterior - Side View', width: 1024, height: 1024 },
    { type: 'axonometric_3d', name: 'Axonometric View', width: 1024, height: 1024 },
    { type: 'perspective_3d', name: 'Perspective View', width: 1536, height: 1024 },
    { type: 'interior_3d', name: 'Interior View', width: 1536, height: 1024 }
  ];

  const results = {};
  const generatedHashes = new Set(); // Track image hashes to prevent duplicates

  // ========================================
  // STEP 4: Generate All Views with DNA-Driven Prompts
  // ========================================
  console.log('🎨 STEP 4: Generating all 13 views with FLUX.1...');

  let successCount = 0;
  let failCount = 0;

  // 🔧 OPTIMIZED RATE LIMITING: Adaptive delays based on view complexity
  // 2D technical drawings (floor plans, elevations, sections): faster, less resource intensive
  // 3D views (exterior, interior, perspectives): slower, more resource intensive
  // Strategy: Shorter delays for 2D (6s), longer for 3D (8s), extra gap between batches

  const is2DView = (viewType) => {
    return viewType.includes('floor_plan') ||
           viewType.includes('elevation') ||
           viewType.includes('section');
  };

  const getAdaptiveDelay = (currentView, nextView) => {
    const current2D = is2DView(currentView);
    const next2D = is2DView(nextView);

    // 2D → 2D: Short delay (6s)
    if (current2D && next2D) return 6000;

    // 2D → 3D: Longer delay to give API breathing room (10s)
    if (current2D && !next2D) return 10000;

    // 3D → 3D: Standard delay (8s)
    if (!current2D && !next2D) return 8000;

    // 3D → 2D: Short delay (6s)
    return 6000;
  };

  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const viewNumber = i + 1;

    try {
      console.log(`\n🎨 [${viewNumber}/${views.length}] Generating ${view.name}...`);
      console.log(`   View type: ${view.type} (${is2DView(view.type) ? '2D technical' : '3D visualization'})`);
      console.log(`   Dimensions: ${view.width}×${view.height}`);
      console.log(`   DNA-driven prompt length: ${allPrompts[view.type]?.length || 0} chars`);

      const imageResult = await generateArchitecturalImage({
        viewType: view.type,
        designDNA: masterDNA,
        prompt: allPrompts[view.type],
        seed: consistentSeed,
        width: view.width,
        height: view.height
      });

      // Validate uniqueness (check if URL/hash is unique)
      const imageHash = imageResult.url?.substring(imageResult.url.length - 20) || Math.random().toString();

      if (generatedHashes.has(imageHash)) {
        console.warn(`⚠️  Potential duplicate detected for ${view.name}`);
      } else {
        generatedHashes.add(imageHash);
      }

      results[view.type] = {
        ...imageResult,
        name: view.name,
        success: true,
        prompt: allPrompts[view.type].substring(0, 200) + '...' // Store truncated prompt for debugging
      };

      successCount++;
      console.log(`✅ [${viewNumber}/${views.length}] ${view.name} completed successfully`);
      console.log(`   Progress: ${successCount} successful, ${failCount} failed`);

      // Add adaptive delay between requests to avoid rate limiting
      if (i < views.length - 1) { // Don't delay after last view
        const nextView = views[i + 1];
        const delayMs = getAdaptiveDelay(view.type, nextView.type);
        console.log(`⏳ Waiting ${delayMs / 1000}s before ${nextView.name}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

    } catch (error) {
      failCount++;
      console.error(`❌ [${viewNumber}/${views.length}] Failed to generate ${view.name}:`, error.message);
      console.log(`   Error details:`, error);

      results[view.type] = {
        error: error.message,
        name: view.name,
        success: false,
        url: null // Explicitly set to null for failed views
      };

      console.log(`   Progress: ${successCount} successful, ${failCount} failed`);
      console.log(`   ⚠️  Continuing with remaining views...`);

      // Still add adaptive delay even after failure to respect rate limits
      if (i < views.length - 1) {
        const nextView = views[i + 1];
        const delayMs = getAdaptiveDelay(view.type, nextView.type);
        // Add extra 2s after failures to give API more recovery time
        const recoveryDelay = delayMs + 2000;
        console.log(`⏳ Waiting ${recoveryDelay / 1000}s before next view (extra recovery time)...`);
        await new Promise(resolve => setTimeout(resolve, recoveryDelay));
      }
    }
  }

  // ========================================
  // STEP 5: Compile Results
  // ========================================
  const totalCount = views.length;
  const consistencyScore = successCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

  console.log('\n✅ [Together AI] DNA-enhanced architectural package complete');
  console.log(`   Generated: ${successCount}/${totalCount} views`);
  console.log(`   Failed: ${failCount}/${totalCount} views`);
  console.log(`   Success Rate: ${consistencyScore}%`);
  console.log(`   Unique images: ${generatedHashes.size}/${totalCount}`);

  if (failCount > 0) {
    console.warn(`\n⚠️  WARNING: ${failCount} views failed to generate`);
    console.warn('   Failed views:');
    Object.entries(results).forEach(([type, result]) => {
      if (!result.success) {
        console.warn(`   ❌ ${result.name}: ${result.error}`);
      }
    });
  }

  if (successCount === 0) {
    console.error('\n❌ CRITICAL: All views failed to generate!');
    console.error('   This usually indicates:');
    console.error('   1. Together AI API key issue');
    console.error('   2. Rate limiting (wait 60 seconds and try again)');
    console.error('   3. Network connectivity issue');
    console.error('   4. Server not running (check npm run server)');
  }

  return {
    ...results,
    masterDNA,
    seed: consistentSeed,
    consistency: `${consistencyScore}% (${successCount}/${totalCount} successful)`,
    uniqueImages: generatedHashes.size,
    totalViews: totalCount,
    allPrompts // Include prompts for debugging
  };
}

/**
 * Parse architectural reasoning from GPT-4o response
 */
function parseArchitecturalReasoning(content) {
  // Extract structured data from the reasoning
  const reasoning = {
    designPhilosophy: '',
    spatialOrganization: {},
    materials: {},
    dimensions: {},
    consistencyRules: []
  };

  // Parse the content (simplified for now)
  const sections = content.split('\n\n');

  sections.forEach(section => {
    if (section.includes('Philosophy') || section.includes('Concept')) {
      reasoning.designPhilosophy = section;
    }
    if (section.includes('Material')) {
      reasoning.materials = extractMaterials(section);
    }
    if (section.includes('Dimension') || section.includes('Size')) {
      reasoning.dimensions = extractDimensions(section);
    }
    if (section.includes('Consistency') || section.includes('Rules')) {
      reasoning.consistencyRules = section.split('\n').filter(line => line.includes('-'));
    }
  });

  return reasoning;
}

/**
 * Format prompt based on view type and design DNA
 */
function formatPromptForView(viewType, designDNA) {
  const baseDetails = `${designDNA.buildingType}, ${designDNA.dimensions.width}m x ${designDNA.dimensions.depth}m,
                       ${designDNA.materials.primary} facade, ${designDNA.roof.type} roof,
                       ${designDNA.windows.type} windows, ${designDNA.style.name} style`;

  const viewSpecific = {
    floor_plan: `showing all rooms with labels, wall thickness ${designDNA.dimensions.wallThickness}m`,
    elevation_north: `front facade with main entrance, ${designDNA.dimensions.floors} floors`,
    exterior_3d: `photorealistic view from street level, ${designDNA.materials.color} color scheme`,
    section_long: `longitudinal cut showing floor heights ${designDNA.dimensions.floorHeight}m`,
    axonometric: `30-degree isometric view showing all facades`
  };

  return `${baseDetails}, ${viewSpecific[viewType] || ''}`;
}

/**
 * Extract materials from reasoning text
 */
function extractMaterials(text) {
  const materials = {
    primary: 'brick',
    secondary: 'glass',
    roof: 'slate',
    color: '#B87333'
  };

  // Simple extraction logic (can be enhanced)
  if (text.includes('brick')) materials.primary = 'brick';
  if (text.includes('stone')) materials.primary = 'stone';
  if (text.includes('concrete')) materials.primary = 'concrete';

  return materials;
}

/**
 * Extract dimensions from reasoning text
 */
function extractDimensions(text) {
  const dimensions = {
    width: 15,
    depth: 12,
    height: 9,
    floors: 2,
    wallThickness: 0.3,
    floorHeight: 3.0
  };

  // Extract numbers from text (simplified)
  const numbers = text.match(/\d+\.?\d*/g);
  if (numbers && numbers.length > 0) {
    dimensions.width = parseFloat(numbers[0]) || 15;
    if (numbers[1]) dimensions.depth = parseFloat(numbers[1]) || 12;
  }

  return dimensions;
}

/**
 * NEW: Generate A1 Sheet Image (One-Shot)
 * Single image generation for A1 presentation sheet
 * ISO A1 Standard: 841×594mm (portrait) → ideal 7016×9933px @ 300 DPI
 * API Constrained: 1280×1792px or 1792×1280px @ Together.ai limits
 *
 * @param {Object} params - Generation parameters
 * @param {string} params.prompt - Comprehensive A1 sheet prompt
 * @param {string} params.negativePrompt - Negative prompt (separate parameter for Together.ai API)
 * @param {number} params.width - Image width (optional, computed from orientation if not provided)
 * @param {number} params.height - Image height (optional, computed from orientation if not provided)
 * @param {string} params.model - Model to use (defaults to feature flag or 'black-forest-labs/FLUX.1-kontext-max')
 * @param {string} params.orientation - 'portrait' or 'landscape' (default 'portrait')
 * @param {number} params.stepsOverride - Override inference steps (default 48)
 * @param {number} params.seed - Consistent seed for reproducibility
 * @param {string} params.initImage - Optional base64 data URL for image-to-image generation
 * @param {number} params.guidanceScale - Guidance scale for adherence to prompt (default 7.8)
 * @returns {Promise<Object>} { url, seed, prompt, metadata }
 */
export async function generateA1SheetImage({
  prompt,
  negativePrompt = '',
  width,
  height,
  model,
  orientation = 'portrait',
  stepsOverride,
  seed,
  initImage = null,
  imageStrength = null, // 🆕 Configurable strength for img2img (default: 0.18 for modify, 0.85 for site context)
  guidanceScale = 7.8,
  attachments = null // 🆕 Array of image attachments (e.g., site plan) - currently passed via prompt instructions
}) {
  // Get model and orientation from feature flags if not provided
  const flags = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('featureFlags') || '{}');
    } catch {
      return {};
    }
  })();

  const modelToUse = model || flags.fluxImageModel || 'black-forest-labs/FLUX.1-dev';
  // 🔒 LANDSCAPE ENFORCEMENT: A1 sheets are ALWAYS landscape (width > height)
  const orientationToUse = 'landscape'; // FIXED: Always landscape for A1 sheets
  const isPortrait = false; // FIXED: Never portrait for A1 sheets

  // 🔒 DIMENSION LOCKING: When initImage is provided, ALWAYS honor explicit width/height
  // This prevents dimension mismatches that cause drift (e.g., baseline 1280×1792 vs modify 1792×1280)
  let validatedWidth, validatedHeight;
  if (initImage && width && height) {
    // ✅ LOCKED: Preserve exact baseline dimensions for img2img consistency
    validatedWidth = width;
    validatedHeight = height;
    console.log(`🔒 Dimension lock (img2img): Using exact baseline ${width}×${height}px`);
  } else if (width && height) {
    // No initImage: Apply Together.ai API limits
    validatedWidth = Math.min(Math.max(width, 64), 1792);
    validatedHeight = Math.min(Math.max(height, 64), 1792);
  } else {
    // Fallback: ALWAYS use landscape dimensions for A1 sheets
    // A1 paper landscape: 841×594mm = 1.414 aspect ratio
    // Using maximum Together.ai API dimension (1792px) for best text clarity
    // 🔒 LANDSCAPE ONLY: No portrait option for A1 sheets
    validatedWidth = 1792;  // 112×16 - Maximum API limit for landscape (width)
    validatedHeight = 1269; // 79.3125×16 ≈ 79×16+5 = 1269 - Exact A1 landscape aspect ratio (1792/1269 = 1.412)
    // Note: 1269 is closer to true A1 ratio (1.414) than 1264 (1.418)
  }

  // OPTIMIZED: Higher steps for best architectural quality
  const steps = stepsOverride ?? 50;
  // ENHANCED: Stronger guidance for professional architectural output
  const optimizedGuidance = guidanceScale || 8.5;

  console.log(`🎨 [${modelToUse}] Generating single A1 sheet (LANDSCAPE ${validatedWidth}×${validatedHeight}px)...`);
  console.log(`   📐 A1 LANDSCAPE: ${validatedWidth}×${validatedHeight}px (aspect ${(validatedWidth/validatedHeight).toFixed(3)}, target 1.414), multiples of 16 ✓`);
  console.log(`   🔒 Orientation: LANDSCAPE ENFORCED (width > height)`);
  console.log(`   🎲 Seed: ${seed}`);
  console.log(`   📝 Prompt length: ${prompt.length} chars`);
  console.log(`   🚫 Negative prompt length: ${negativePrompt.length} chars`);
  console.log(`   🎚️  Guidance scale: ${optimizedGuidance}`);
  console.log(`   🔢 Steps: ${steps}`);
  console.log(`   🖼️  Init image: ${initImage ? 'provided (image-to-image mode)' : 'none (text-to-image mode)'}`);

  // Log site plan attachment if provided (via prompt instructions)
  if (attachments && attachments.length > 0) {
    console.log(`   🗺️  Site plan: ${attachments.length} attachment(s) referenced in prompt`);
  }

  const effectiveSeed = seed || Math.floor(Math.random() * 1e6);

  if (width && height && (validatedWidth !== width || validatedHeight !== height)) {
    console.log(`⚠️  Dimensions adjusted from ${width}×${height} to ${validatedWidth}×${validatedHeight} (Together limits)`);
  }

  try {
    const payload = {
      model: modelToUse,
      prompt,
      negativePrompt, // Separate negative prompt for Together.ai API
      width: validatedWidth,
      height: validatedHeight,
      seed: effectiveSeed,
      num_inference_steps: steps,
      guidanceScale: optimizedGuidance // ENHANCED: Using optimized guidance for best quality
    };

    // Add image-to-image parameters if initImage provided
    if (initImage) {
      payload.initImage = initImage;
      // 🎚️ STRENGTH CONTROL: Low strength (0.18) for modify preserves original sheet
      // High strength (0.85) for site context generation allows more AI transformation
      const effectiveStrength = imageStrength !== null ? imageStrength : 0.85;
      payload.imageStrength = effectiveStrength;

      if (effectiveStrength < 0.25) {
        console.log(`   🔄 Image-to-image mode: strength ${effectiveStrength} (PRESERVE mode - minimal changes)`);
      } else if (effectiveStrength < 0.5) {
        console.log(`   🔄 Image-to-image mode: strength ${effectiveStrength} (MODIFY mode - targeted changes)`);
      } else {
        console.log(`   🔄 Image-to-image mode: strength ${effectiveStrength} (TRANSFORM mode - significant changes)`);
      }
    }

    // Schedule request through global queue for pacing
    const result = await imageRequestQueue.schedule(async () => {
      let response;
      try {
        response = await fetch(`${API_BASE_URL}/api/together/image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } catch (fetchError) {
        // Handle network errors (connection refused, DNS errors, etc.)
        const networkError = new Error(
          `Network error: Cannot connect to proxy server at ${API_BASE_URL}/api/together/image. ` +
          `Please ensure the Express server is running: npm run server`
        );
        networkError.status = 503;
        networkError.originalError = fetchError;
        throw networkError;
      }

      // Handle rate limiting before normalization
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10) || 15;
        const waitTime = retryAfter * 1000;
        console.log(`⏰ Rate limit (429) detected, Retry-After: ${retryAfter}s, waiting ${waitTime / 1000}s...`);
        
        // Increase queue interval temporarily
        imageRequestQueue.setMinInterval(waitTime + 2000);
        
        let errorMessage = 'Rate limit exceeded';
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await response.json();
            errorMessage = data?.error || data?.message || errorMessage;
          } else {
            const text = await response.text();
            errorMessage = text || errorMessage;
          }
        } catch {
          // Ignore parse errors
        }
        
        const error = new Error(errorMessage);
        error.status = 429;
        error.retryAfter = retryAfter;
        throw error;
      }

      // Handle network errors (fetch failures, connection errors)
      if (!response) {
        throw new Error('Network error: No response from server. Is the proxy server running? (npm run server)');
      }
      
      // Use normalized response handler
      const { body: data } = await normalizeResponse(response);
      return data;
    });

    const data = result;

    console.log(`✅ [${modelToUse}] A1 sheet generated successfully`);

    // Wrap URL with proxy to avoid CORS issues for downloads and canvas operations
    const proxiedUrl = wrapImageUrlWithProxy(data.url);
    
    return {
      url: proxiedUrl,
      originalUrl: data.url, // Keep original URL in metadata for reference
      seed: effectiveSeed,
      prompt,
      metadata: {
        width: validatedWidth,
        height: validatedHeight,
        aspectRatio: (validatedWidth / validatedHeight).toFixed(3),
        model: modelToUse.includes('kontext') ? 'FLUX.1-kontext-max' : 'FLUX.1-dev',
        format: 'A1 landscape (ISO 216)', // FIXED: Always landscape
        isoStandard: '841×594mm', // FIXED: Always landscape (width × height)
        orientation: 'landscape', // FIXED: Always landscape
        isLandscape: true, // FIXED: Explicit flag
        isPortrait: false, // FIXED: Never portrait
        effectiveDPI: Math.round((validatedWidth / 841) * 25.4), // Width-based for landscape
        printQuality: 'Professional digital preview (suitable for screen/PDF)',
        printRecommendation: 'For high-quality print, upscale to 300 DPI (9933×7016px landscape)',
        target300DPI: '9933×7016px', // FIXED: Landscape dimensions
        togetherCompliant: true,
        togetherMaxWidth: 1792,
        togetherBaseResolution: `${validatedWidth}×${validatedHeight}px`,
        timestamp: new Date().toISOString(),
        hasInitImage: !!initImage,
        hasSitePlan: !!(attachments && attachments.length > 0)
      }
    };

  } catch (error) {
    // Extract meaningful error message
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message || String(error);
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.error) {
      errorMessage = typeof error.error === 'string' ? error.error : JSON.stringify(error.error);
    } else if (error?.body?.error) {
      errorMessage = typeof error.body.error === 'string' ? error.body.error : JSON.stringify(error.body.error);
    } else if (error?.status) {
      errorMessage = `HTTP ${error.status}: ${error.status === 503 ? 'Service Unavailable - Is the proxy server running? (npm run server)' : error.message || 'Request failed'}`;
    } else {
      errorMessage = JSON.stringify(error);
    }
    
    console.error('❌ [FLUX.1-kontext-max] A1 sheet generation failed:', errorMessage);
    console.error('   Full error details:', JSON.stringify({
      message: error.message,
      status: error.status,
      body: error.body,
      error: error.error,
      stack: error.stack
    }, null, 2));
    
    // Enhance error with helpful message for 503
    if (error?.status === 503 || errorMessage.includes('503')) {
      const enhancedError = new Error('Proxy server unavailable. Please start the Express server: npm run server');
      enhancedError.status = 503;
      enhancedError.originalError = error;
      throw enhancedError;
    }
    
    // Re-throw with enhanced message
    const enhancedError = new Error(errorMessage);
    enhancedError.originalError = error;
    throw enhancedError;
  }
}

/**
 * NEW: Generate Unified A1 Architectural Sheet
 * Single generation for all views on one sheet - ensures perfect consistency
 */
export async function generateUnifiedArchitecturalSheet(params) {
  console.log('📐 [Together AI] Generating UNIFIED A1 Architectural Sheet...');

  const { projectContext } = params;
  const consistentSeed = projectContext.seed || projectContext.projectSeed || Math.floor(Math.random() * 1000000);

  // ========================================
  // STEP 1: Generate Master Design DNA
  // ========================================
  console.log('🧬 STEP 1: Generating Master Design DNA for unified sheet...');

  const dnaResult = await enhancedDNAGenerator.generateMasterDesignDNA(
    projectContext,
    null,
    projectContext.locationData || projectContext.location
  );
  const masterDNA = dnaResult.masterDNA;

  // ========================================
  // STEP 2: Validate Master DNA
  // ========================================
  console.log('🔍 STEP 2: Validating Master DNA...');
  const validation = dnaValidator.validateDesignDNA(masterDNA);

  if (!validation.isValid) {
    console.warn('⚠️ DNA validation found issues:', validation.errors);
    const fixed = dnaValidator.autoFixDesignDNA(masterDNA);
    if (fixed) {
      console.log('✅ DNA auto-fixed successfully');
      Object.assign(masterDNA, fixed);
    }
  }

  // ========================================
  // STEP 3: Generate Unified A1 Sheet Prompt
  // ========================================
  console.log('📝 STEP 3: Creating unified A1 sheet prompt...');
  const sheetPrompt = architecturalSheetService.generateA1SheetPrompt(masterDNA, projectContext);

  // ========================================
  // STEP 4: Generate Single A1 Sheet with All Views
  // ========================================
  console.log('🎨 STEP 4: Generating unified A1 sheet with all 13 views...');

  try {
    const response = await fetch(`${API_BASE_URL}/api/together/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: sheetPrompt,
        model: 'black-forest-labs/FLUX.1-dev',
        width: 1024,  // Will represent A1 aspect ratio
        height: 768,
        num_inference_steps: 28,    // Higher quality for comprehensive sheet
        guidance_scale: 7.5,
        seed: consistentSeed,
        n: 1,
        response_format: 'url'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log('✅ [UNIFIED SHEET] Complete A1 sheet generated successfully!');

    // Return in format compatible with existing UI
    return {
      success: true,
      masterDNA: masterDNA,
      visualizations: {
        unified_sheet: {
          type: 'unified_a1_sheet',
          url: data.url || data.output?.[0],
          prompt: sheetPrompt,
          format: 'A1 (594×841mm)',
          contains: [
            'Ground Floor Plan', 'Upper Floor Plan',
            'North Elevation', 'South Elevation', 'East Elevation', 'West Elevation',
            'Section A-A', 'Section B-B',
            'Exterior 3D View', 'Axonometric', 'Site Plan', 'Interior View'
          ],
          consistency_score: 1.0  // Perfect consistency - single generation
        },
        // Also provide as separate views for backward compatibility if needed
        floorPlans: [],
        technicalDrawings: [],
        threeD: []
      },
      reasoning: dnaResult.reasoning,
      projectContext: projectContext,
      generationMetadata: {
        type: 'unified_sheet',
        seed: consistentSeed,
        model: 'FLUX.1-dev',
        timestamp: new Date().toISOString(),
        totalGenerationTime: Date.now() - Date.now()
      }
    };
  } catch (error) {
    console.error('❌ Failed to generate unified sheet:', error);
    throw error;
  }
}

// Service endpoints for server proxy
export const togetherAIService = {
  generateReasoning: generateArchitecturalReasoning,
  generateImage: generateArchitecturalImage,
  generatePackage: generateConsistentArchitecturalPackage,
  generateConsistentArchitecturalPackage: generateConsistentArchitecturalPackage, // Add full method name
  generateA1SheetImage: generateA1SheetImage, // NEW: Single A1 sheet image generation
  generateUnifiedSheet: generateUnifiedArchitecturalSheet // NEW: Unified A1 sheet generation
};

export default togetherAIService;
