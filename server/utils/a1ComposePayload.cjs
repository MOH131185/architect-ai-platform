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

/**
 * Build compose SVG URL — returns data URL or file URL based on size.
 *
 * The master A1 sheet SVG sometimes reaches the client as
 * `data:image/svg+xml;charset=utf-8,<urlencoded>` of several MB. That can no
 * longer round-trip through JSON POSTs to the new `/api/a1/export` route
 * (256 KB request-body cap by design). This helper persists the SVG to disk
 * once and exposes a compact `/api/a1/compose-output/<file>.svg` reference,
 * mirroring the existing PNG transport-decision pattern in
 * `buildComposeSheetUrl`.
 *
 * @param {Object} params
 * @param {string} params.svgString - utf-8 SVG markup
 * @param {number} [params.maxDataUrlBytes] - inline-SVG cap (default 200 KB)
 * @param {string} params.outputDir - directory to persist large files
 * @param {string} [params.publicUrlBase] - default `/api/a1/compose-output`
 * @param {string} [params.designId]
 * @returns {Object} { success, sheetUrl, transport, svgBytes, sheetUrlBytes,
 *   svgOutputFile, filename, error?, message? }
 */
function buildComposeSvgUrl({
    svgString,
    maxDataUrlBytes = 200 * 1024,
    outputDir,
    publicUrlBase = '/api/a1/compose-output',
    designId = 'unknown',
}) {
    if (typeof svgString !== 'string' || svgString.length === 0) {
        return {
            success: false,
            error: 'INVALID_SVG',
            message: 'svgString must be a non-empty utf-8 string',
            sheetUrl: null,
        };
    }

    const svgBytes = Buffer.byteLength(svgString, 'utf8');

    // Inline data URL is only acceptable when the encoded payload fits the
    // 256 KB cap the export handler enforces — leave ~10 KB of headroom for
    // request envelope + JSON keys. URL-encoding can expand the payload by
    // ~3x, so check the encoded length, not the raw utf-8 length.
    let encodedSvgLength = 0;
    let encodedSvg = null;
    if (svgBytes <= maxDataUrlBytes) {
        try {
            encodedSvg = encodeURIComponent(svgString);
            encodedSvgLength =
                'data:image/svg+xml;charset=utf-8,'.length + encodedSvg.length;
        } catch (err) {
            return {
                success: false,
                error: 'SVG_ENCODE_FAILED',
                message: err.message || 'encodeURIComponent failed',
                svgBytes,
                sheetUrl: null,
            };
        }
    }

    if (encodedSvg && encodedSvgLength <= maxDataUrlBytes) {
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;
        return {
            success: true,
            sheetUrl: dataUrl,
            transport: 'dataUrl',
            svgBytes,
            sheetUrlBytes: dataUrl.length,
            svgOutputFile: null,
        };
    }

    if (!outputDir) {
        return {
            success: false,
            error: 'OUTPUT_DIR_REQUIRED',
            message: 'outputDir is required when the SVG exceeds maxDataUrlBytes',
            svgBytes,
            maxDataUrlBytes,
            sheetUrl: null,
        };
    }

    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = Date.now();
        const hash = crypto
            .createHash('md5')
            .update(svgString)
            .digest('hex')
            .substring(0, 8);
        const safeDesignId =
            String(designId || 'unknown').replace(/[^a-z0-9_-]/gi, '') ||
            'unknown';
        const filename = `a1-${safeDesignId}-${timestamp}-${hash}.svg`;
        const outputFile = path.join(outputDir, filename);

        fs.writeFileSync(outputFile, svgString, { encoding: 'utf8' });

        const fileUrl = `${publicUrlBase}/${filename}`;

        return {
            success: true,
            sheetUrl: fileUrl,
            transport: 'file',
            svgBytes,
            sheetUrlBytes: fileUrl.length,
            svgOutputFile: outputFile,
            filename,
        };
    } catch (error) {
        return {
            success: false,
            error: 'FILE_WRITE_FAILED',
            message: `Failed to write SVG to disk: ${error.message}`,
            svgBytes,
            sheetUrl: null,
        };
    }
}

module.exports = {
    buildComposeSheetUrl,
    buildComposeSvgUrl,
};
