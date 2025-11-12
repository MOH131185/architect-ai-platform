/**
 * Parse JSON from LLM Response
 *
 * Handles common LLM response formats:
 * - JSON with code fences (```json ... ```)
 * - Plain JSON objects
 * - Text with embedded JSON
 * - Multiple JSON objects (returns first)
 */

/**
 * Parse JSON from LLM response, handling code fences and malformed output
 * @param {string} text - Raw text from LLM
 * @returns {Object} Parsed JSON object
 * @throws {Error} If no valid JSON found
 */
export function parseJsonFromLLM(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: expected string');
  }

  // Step 1: Remove markdown code fences
  let cleaned = text.replace(/```(?:json)?/g, '').trim();

  // Step 2: Try to find JSON object boundaries
  // Look for first { and matching }
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) {
    throw new Error('No JSON object found in response');
  }

  // Find the matching closing brace
  let depth = 0;
  let lastBrace = -1;
  for (let i = firstBrace; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    if (cleaned[i] === '}') {
      depth--;
      if (depth === 0) {
        lastBrace = i;
        break;
      }
    }
  }

  if (lastBrace === -1) {
    throw new Error('Malformed JSON: unclosed braces');
  }

  // Extract the JSON substring
  const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('JSON parse error:', error.message);
    console.error('Attempted to parse:', jsonStr.substring(0, 200) + '...');
    throw new Error(`Failed to parse JSON: ${error.message}`);
  }
}

/**
 * Safe JSON parse with fallback
 * @param {string} text - Raw text from LLM
 * @param {Object} fallback - Fallback object if parsing fails
 * @returns {Object} Parsed JSON or fallback
 */
export function safeParseJsonFromLLM(text, fallback = {}) {
  try {
    return parseJsonFromLLM(text);
  } catch (error) {
    console.warn('Failed to parse JSON from LLM:', error.message);
    console.warn('Using fallback object');
    return fallback;
  }
}

export default parseJsonFromLLM;
