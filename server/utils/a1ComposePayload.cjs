/**
 * A1 Compose Payload Utility
 * 
 * Handles the decision of whether to return composed A1 sheets as:
 * 1. Base64 data URLs (for small images, immediate display)
 * 2. File URLs (for large images, avoid 413 errors)
 * 
 * This module is shared between:
 * - server.cjs (dev server)
 * - api/a1/compose.js (Vercel serverless function)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Build compose sheet URL - returns data URL or file URL based on size
 * 
 * @param {Object} params
 * @param {Buffer} params.pngBuffer - Composed PNG buffer
 * @param {number} params.maxDataUrlBytes - Max size for data URL (default 4.5MB)
 * @param {string} params.outputDir - Directory to write large files
 * @param {string} params.publicUrlBase - Public URL base for file access
 * @param {string} params.designId - Design ID for filename
 * @returns {Object} Result with sheetUrl, transport, and metadata
 */
function buildComposeSheetUrl({
    pngBuffer,
    maxDataUrlBytes = 4.5 * 1024 * 1024,
    outputDir,
    publicUrlBase = '/api/a1/compose-output',
    designId = 'unknown',
}) {
    if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
        return {
            success: false,
            error: 'INVALID_BUFFER',
            message: 'pngBuffer must be a non-empty Buffer',
            sheetUrl: null,
        };
    }

    const pngBytes = pngBuffer.length;

    // Calculate estimated data URL size (base64 encoding adds ~33% overhead)
    // Format: data:image/png;base64,<base64data>
    const base64Length = Math.ceil((pngBytes * 4) / 3);
    const estimatedDataUrlBytes = 'data:image/png;base64,'.length + base64Length;

    // Decision: Use data URL if within limits
    if (estimatedDataUrlBytes <= maxDataUrlBytes) {
        const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

        return {
            success: true,
            sheetUrl: dataUrl,
            transport: 'dataUrl',
            pngBytes,
            estimatedDataUrlBytes,
            sheetUrlBytes: dataUrl.length,
            outputFile: null,
        };
    }

    // Large file: Write to disk and return file URL
    if (!outputDir) {
        return {
            success: false,
            error: 'OUTPUT_DIR_REQUIRED',
            message: 'outputDir is required for large files (exceeds maxDataUrlBytes)',
            pngBytes,
            estimatedDataUrlBytes,
            maxDataUrlBytes,
            sheetUrl: null,
        };
    }

    try {
        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const hash = crypto.createHash('md5').update(pngBuffer).digest('hex').substring(0, 8);
        const filename = `a1-${designId}-${timestamp}-${hash}.png`;
        const outputFile = path.join(outputDir, filename);

        // Write file
        fs.writeFileSync(outputFile, pngBuffer);

        // Build public URL
        const fileUrl = `${publicUrlBase}/${filename}`;

        return {
            success: true,
            sheetUrl: fileUrl,
            transport: 'file',
            pngBytes,
            estimatedDataUrlBytes,
            sheetUrlBytes: fileUrl.length,
            outputFile,
            filename,
        };

    } catch (error) {
        return {
            success: false,
            error: 'FILE_WRITE_FAILED',
            message: `Failed to write composed sheet to disk: ${error.message}`,
            pngBytes,
            estimatedDataUrlBytes,
            sheetUrl: null,
        };
    }
}

module.exports = {
    buildComposeSheetUrl,
};
