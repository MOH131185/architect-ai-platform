/**
 * Enhanced Portfolio Analysis Service
 * Handles PDF and multi-image portfolios with OpenAI GPT-4 Vision
 * Now includes material hex color extraction and confidence scoring
 *
 * SECURITY: All API calls go through server proxy - no API keys in client code
 */

import secureApiClient from './secureApiClient';
import materialDetectionService from './materialDetectionService';

class EnhancedPortfolioService {
  constructor() {
    // No API key needed - handled by server
    this.isAvailable = true; // Server will handle availability
  }

  /**
   * Analyze portfolio (PDF or images) to extract architectural style with material detection
   */
  async analyzePortfolio(portfolioFiles, locationContext) {

    try {
      console.log('📁 Analyzing portfolio:', portfolioFiles.length, 'files');

      // Convert files to base64 images
      const images = await this.processPortfolioFiles(portfolioFiles);
      console.log('✅ Processed', images.length, 'images from portfolio');

      if (images.length === 0) {
        console.warn('No images extracted from portfolio');
        return this.getFallbackPortfolioAnalysis(locationContext);
      }

      // Analyze with GPT-4 Vision
      const visionAnalysis = await this.analyzeWithVision(images, locationContext);
      console.log('✅ Vision analysis complete');

      // Enhanced material detection using materialDetectionService
      const materialAnalysis = await this.enhancedMaterialAnalysis(images, visionAnalysis, locationContext);
      console.log('✅ Material detection complete');

      // Combine analyses with confidence scoring
      const combinedAnalysis = this.combineAnalyses(visionAnalysis, materialAnalysis, locationContext);
      console.log('✅ Portfolio analysis complete with confidence scores');

      return {
        success: true,
        ...combinedAnalysis,
        imageCount: images.length,
        timestamp: new Date().toISOString(),
        analysisMethod: 'enhanced-vision-material'
      };

    } catch (error) {
      console.error('Portfolio analysis error:', error);
      return this.getFallbackPortfolioAnalysis(locationContext);
    }
  }

  /**
   * Process portfolio files (PDFs and images) into base64 images
   */
  async processPortfolioFiles(files) {
    const images = [];

    for (const file of files) {
      try {
        if (file.type === 'application/pdf') {
          // Handle PDF - extract first few pages as images
          const pdfImages = await this.extractImagesFromPDF(file);
          images.push(...pdfImages);
        } else if (file.type.startsWith('image/')) {
          // Handle image files
          const base64 = await this.fileToBase64(file);
          images.push({
            type: 'image',
            data: base64,
            mimeType: file.type,
            name: file.name
          });
        }
      } catch (error) {
        console.error('Error processing file:', file.name, error);
      }
    }

    // Limit to first 5 images to avoid payload size limits (413 error)
    // With compression, 5 images should be ~2-3MB total
    return images.slice(0, 5);
  }

  /**
   * Convert file to base64 with image compression
   */
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // Compress image to reduce payload size
          const compressed = await this.compressImage(e.target.result, file.type);
          resolve(compressed);
        } catch (error) {
          console.warn('Image compression failed, using original:', error);
          resolve(e.target.result);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Compress image to reduce payload size for API
   */
  compressImage(dataUrl, mimeType) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Resize to max 1024px on longest side
        const MAX_SIZE = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_SIZE) {
          height = (height / width) * MAX_SIZE;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width = (width / height) * MAX_SIZE;
          height = MAX_SIZE;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with 0.7 quality
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressed);
      };
      img.onerror = () => resolve(dataUrl); // Fallback to original
      img.src = dataUrl;
    });
  }

  /**
   * Extract images from PDF by converting pages to images
   */
  async extractImagesFromPDF(pdfFile) {
    try {
      // Use pdfjs-dist for browser-based PDF rendering
      const pdfjsLib = await import('pdfjs-dist/build/pdf');

      // Set worker path - use local copy from public folder (v5.4.296)
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
      }

      // Read PDF file as ArrayBuffer
      const arrayBuffer = await pdfFile.arrayBuffer();

      console.log(`📄 Processing PDF: ${pdfFile.name}`);

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      console.log(`📄 PDF has ${pdf.numPages} pages`);

      const images = [];
      const maxPages = Math.min(3, pdf.numPages); // Extract first 3 pages only

      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);

          // Create canvas for rendering
          const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better quality
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          // Render PDF page to canvas
          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;

          // Convert canvas to compressed JPEG (0.7 quality for balance between size and quality)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

          images.push({
            type: 'image',
            data: dataUrl,
            mimeType: 'image/jpeg',
            name: `${pdfFile.name}_page_${pageNum}.jpg`
          });

          console.log(`✅ Extracted page ${pageNum} from PDF`);
        } catch (pageError) {
          console.error(`❌ Error extracting page ${pageNum}:`, pageError);
        }
      }

      if (images.length > 0) {
        console.log(`✅ Successfully extracted ${images.length} pages from PDF`);
      } else {
        console.warn('⚠️  No images extracted from PDF');
      }

      return images;

    } catch (error) {
      console.error('❌ PDF extraction error:', error);
      console.warn('⚠️  PDF processing failed. Please upload JPG/PNG images directly.');
      return [];
    }
  }

  /**
   * Analyze portfolio images with GPT-4 Vision
   */
  async analyzeWithVision(images, locationContext) {
    try {
      // Build vision message with multiple images
      const imageContent = images.map(img => ({
        type: 'image_url',
        image_url: {
          url: img.data // base64 data URL
        }
      }));

      const prompt = this.buildPortfolioAnalysisPrompt(locationContext, images.length);

      const data = await secureApiClient.openaiChat({
        model: 'gpt-4o', // Use gpt-4o which supports vision
        messages: [
          {
            role: 'system',
            content: 'You are an expert architectural analyst specializing in style detection from portfolio images. Analyze architectural designs to identify styles, materials, spatial patterns, and design philosophies.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              ...imageContent
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      });

      const analysisText = data.choices[0].message.content;

      return this.parsePortfolioAnalysis(analysisText, locationContext);

    } catch (error) {
      console.error('Vision analysis error:', error);
      throw error;
    }
  }

  /**
   * Build comprehensive portfolio analysis prompt with material hex extraction
   */
  buildPortfolioAnalysisPrompt(locationContext, imageCount) {
    return `
Analyze these ${imageCount} architectural portfolio images in detail, extracting specific material colors and patterns.

LOCATION CONTEXT:
- Address: ${locationContext?.address || 'Not specified'}
- Region: ${locationContext?.region || 'Not specified'}
- Climate: ${locationContext?.climate?.type || 'Not specified'}

Please provide a comprehensive analysis in the following JSON format:

{
  "buildingProgram": {
    "type": "Most common building type in portfolio (e.g., 'clinic', 'office', 'detached-house', 'apartment-building', etc.)",
    "confidence": 85,  // Confidence score 0-100
    "variety": ["Other building types found", "..."],
    "characteristics": ["Key programmatic features", "Spatial organization patterns", "..."]
  },
  "primaryStyle": {
    "name": "Identified architectural style (e.g., Modern, Contemporary, Traditional, etc.)",
    "confidence": 85,  // Confidence score 0-100
    "period": "Approximate period or era",
    "characteristics": ["Key characteristic 1", "Key characteristic 2", "..."]
  },
  "materials": {
    "exterior": [
      {
        "name": "Red Brick",
        "hexColor": "#B8604E",
        "pattern": "flemish bond",
        "texture": "rough/smooth/textured",
        "percentage": 60,  // Percentage of facade
        "confidence": 90  // Detection confidence 0-100
      }
    ],
    "structural": [
      {
        "name": "Steel Frame",
        "hexColor": "#808080",
        "visible": true,
        "confidence": 75
      }
    ],
    "detailing": [
      {
        "name": "Portland Stone",
        "hexColor": "#E8E0D5",
        "application": "window sills, cornices",
        "confidence": 85
      }
    ]
  },
  "designElements": {
    "spatialOrganization": "Description of spatial patterns and organization",
    "windowPatterns": {
      "type": "Large format glazing",
      "frameColor": "#000000",
      "glazingTint": "#87CEEB",
      "arrangement": "regular grid/asymmetric/rhythmic"
    },
    "roofForm": {
      "type": "pitched/flat/complex",
      "material": "clay tiles/slate/metal",
      "color": "#8B4513",
      "angle": "35 degrees"
    },
    "colorPalette": [
      {"color": "Warm Grey", "hex": "#808070"},
      {"color": "Natural Wood", "hex": "#8B4513"},
      {"color": "White Render", "hex": "#F5F5F5"}
    ],
    "proportions": "Description of proportional systems used"
  },
  "styleConsistency": {
    "rating": "Consistent/Moderately Consistent/Varied",
    "consistencyScore": 85,  // 0-100 score
    "evolution": "Description of any style evolution across projects",
    "signatureElements": [
      {
        "element": "Cantilevered balconies",
        "frequency": 80,  // Percentage occurrence in portfolio
        "confidence": 90
      }
    ]
  },
  "sustainabilityFeatures": {
    "passive": [
      {
        "feature": "Natural ventilation",
        "effectiveness": "high",
        "confidence": 85
      }
    ],
    "active": ["Solar panels", "Heat pumps"],
    "materials": [
      {
        "material": "Sustainable timber",
        "certification": "FSC",
        "confidence": 70
      }
    ]
  },
  "materialQuality": {
    "constructionQuality": "high/medium/standard",
    "detailingLevel": "exceptional/good/standard",
    "maintenanceRequirement": "low/medium/high",
    "qualityScore": 85  // 0-100
  },
  "locationCompatibility": {
    "climateSuitability": "Assessment of how well the style suits the target climate",
    "climateSuitabilityScore": 80,  // 0-100
    "culturalFit": "Assessment of cultural and contextual appropriateness",
    "culturalFitScore": 75,  // 0-100
    "adaptationsNeeded": ["Adaptation 1", "Adaptation 2", "..."]
  },
  "recommendations": {
    "stylisticDirection": "Recommended stylistic approach for the new project",
    "materialPalette": [
      {
        "material": "Local brick",
        "suggestedHex": "#B8604E",
        "reason": "Climate compatible and locally available"
      }
    ],
    "keyPrinciples": ["Design principle 1", "Design principle 2", "..."],
    "confidenceLevel": 85  // Overall analysis confidence 0-100
  }
}

IMPORTANT: For building program detection:
- Look for visual clues: signage, waiting areas (clinics), office layouts, residential features
- Common types: 'clinic', 'dental-clinic', 'office', 'detached-house', 'apartment-building', 'hotel', 'school', 'retail', 'restaurant'
- If multiple types are present, identify the most common one
- Provide high confidence (>80) only if clear visual evidence exists

For each material detected, provide:
1. Specific material name (not generic like "brick" but "red clay brick" or "London stock brick")
2. Accurate hex color code based on the dominant color visible
3. Pattern or bond if applicable (stretcher bond, stack bond, etc.)
4. Texture description (smooth, rough, brushed, weathered, etc.)
5. Confidence score (0-100) for how certain you are about the detection
6. Percentage of facade or area covered by this material

For colors, provide specific hex codes, not generic color names.
Analyze all images carefully and provide detailed, specific observations.
    `.trim();
  }

  /**
   * Parse portfolio analysis response
   */
  parsePortfolioAnalysis(analysisText, locationContext) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...parsed,
          rawAnalysis: analysisText,
          source: 'openai-vision'
        };
      }
    } catch (error) {
      console.warn('Could not parse JSON from portfolio analysis:', error);
    }

    // Fallback to text-based extraction
    return {
      primaryStyle: {
        name: this.extractValue(analysisText, 'style') || 'Contemporary',
        confidence: 'Medium',
        characteristics: this.extractList(analysisText, 'characteristics')
      },
      materials: {
        exterior: this.extractList(analysisText, 'materials'),
        structural: [],
        detailing: []
      },
      designElements: {
        spatialOrganization: this.extractValue(analysisText, 'spatial') || 'Modern spatial flow',
        windowPatterns: this.extractValue(analysisText, 'windows') || 'Contemporary fenestration',
        roofForm: this.extractValue(analysisText, 'roof') || 'Modern roof form',
        colorPalette: this.extractList(analysisText, 'color'),
        proportions: 'Contemporary proportions'
      },
      styleConsistency: {
        rating: 'Moderately Consistent',
        evolution: 'Consistent design language',
        signatureElements: this.extractList(analysisText, 'signature')
      },
      recommendations: {
        stylisticDirection: 'Continue with established design language adapted to location',
        materialPalette: ['Local materials', 'Sustainable options', 'Climate-appropriate'],
        keyPrinciples: ['Contextual design', 'Sustainability', 'Quality craftsmanship']
      },
      rawAnalysis: analysisText,
      source: 'openai-vision-text'
    };
  }

  /**
   * Extract value from text
   */
  extractValue(text, keyword) {
    const regex = new RegExp(`${keyword}[:\\s]+([^\\n.]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract list from text
   */
  extractList(text, keyword) {
    const regex = new RegExp(`${keyword}[:\\s]+([^\\n]+)`, 'i');
    const match = text.match(regex);
    if (match) {
      return match[1].split(',').map(item => item.trim()).filter(item => item.length > 0);
    }
    return [];
  }

  /**
   * Fallback portfolio analysis when API unavailable
   */
  getFallbackPortfolioAnalysis(locationContext) {
    return {
      success: false,
      isFallback: true,
      primaryStyle: {
        name: 'Contemporary',
        confidence: 'Medium',
        period: '2000-Present',
        characteristics: [
          'Clean lines and simple forms',
          'Large windows for natural light',
          'Neutral color palette',
          'Modern materials integration'
        ]
      },
      materials: {
        exterior: ['Brick', 'Render', 'Timber cladding', 'Glass'],
        structural: ['Steel frame', 'Concrete', 'Timber'],
        detailing: ['Metal', 'Glass', 'Stone']
      },
      designElements: {
        spatialOrganization: 'Open plan living with distinct functional zones',
        windowPatterns: 'Large windows and sliding doors for indoor-outdoor connection',
        roofForm: 'Flat or low-pitched contemporary roof',
        colorPalette: ['White', 'Grey', 'Natural wood', 'Black accents'],
        proportions: 'Contemporary proportions with horizontal emphasis'
      },
      styleConsistency: {
        rating: 'Moderately Consistent',
        evolution: 'Contemporary approach with contextual variations',
        signatureElements: ['Clean geometry', 'Material honesty', 'Light and space']
      },
      sustainabilityFeatures: {
        passive: ['Natural ventilation', 'Daylighting', 'Thermal mass'],
        active: ['Solar panels', 'Heat pumps'],
        materials: ['Sustainable timber', 'Recycled materials', 'Low-carbon concrete']
      },
      locationCompatibility: {
        climateSuitability: 'Adaptable to UK climate with appropriate detailing',
        culturalFit: 'Contemporary design suitable for urban and suburban contexts',
        adaptationsNeeded: [
          'Weather-resistant materials for UK climate',
          'Enhanced insulation for energy efficiency',
          'Contextual response to local vernacular'
        ]
      },
      recommendations: {
        stylisticDirection: 'Contemporary design with local material integration',
        materialPalette: [
          'Local brick or stone',
          'Timber cladding',
          'High-performance glazing',
          'Metal roofing'
        ],
        keyPrinciples: [
          'Contextual design respecting local character',
          'Passive-first sustainability approach',
          'High-quality materials and craftsmanship',
          'Timeless contemporary aesthetic'
        ]
      },
      message: 'Fallback analysis - upload portfolio images for detailed analysis',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Blend portfolio style with location recommendations
   */
  blendStyleWithLocation(portfolioAnalysis, locationAnalysis, materialWeight = 0.5, characteristicWeight = 0.5) {
    console.log('🎨 Blending portfolio style with location context...');
    console.log('   Material weight:', materialWeight, '(portfolio influence)');
    console.log('   Characteristic weight:', characteristicWeight, '(portfolio influence)');

    const portfolioMaterials = portfolioAnalysis.materials?.exterior || [];
    const locationMaterials = locationAnalysis.materials?.walls || [];

    const portfolioCharacteristics = portfolioAnalysis.primaryStyle?.characteristics || [];
    const locationCharacteristics = locationAnalysis.architecturalData?.traditionalStyles?.[0]?.characteristics || [];

    // Blend materials (weighted combination)
    const blendedMaterials = this.weightedBlend(
      portfolioMaterials,
      locationMaterials,
      materialWeight
    );

    // Blend characteristics (weighted combination)
    const blendedCharacteristics = this.weightedBlend(
      portfolioCharacteristics,
      locationCharacteristics,
      characteristicWeight
    );

    // Create style description
    const portfolioStyleName = portfolioAnalysis.primaryStyle?.name || 'Contemporary';
    const locationStyleName = locationAnalysis.architecturalData?.traditionalStyles?.[0]?.name || 'Local Vernacular';

    let styleDescription;
    if (materialWeight > 0.7 && characteristicWeight > 0.7) {
      styleDescription = `${portfolioStyleName} with subtle ${locationStyleName} influences`;
    } else if (materialWeight < 0.3 && characteristicWeight < 0.3) {
      styleDescription = `${locationStyleName} with contemporary ${portfolioStyleName} interpretation`;
    } else {
      styleDescription = `Balanced blend of ${portfolioStyleName} and ${locationStyleName}`;
    }

    return {
      styleName: styleDescription,
      materials: blendedMaterials,
      characteristics: blendedCharacteristics,
      portfolioInfluence: (materialWeight + characteristicWeight) / 2,
      locationInfluence: 1 - (materialWeight + characteristicWeight) / 2,
      description: this.generateBlendDescription(
        portfolioStyleName,
        locationStyleName,
        materialWeight,
        characteristicWeight,
        blendedMaterials,
        blendedCharacteristics
      )
    };
  }

  /**
   * Weighted blend of two arrays
   */
  weightedBlend(array1, array2, weight1) {
    const weight2 = 1 - weight1;
    const count1 = Math.round(array1.length * weight1);
    const count2 = Math.round(array2.length * weight2);

    const result = [
      ...array1.slice(0, count1),
      ...array2.slice(0, count2)
    ];

    // Remove duplicates
    return [...new Set(result)];
  }

  /**
   * Generate blend description
   */
  generateBlendDescription(portfolioStyle, locationStyle, materialWeight, characteristicWeight, materials, characteristics) {
    const avgWeight = (materialWeight + characteristicWeight) / 2;

    let description = `This design blends `;

    if (avgWeight > 0.7) {
      description += `your ${portfolioStyle} design language (${Math.round(avgWeight * 100)}%) with carefully selected ${locationStyle} elements (${Math.round((1 - avgWeight) * 100)}%). `;
      description += `The design maintains your signature aesthetic while incorporating local materials and contextual considerations.`;
    } else if (avgWeight < 0.3) {
      description += `traditional ${locationStyle} character (${Math.round((1 - avgWeight) * 100)}%) with contemporary ${portfolioStyle} sensibilities (${Math.round(avgWeight * 100)}%). `;
      description += `The design respects local architectural heritage while bringing modern functionality and your design expertise.`;
    } else {
      description += `equal parts ${portfolioStyle} and ${locationStyle} (${Math.round(avgWeight * 100)}% / ${Math.round((1 - avgWeight) * 100)}%). `;
      description += `The design achieves a harmonious balance between your established style and the local architectural context.`;
    }

    description += `\n\nKey materials: ${materials.slice(0, 4).join(', ')}.`;
    description += `\nDefining characteristics: ${characteristics.slice(0, 4).join(', ')}.`;

    return description;
  }

  /**
   * Enhanced material analysis using materialDetectionService
   */
  async enhancedMaterialAnalysis(images, visionAnalysis, locationContext) {
    const detectedMaterials = [];
    const materialConfidence = {};

    // Process each image for material detection
    for (const image of images) {
      try {
        const materials = await materialDetectionService.extractMaterialsFromImage(
          image.data,
          {
            projectType: locationContext?.projectType || 'residential',
            location: locationContext?.address || 'unknown'
          }
        );

        // Aggregate materials with confidence scores
        materials.materials.forEach(mat => {
          const key = `${mat.name}_${mat.hexColor}`;
          if (!materialConfidence[key]) {
            materialConfidence[key] = {
              ...mat,
              occurrences: 0,
              totalConfidence: 0,
              images: []
            };
          }
          materialConfidence[key].occurrences++;
          materialConfidence[key].totalConfidence += mat.confidence;
          materialConfidence[key].images.push(image.name);
        });

        detectedMaterials.push(materials);
      } catch (error) {
        console.warn('Material detection error for image:', image.name, error);
      }
    }

    // Calculate average confidence scores
    const consolidatedMaterials = Object.values(materialConfidence).map(mat => ({
      ...mat,
      averageConfidence: Math.round(mat.totalConfidence / mat.occurrences),
      frequency: (mat.occurrences / images.length) * 100
    }));

    // Get climate compatibility scores
    const climate = locationContext?.climate?.type || 'temperate_maritime';
    const materialRecommendations = await materialDetectionService.recommendMaterials({
      location: locationContext?.address,
      climate,
      projectType: locationContext?.projectType || 'residential',
      budget: 'medium',
      sustainabilityTarget: 'high',
      portfolioMaterials: consolidatedMaterials.map(m => m.name)
    });

    return {
      detectedMaterials: consolidatedMaterials.sort((a, b) => b.averageConfidence - a.averageConfidence),
      materialRecommendations,
      climateCompatibility: this.assessClimateCompatibility(consolidatedMaterials, climate),
      sustainabilityScores: this.calculateSustainabilityScores(consolidatedMaterials)
    };
  }

  /**
   * Combine vision and material analyses with confidence scoring
   */
  combineAnalyses(visionAnalysis, materialAnalysis, locationContext) {
    // Extract confidence scores from vision analysis
    const styleConfidence = visionAnalysis.primaryStyle?.confidence || 50;
    const materialConfidence = materialAnalysis.detectedMaterials[0]?.averageConfidence || 50;
    const overallConfidence = Math.round((styleConfidence + materialConfidence) / 2);

    // Merge material data with hex colors
    const enhancedMaterials = {
      exterior: this.mergeMaterialData(
        visionAnalysis.materials?.exterior || [],
        materialAnalysis.detectedMaterials.filter(m => m.application === 'facade')
      ),
      structural: visionAnalysis.materials?.structural || [],
      detailing: visionAnalysis.materials?.detailing || []
    };

    // Enhanced style analysis with confidence
    const enhancedStyle = {
      ...visionAnalysis.primaryStyle,
      confidence: styleConfidence,
      confidenceLevel: this.getConfidenceLevel(styleConfidence),
      materialConsistency: this.assessMaterialConsistency(materialAnalysis.detectedMaterials)
    };

    // Create comprehensive color palette with hex codes
    const colorPalette = this.extractColorPalette(
      visionAnalysis.designElements?.colorPalette || [],
      materialAnalysis.detectedMaterials
    );

    return {
      primaryStyle: enhancedStyle,
      materials: enhancedMaterials,
      materialAnalysis: {
        detectedMaterials: materialAnalysis.detectedMaterials,
        recommendations: materialAnalysis.materialRecommendations,
        climateCompatibility: materialAnalysis.climateCompatibility,
        sustainabilityScores: materialAnalysis.sustainabilityScores
      },
      designElements: {
        ...visionAnalysis.designElements,
        colorPalette
      },
      styleConsistency: {
        ...visionAnalysis.styleConsistency,
        materialConsistencyScore: this.assessMaterialConsistency(materialAnalysis.detectedMaterials),
        overallConsistencyScore: overallConfidence
      },
      confidenceMetrics: {
        styleConfidence,
        materialConfidence,
        overallConfidence,
        analysisQuality: this.getConfidenceLevel(overallConfidence)
      },
      recommendations: this.generateEnhancedRecommendations(
        visionAnalysis,
        materialAnalysis,
        locationContext,
        overallConfidence
      )
    };
  }

  /**
   * Merge material data from vision and detection services
   */
  mergeMaterialData(visionMaterials, detectedMaterials) {
    const merged = [];

    // Convert vision materials to enhanced format if they're strings
    const visionEnhanced = visionMaterials.map(mat => {
      if (typeof mat === 'string') {
        // Find matching detected material
        const detected = detectedMaterials.find(d =>
          d.name.toLowerCase().includes(mat.toLowerCase()) ||
          mat.toLowerCase().includes(d.name.toLowerCase())
        );

        return {
          name: mat,
          hexColor: detected?.hexColor || '#808080',
          pattern: detected?.pattern || 'unknown',
          texture: detected?.texture || 'standard',
          confidence: detected?.averageConfidence || 50
        };
      }
      return mat;
    });

    // Add detected materials not in vision analysis
    detectedMaterials.forEach(detected => {
      if (!visionEnhanced.find(v => v.name === detected.name)) {
        merged.push({
          name: detected.name,
          hexColor: detected.hexColor,
          pattern: detected.pattern,
          texture: detected.texture,
          confidence: detected.averageConfidence,
          source: 'material-detection'
        });
      }
    });

    return [...visionEnhanced, ...merged];
  }

  /**
   * Extract comprehensive color palette with hex codes
   */
  extractColorPalette(visionColors, detectedMaterials) {
    const palette = [];

    // Add colors from vision analysis
    visionColors.forEach(color => {
      if (typeof color === 'object' && color.hex) {
        palette.push(color);
      } else if (typeof color === 'string') {
        palette.push({
          color,
          hex: this.estimateHexFromName(color)
        });
      }
    });

    // Add unique colors from detected materials
    detectedMaterials.forEach(mat => {
      if (mat.hexColor && !palette.find(p => p.hex === mat.hexColor)) {
        palette.push({
          color: mat.name,
          hex: mat.hexColor,
          source: 'material-detection',
          confidence: mat.averageConfidence
        });
      }
    });

    return palette;
  }

  /**
   * Assess material consistency across portfolio
   */
  assessMaterialConsistency(materials) {
    if (materials.length === 0) return 0;

    // Check how consistent materials are across images
    const highFrequencyMaterials = materials.filter(m => m.frequency > 60);
    const consistencyScore = (highFrequencyMaterials.length / materials.length) * 100;

    return Math.round(consistencyScore);
  }

  /**
   * Assess climate compatibility of detected materials
   */
  assessClimateCompatibility(materials, climate) {
    const compatibilityScores = materials.map(mat => {
      const materialKey = mat.name.toLowerCase().replace(/ /g, '_');
      return materialDetectionService.calculateClimateCompatibility(materialKey, climate);
    });

    const averageScore = compatibilityScores.reduce((a, b) => a + b, 0) / compatibilityScores.length;

    return {
      score: Math.round(averageScore * 100),
      rating: averageScore > 0.8 ? 'Excellent' : averageScore > 0.6 ? 'Good' : 'Fair',
      incompatibleMaterials: materials.filter((mat, i) => compatibilityScores[i] < 0.5)
    };
  }

  /**
   * Calculate sustainability scores for detected materials
   */
  calculateSustainabilityScores(materials) {
    return materials.map(mat => {
      const materialKey = mat.name.toLowerCase().replace(/ /g, '_');
      const score = materialDetectionService.getSustainabilityScore(materialKey);

      return {
        material: mat.name,
        score,
        rating: score > 80 ? 'Excellent' : score > 60 ? 'Good' : score > 40 ? 'Fair' : 'Poor'
      };
    });
  }

  /**
   * Get confidence level description
   */
  getConfidenceLevel(score) {
    if (score >= 90) return 'Very High';
    if (score >= 75) return 'High';
    if (score >= 60) return 'Medium';
    if (score >= 40) return 'Low';
    return 'Very Low';
  }

  /**
   * Generate enhanced recommendations with confidence
   */
  generateEnhancedRecommendations(visionAnalysis, materialAnalysis, locationContext, confidence) {
    const recommendations = {
      stylisticDirection: visionAnalysis.recommendations?.stylisticDirection || 'Contemporary design',
      materialPalette: [],
      keyPrinciples: visionAnalysis.recommendations?.keyPrinciples || [],
      confidenceLevel: confidence,
      adaptations: []
    };

    // Add recommended materials with reasoning
    if (materialAnalysis.materialRecommendations?.primary) {
      materialAnalysis.materialRecommendations.primary.forEach(mat => {
        recommendations.materialPalette.push({
          material: mat.name,
          hexColor: mat.hexColors?.[0] || '#808080',
          reason: mat.reasoning,
          climateSuitability: mat.score,
          application: 'primary facade'
        });
      });
    }

    // Add climate-specific adaptations
    if (materialAnalysis.climateCompatibility?.incompatibleMaterials?.length > 0) {
      recommendations.adaptations.push(
        `Replace ${materialAnalysis.climateCompatibility.incompatibleMaterials.map(m => m.name).join(', ')} with climate-appropriate alternatives`
      );
    }

    // Add sustainability recommendations
    const poorSustainability = materialAnalysis.sustainabilityScores?.filter(s => s.rating === 'Poor') || [];
    if (poorSustainability.length > 0) {
      recommendations.adaptations.push(
        `Consider sustainable alternatives to ${poorSustainability.map(s => s.material).join(', ')}`
      );
    }

    return recommendations;
  }

  /**
   * Estimate hex color from color name
   */
  estimateHexFromName(colorName) {
    const colorMap = {
      'white': '#FFFFFF',
      'black': '#000000',
      'grey': '#808080',
      'gray': '#808080',
      'red': '#FF0000',
      'brick': '#B8604E',
      'brown': '#8B4513',
      'wood': '#8B4513',
      'stone': '#D3D3D3',
      'glass': '#87CEEB',
      'metal': '#C0C0C0',
      'green': '#008000',
      'blue': '#0000FF'
    };

    const lower = colorName.toLowerCase();
    for (const [key, value] of Object.entries(colorMap)) {
      if (lower.includes(key)) return value;
    }
    return '#808080'; // Default grey
  }
}

export default new EnhancedPortfolioService();
