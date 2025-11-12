/**
 * PDF to Images Converter (Client-Side)
 * Uses pdfjs-dist to rasterize PDF pages to PNG
 */

import * as pdfjsLib from 'pdfjs-dist/build/pdf';

// Set worker path - use local copy from public folder (v5.4.296)
pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;

/**
 * Convert PDF file to PNG image (first page)
 * @param {File} pdfFile - PDF file from input
 * @param {number} maxSize - Maximum dimension (default 2048px)
 * @returns {Promise<Blob>} PNG blob
 */
export async function convertPdfToImage(pdfFile, maxSize = 2048) {
  try {
    console.log(`📄 Converting PDF to PNG: ${pdfFile.name}`);

    // Read PDF as ArrayBuffer
    const arrayBuffer = await pdfFile.arrayBuffer();

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    console.log(`📄 PDF loaded: ${pdf.numPages} pages`);

    // Get first page
    const page = await pdf.getPage(1);

    // Calculate scale to fit maxSize
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = Math.min(maxSize / viewport.width, maxSize / viewport.height);
    const scaledViewport = page.getViewport({ scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: scaledViewport
    };

    await page.render(renderContext).promise;

    console.log(`✅ PDF page rendered to canvas: ${canvas.width}x${canvas.height}px`);

    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          console.log(`✅ PDF converted to PNG: ${(blob.size / 1024).toFixed(2)} KB`);
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/png', 0.95);
    });

  } catch (error) {
    console.error('❌ PDF conversion error:', error);
    throw new Error(`PDF conversion failed: ${error.message}`);
  }
}

/**
 * Convert PDF File object to PNG File object
 * @param {File} pdfFile - PDF file from input
 * @returns {Promise<File>} PNG file
 */
export async function convertPdfFileToImageFile(pdfFile) {
  const blob = await convertPdfToImage(pdfFile);
  const fileName = pdfFile.name.replace(/\.pdf$/i, '.png');
  return new File([blob], fileName, { type: 'image/png' });
}
