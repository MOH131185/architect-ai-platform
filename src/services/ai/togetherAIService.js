/**
 * Together AI Service
 *
 * Integration with Together.ai for image generation.
 */

const API_BASE = "/api/together-image";

/**
 * Generate architectural image
 * @param {string} prompt - Generation prompt
 * @param {Object} options - Generation options
 * @returns {Promise<{url: string, seed: number}>} Generated image
 */
export async function generateArchitecturalImage(prompt, options = {}) {
  try {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        width: options.width || 1024,
        height: options.height || 1024,
        seed: options.seed,
        steps: options.steps || 30,
        ...options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Together AI error: ${response.status}`);
    }

    const data = await response.json();
    return {
      url: data.url || data.image_url,
      seed: data.seed || options.seed,
    };
  } catch (error) {
    console.error(
      "[TogetherAIService] generateArchitecturalImage failed:",
      error,
    );
    throw error;
  }
}

/**
 * Generate A1 sheet image
 * @param {string} prompt - Sheet prompt
 * @param {Object} options - Options
 * @returns {Promise<{url: string}>} Sheet image
 */
export async function generateA1SheetImage(prompt, options = {}) {
  return generateArchitecturalImage(prompt, {
    ...options,
    width: 1792,
    height: 1269,
  });
}

export default {
  generateArchitecturalImage,
  generateA1SheetImage,
};
