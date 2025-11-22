/**
 * Background Image System
 * 
 * Placeholder paths for architectural imagery
 * Images should be provided by user and placed in public/images/backgrounds/
 */

// Hero background images (architectural renders)
export const heroBackgrounds = [
  '/images/backgrounds/architecture-hero-1.jpg',
  '/images/backgrounds/architecture-hero-2.jpg',
  '/images/backgrounds/architecture-hero-3.jpg',
];

// Blueprint patterns
export const blueprintPatterns = {
  grid: '/images/backgrounds/blueprint-grid.svg',
  lines: '/images/backgrounds/architectural-lines.svg',
};

// Fallback gradients (used when images not available)
export const fallbackGradients = {
  primary: 'linear-gradient(135deg, #0a0e27 0%, #1e293b 50%, #2563eb 100%)',
  secondary: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
  royal: 'linear-gradient(135deg, #1e293b 0%, #2563eb 100%)',
};

// Preload critical images
export const preloadImages = (images) => {
  return Promise.all(
    images.map((src) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = () => {
          console.warn(`Failed to load image: ${src}`);
          resolve(null); // Resolve with null instead of rejecting
        };
        img.src = src;
      });
    })
  );
};

// Get random hero background
export const getRandomHeroBackground = () => {
  const randomIndex = Math.floor(Math.random() * heroBackgrounds.length);
  return heroBackgrounds[randomIndex];
};

// Check if image exists
export const imageExists = async (src) => {
  try {
    const response = await fetch(src, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
};

// Get background with fallback
export const getBackgroundWithFallback = async (imagePath, fallbackGradient = 'primary') => {
  const exists = await imageExists(imagePath);
  if (exists) {
    return { type: 'image', value: imagePath };
  }
  return { type: 'gradient', value: fallbackGradients[fallbackGradient] };
};

export default {
  heroBackgrounds,
  blueprintPatterns,
  fallbackGradients,
  preloadImages,
  getRandomHeroBackground,
  imageExists,
  getBackgroundWithFallback,
};

