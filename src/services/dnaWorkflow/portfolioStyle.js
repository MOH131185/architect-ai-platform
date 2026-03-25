/**
 * Canonical portfolio-style adapter for dnaWorkflowOrchestrator.
 * Extracts a lightweight data URL from the first portfolio image when present.
 */
export async function preparePortfolioStyleDataUrl(portfolioFiles, logger) {
  if (!portfolioFiles || portfolioFiles.length === 0) {
    return null;
  }

  try {
    const firstFile = portfolioFiles[0]?.file || portfolioFiles[0];
    if (!(firstFile instanceof Blob)) {
      return null;
    }

    const buffer = await firstFile.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        "",
      ),
    );
    const mime = firstFile.type || "image/jpeg";
    const portfolioStyleDataUrl = `data:${mime};base64,${base64}`;

    logger?.info(
      `🎨 Portfolio style image prepared (${Math.round(base64.length / 1024)}KB)`,
    );

    return portfolioStyleDataUrl;
  } catch (portfolioErr) {
    logger?.warn(
      "Could not convert portfolio image for style reference:",
      portfolioErr.message,
    );
    return null;
  }
}
