/**
 * Prompt Sanitization Utility
 * Validates and sanitizes user input before using in AI prompts
 * Prevents injection attacks and ensures safe prompt construction
 */

/**
 * Sanitizes user input for use in AI prompts
 * @param {string} input - Raw user input
 * @param {Object} options - Sanitization options
 * @param {number} options.maxLength - Maximum allowed length (default: 2000)
 * @param {boolean} options.allowNewlines - Allow newline characters (default: true)
 * @param {boolean} options.stripHtml - Strip HTML tags (default: true)
 * @returns {string} - Sanitized input
 */
export function sanitizePromptInput(input, options = {}) {
  const {
    maxLength = 2000,
    allowNewlines = true,
    stripHtml = true
  } = options;

  // Handle null/undefined
  if (input == null) {
    return '';
  }

  // Convert to string
  let sanitized = String(input);

  // Strip HTML tags if enabled
  if (stripHtml) {
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  }

  // Remove potentially dangerous characters
  // Remove control characters except newlines/tabs (if allowed)
  if (allowNewlines) {
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, ' ');
  }

  // Remove zero-width characters that could be used for obfuscation
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Enforce maximum length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Remove multiple consecutive spaces
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Remove prompt injection patterns
  sanitized = sanitizePromptInjection(sanitized);

  return sanitized;
}

/**
 * Removes common prompt injection patterns
 * @param {string} input - Input text
 * @returns {string} - Text with injection patterns removed
 */
function sanitizePromptInjection(input) {
  // Common injection patterns to neutralize
  const injectionPatterns = [
    // System role injection attempts
    /\[SYSTEM\]/gi,
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<\|system\|>/gi,
    /<\|assistant\|>/gi,
    /<\|user\|>/gi,

    // Instruction override attempts
    /ignore\s+(previous|all|above)\s+(instructions|prompts)/gi,
    /disregard\s+(previous|all|above)/gi,
    /forget\s+(everything|all|previous)/gi,

    // Role-playing attempts
    /you\s+are\s+now/gi,
    /act\s+as\s+if/gi,
    /pretend\s+(to\s+be|you\s+are)/gi,

    // SQL injection-like patterns (though not SQL, similar concept)
    /;\s*DROP\s+/gi,
    /--\s*$/gm,
    /\/\*.*?\*\//g
  ];

  let sanitized = input;

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized;
}

/**
 * Validates that input meets safety requirements
 * @param {string} input - Input to validate
 * @param {Object} options - Validation options
 * @returns {Object} - { valid: boolean, error: string|null, sanitized: string }
 */
export function validatePromptInput(input, options = {}) {
  const {
    minLength = 0,
    maxLength = 2000,
    required = false
  } = options;

  // Check if input exists
  if (required && (!input || String(input).trim().length === 0)) {
    return {
      valid: false,
      error: 'Input is required',
      sanitized: ''
    };
  }

  // Sanitize input
  const sanitized = sanitizePromptInput(input, options);

  // Check minimum length
  if (minLength > 0 && sanitized.length < minLength) {
    return {
      valid: false,
      error: `Input must be at least ${minLength} characters`,
      sanitized
    };
  }

  // Check if sanitization removed everything
  if (input && input.trim().length > 0 && sanitized.length === 0) {
    return {
      valid: false,
      error: 'Input contains only invalid characters',
      sanitized: ''
    };
  }

  return {
    valid: true,
    error: null,
    sanitized
  };
}

/**
 * Sanitizes dimension input (numbers only)
 * @param {string|number} value - Dimension value
 * @returns {number|null} - Sanitized number or null if invalid
 */
export function sanitizeDimensionInput(value) {
  if (value == null || value === '') {
    return null;
  }

  // Convert to string and remove non-numeric characters except decimal point
  const sanitized = String(value).replace(/[^\d.]/g, '');

  // Parse as float
  const parsed = parseFloat(sanitized);

  // Validate reasonable architectural dimensions (0.1m to 1000m)
  if (isNaN(parsed) || parsed < 0.1 || parsed > 1000) {
    return null;
  }

  // Round to 2 decimal places
  return Math.round(parsed * 100) / 100;
}

/**
 * Sanitizes a collection of dimension inputs
 * @param {Object} dimensions - Object with length, width, height properties
 * @returns {Object} - Sanitized dimensions object
 */
export function sanitizeDimensions(dimensions) {
  if (!dimensions || typeof dimensions !== 'object') {
    return { length: null, width: null, height: null };
  }

  return {
    length: sanitizeDimensionInput(dimensions.length),
    width: sanitizeDimensionInput(dimensions.width),
    height: sanitizeDimensionInput(dimensions.height)
  };
}

export default {
  sanitizePromptInput,
  validatePromptInput,
  sanitizeDimensionInput,
  sanitizeDimensions
};
