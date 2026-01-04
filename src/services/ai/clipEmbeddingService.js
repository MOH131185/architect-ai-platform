/**
 * CLIP Embedding Service
 *
 * Generates CLIP embeddings for style consistency.
 */

/**
 * Generate embedding for image
 * @param {string} imageUrl - Image URL
 * @returns {Promise<number[]>} Embedding vector
 */
export async function generateEmbedding(imageUrl) {
  console.log("[ClipEmbeddingService] generateEmbedding (stub)");
  return new Array(512).fill(0);
}

/**
 * Compare embeddings
 * @param {number[]} a - First embedding
 * @param {number[]} b - Second embedding
 * @returns {number} Similarity score (0-1)
 */
export function compareEmbeddings(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return 0.85; // Stub similarity
}

export default {
  generateEmbedding,
  compareEmbeddings,
};
