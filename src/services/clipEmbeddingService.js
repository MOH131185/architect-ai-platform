import logger from '../utils/logger.js';

/**
 * CLIP Embedding Service
 *
 * Generates CLIP (Contrastive Language-Image Pre-training) embeddings for images
 * to enable semantic similarity comparisons and consistency checking.
 *
 * Architecture:
 * - Primary: Call external CLIP API (Replicate, HuggingFace, etc.)
 * - Fallback: Use deterministic mock embeddings based on image features
 *
 * CLIP Model: ViT-L/14 (512-dimensional embeddings)
 */

class CLIPEmbeddingService {
  constructor() {
    this.embeddingDimension = 512;
    this.model = 'ViT-L/14';
    logger.info('🎯 CLIP Embedding Service initialized');
  }

  /**
   * Generate CLIP embedding for an image
   *
   * @param {string} imageUrl - URL or base64 data URI of image
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Embedding result with vector and metadata
   */
  async generateEmbedding(imageUrl, options = {}) {
    logger.info('\n🎯 [CLIP] Generating image embedding...');
    logger.info(`   📷 Image Type: ${this.detectImageType(imageUrl)}`);

    try {
      // SECURITY: API availability is handled server-side
      // Try to use actual CLIP service if requested
      if (options.useAPI) {
        return await this.generateWithReplicateCLIP(imageUrl);
      }

      // Fallback to mock embedding
      return await this.generateMockEmbedding(imageUrl);

    } catch (error) {
      logger.warn('⚠️  [CLIP] API generation failed, using mock embedding');
      return await this.generateMockEmbedding(imageUrl);
    }
  }

  /**
   * Generate embedding using Replicate CLIP API
   * Model: salesforce/blip or openai/clip-vit-large-patch14
   */
  async generateWithReplicateCLIP(imageUrl) {
    logger.api(' [CLIP] Using Replicate CLIP API...');

    try {
      const response = await fetch('/api/replicate-predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version: '75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a', // CLIP ViT-L/14
          input: {
            image: imageUrl
          }
        })
      });

      if (!response.ok) {
        throw new Error(`CLIP API error: ${response.status}`);
      }

      const prediction = await response.json();

      // Poll for result
      const embedding = await this.pollReplicateResult(prediction.id);

      logger.success(' [CLIP] Embedding generated via API');
      return {
        success: true,
        embedding,
        dimension: this.embeddingDimension,
        model: 'CLIP-ViT-L/14 (Replicate)',
        source: 'api'
      };

    } catch (error) {
      logger.error('❌ [CLIP] API generation failed:', error);
      throw error;
    }
  }

  /**
   * Poll Replicate for CLIP result
   */
  async pollReplicateResult(predictionId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(`/api/replicate-status/${predictionId}`);
      const prediction = await response.json();

      if (prediction.status === 'succeeded') {
        return prediction.output;
      }

      if (prediction.status === 'failed') {
        throw new Error('CLIP embedding generation failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('CLIP embedding timeout');
  }

  /**
   * Generate mock embedding based on image characteristics
   * Uses a deterministic approach based on image data
   */
  async generateMockEmbedding(imageUrl) {
    logger.info('🎲 [CLIP] Generating deterministic mock embedding...');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Extract features from image URL/data
    const imageHash = this.hashString(imageUrl);
    const imageLength = imageUrl.length;
    const hasData = imageUrl.includes('data:image');
    const isPng = imageUrl.includes('png');
    const isJpeg = imageUrl.includes('jpeg') || imageUrl.includes('jpg');

    // Create feature vector based on image characteristics
    const features = {
      hash: imageHash,
      length: imageLength,
      typeScore: hasData ? 0.8 : 0.5,
      formatScore: isPng ? 0.7 : (isJpeg ? 0.6 : 0.5)
    };

    // Generate 512-dimensional embedding
    const embedding = new Array(this.embeddingDimension).fill(0).map((_, i) => {
      // Combine multiple sine waves with different frequencies
      // This creates a deterministic but complex embedding space
      const freq1 = Math.sin(features.hash * 0.001 + i * 0.1);
      const freq2 = Math.cos(features.hash * 0.002 + i * 0.05);
      const freq3 = Math.sin(features.length * 0.0001 + i * 0.15);
      const typeEffect = features.typeScore * Math.sin(i * 0.2);
      const formatEffect = features.formatScore * Math.cos(i * 0.3);

      return freq1 * 0.3 + freq2 * 0.3 + freq3 * 0.2 + typeEffect * 0.1 + formatEffect * 0.1;
    });

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    const normalizedEmbedding = embedding.map(val => val / magnitude);

    logger.success(' [CLIP] Mock embedding generated');
    logger.info(`   📊 Dimension: ${normalizedEmbedding.length}`);
    logger.info(`   📏 Magnitude: ${magnitude.toFixed(4)}`);
    logger.info(`   🔢 Hash Seed: ${imageHash}`);

    return {
      success: true,
      embedding: normalizedEmbedding,
      dimension: this.embeddingDimension,
      model: 'Mock CLIP (Deterministic)',
      source: 'mock',
      features
    };
  }

  /**
   * Calculate cosine similarity between two embeddings
   * Returns value between -1 (opposite) and 1 (identical)
   *
   * @param {Array<number>} embeddingA - First embedding vector
   * @param {Array<number>} embeddingB - Second embedding vector
   * @returns {number} Cosine similarity score (-1 to 1)
   */
  calculateSimilarity(embeddingA, embeddingB) {
    if (embeddingA.length !== embeddingB.length) {
      throw new Error(`Embedding dimensions don't match: ${embeddingA.length} vs ${embeddingB.length}`);
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < embeddingA.length; i++) {
      dotProduct += embeddingA[i] * embeddingB[i];
      magnitudeA += embeddingA[i] * embeddingA[i];
      magnitudeB += embeddingB[i] * embeddingB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    const similarity = dotProduct / (magnitudeA * magnitudeB);

    return similarity;
  }

  /**
   * Compare two images and return similarity score
   *
   * @param {string} imageUrlA - First image
   * @param {string} imageUrlB - Second image
   * @returns {Promise<Object>} Comparison result with score
   */
  async compareImages(imageUrlA, imageUrlB) {
    logger.info('\n🔍 [CLIP] Comparing images...');

    const resultA = await this.generateEmbedding(imageUrlA);
    const resultB = await this.generateEmbedding(imageUrlB);

    const similarity = this.calculateSimilarity(
      resultA.embedding,
      resultB.embedding
    );

    logger.success(' [CLIP] Comparison complete');
    logger.info(`   📊 Similarity: ${(similarity * 100).toFixed(2)}%`);

    return {
      success: true,
      similarity,
      similarityPercentage: (similarity * 100).toFixed(2),
      embeddingA: resultA,
      embeddingB: resultB,
      interpretation: this.interpretSimilarity(similarity)
    };
  }

  /**
   * Interpret similarity score
   */
  interpretSimilarity(score) {
    if (score >= 0.95) return { level: 'identical', description: 'Images are nearly identical' };
    if (score >= 0.85) return { level: 'excellent', description: 'Excellent consistency - very similar designs' };
    if (score >= 0.80) return { level: 'good', description: 'Good consistency - minor variations' };
    if (score >= 0.70) return { level: 'acceptable', description: 'Acceptable consistency - some design drift' };
    if (score >= 0.60) return { level: 'fair', description: 'Fair consistency - noticeable differences' };
    if (score >= 0.50) return { level: 'poor', description: 'Poor consistency - significant differences' };
    return { level: 'very_poor', description: 'Very poor consistency - major design drift' };
  }

  /**
   * Generate text embedding for prompts
   * This allows comparing text prompts to images
   */
  async generateTextEmbedding(text) {
    logger.info('\n📝 [CLIP] Generating text embedding...');

    // For mock implementation, use text hash as seed
    const textHash = this.hashString(text);
    const words = text.split(/\s+/).length;

    const embedding = new Array(this.embeddingDimension).fill(0).map((_, i) => {
      const freq1 = Math.sin(textHash * 0.001 + i * 0.12);
      const freq2 = Math.cos(textHash * 0.003 + i * 0.08);
      const wordEffect = Math.sin(words * 0.1 + i * 0.15);

      return freq1 * 0.4 + freq2 * 0.4 + wordEffect * 0.2;
    });

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    const normalizedEmbedding = embedding.map(val => val / magnitude);

    logger.success(' [CLIP] Text embedding generated');
    logger.info(`   📝 Text Length: ${text.length} chars, ${words} words`);
    logger.info(`   📊 Dimension: ${normalizedEmbedding.length}`);

    return {
      success: true,
      embedding: normalizedEmbedding,
      dimension: this.embeddingDimension,
      model: 'Mock CLIP Text Encoder',
      text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
    };
  }

  /**
   * UTILITY: Hash string to number
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
   * UTILITY: Detect image type
   */
  detectImageType(imageUrl) {
    if (imageUrl.startsWith('data:image/png')) return 'PNG (base64)';
    if (imageUrl.startsWith('data:image/jpeg')) return 'JPEG (base64)';
    if (imageUrl.startsWith('http://')) return 'HTTP URL';
    if (imageUrl.startsWith('https://')) return 'HTTPS URL';
    return 'Unknown';
  }

  /**
   * UTILITY: Save embedding to file (for offline use)
   */
  saveEmbedding(embedding, filename = 'embedding.json') {
    const data = {
      embedding,
      dimension: embedding.length,
      model: this.model,
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    logger.info(`💾 Saved embedding to ${filename}`);
  }

  /**
   * UTILITY: Load embedding from file
   */
  async loadEmbedding(file) {
    const text = await file.text();
    const data = JSON.parse(text);

    logger.info(`📂 Loaded embedding from file`);
    logger.info(`   📊 Dimension: ${data.dimension}`);
    logger.info(`   🎨 Model: ${data.model}`);
    logger.info(`   📅 Created: ${data.timestamp}`);

    return data.embedding;
  }
}

// Export singleton instance
const clipEmbeddingService = new CLIPEmbeddingService();
export default clipEmbeddingService;
