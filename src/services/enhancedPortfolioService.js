/**
 * Enhanced Portfolio Analysis Service
 * Handles PDF and multi-image portfolios with OpenAI GPT-4 Vision
 */

const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

// Use Vercel serverless function in production, local proxy in development
const OPENAI_API_URL = process.env.NODE_ENV === 'production'
  ? '/api/openai-chat'
  : 'http://localhost:3001/api/openai/chat';

class EnhancedPortfolioService {
  constructor() {
    this.apiKey = OPENAI_API_KEY;
    if (!this.apiKey) {
      console.warn('OpenAI API key not found. Portfolio analysis will use fallback.');
    }
  }

  /**
   * Analyze portfolio (PDF or images) to extract architectural style
   */
  async analyzePortfolio(portfolioFiles, locationContext) {
    if (!this.apiKey) {
      console.warn('No OpenAI API key - using fallback portfolio analysis');
      return this.getFallbackPortfolioAnalysis(locationContext);
    }

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
      const analysis = await this.analyzeWithVision(images, locationContext);
      console.log('✅ Portfolio analysis complete');

      return {
        success: true,
        ...analysis,
        imageCount: images.length,
        timestamp: new Date().toISOString()
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
   * Extract images from PDF (simplified - requires pdf.js library)
   * For now, we'll just return empty array and suggest user upload images directly
   */
  async extractImagesFromPDF(pdfFile) {
    console.warn('PDF processing not yet implemented. Please upload images directly.');
    // TODO: Implement PDF.js to extract pages as images
    // For now, return empty array
    return [];
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

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
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
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const analysisText = data.choices[0].message.content;

      return this.parsePortfolioAnalysis(analysisText, locationContext);

    } catch (error) {
      console.error('Vision analysis error:', error);
      throw error;
    }
  }

  /**
   * Build comprehensive portfolio analysis prompt
   */
  buildPortfolioAnalysisPrompt(locationContext, imageCount) {
    return `
Analyze these ${imageCount} architectural portfolio images in detail.

LOCATION CONTEXT:
- Address: ${locationContext?.address || 'Not specified'}
- Region: ${locationContext?.region || 'Not specified'}
- Climate: ${locationContext?.climate?.type || 'Not specified'}

Please provide a comprehensive analysis in the following JSON format:

{
  "primaryStyle": {
    "name": "Identified architectural style (e.g., Modern, Contemporary, Traditional, etc.)",
    "confidence": "High/Medium/Low",
    "period": "Approximate period or era",
    "characteristics": ["Key characteristic 1", "Key characteristic 2", "..."]
  },
  "materials": {
    "exterior": ["Material 1", "Material 2", "..."],
    "structural": ["Material 1", "Material 2", "..."],
    "detailing": ["Material 1", "Material 2", "..."]
  },
  "designElements": {
    "spatialOrganization": "Description of spatial patterns and organization",
    "windowPatterns": "Description of window types and arrangements",
    "roofForm": "Description of roof type and form",
    "colorPalette": ["Color 1", "Color 2", "..."],
    "proportions": "Description of proportional systems used"
  },
  "styleConsistency": {
    "rating": "Consistent/Moderately Consistent/Varied",
    "evolution": "Description of any style evolution across projects",
    "signatureElements": ["Signature element 1", "Signature element 2", "..."]
  },
  "sustainabilityFeatures": {
    "passive": ["Feature 1", "Feature 2", "..."],
    "active": ["Feature 1", "Feature 2", "..."],
    "materials": ["Sustainable material/approach 1", "..."]
  },
  "locationCompatibility": {
    "climateSuitability": "Assessment of how well the style suits the target climate",
    "culturalFit": "Assessment of cultural and contextual appropriateness",
    "adaptationsNeeded": ["Adaptation 1", "Adaptation 2", "..."]
  },
  "recommendations": {
    "stylisticDirection": "Recommended stylistic approach for the new project",
    "materialPalette": ["Recommended material 1", "Recommended material 2", "..."],
    "keyPrinciples": ["Design principle 1", "Design principle 2", "..."]
  }
}

Analyze all images carefully and provide detailed, specific observations. Focus on identifying consistent design patterns, signature elements, and the architect's design philosophy.
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
}

export default new EnhancedPortfolioService();
