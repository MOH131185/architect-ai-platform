import { useCallback } from "react";
import { useDesignContext } from "../context/DesignContext.jsx";
import {
  processPortfolioUploadFiles,
  releasePortfolioFilePreviewUrls,
} from "../utils/portfolioFileProcessing.js";
import logger from "../utils/logger.js";

/**
 * usePortfolio - Portfolio Management Hook
 *
 * Handles portfolio file upload, processing, and management:
 * - File upload with PDF conversion
 * - File preview generation
 * - Portfolio file management (add/remove)
 * - Style weight configuration
 *
 * @returns {Object} Portfolio management functions and state
 */
export const usePortfolio = () => {
  const {
    portfolioFiles,
    setPortfolioFiles,
    materialWeight,
    setMaterialWeight,
    characteristicWeight,
    setCharacteristicWeight,
    isUploading,
    setIsUploading,
    showToast,
  } = useDesignContext();

  /**
   * Handle portfolio file upload with PDF conversion
   */
  const handlePortfolioUpload = useCallback(
    async (e) => {
      if (!e?.target?.files) return;
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      setIsUploading(true);
      logger.info("Uploading portfolio files", { count: files.length }, "📤");

      try {
        const { processedFiles, errors } = await processPortfolioUploadFiles(
          files,
          { maxPdfThumbnailPages: 3 },
        );

        if (errors.length > 0) {
          errors.forEach((error) =>
            logger.error("Portfolio file processing failed", error),
          );
          showToast(
            `Failed to process ${errors[0].fileName}: ${errors[0].message}`,
          );
        }

        if (processedFiles.length > 0) {
          setPortfolioFiles((prev) => [...prev, ...processedFiles]);

          logger.info(
            "Portfolio files uploaded successfully",
            {
              newFiles: processedFiles.length,
              totalFiles: portfolioFiles.length + processedFiles.length,
            },
            "✅",
          );

          showToast(`${processedFiles.length} file(s) uploaded successfully`);
        }
      } catch (error) {
        logger.error("Portfolio upload failed", error);
        showToast(`Upload failed: ${error.message}`);
      } finally {
        setIsUploading(false);
      }
    },
    [portfolioFiles.length, setPortfolioFiles, setIsUploading, showToast],
  );

  /**
   * Remove a portfolio file by index
   */
  const removePortfolioFile = useCallback(
    (index) => {
      logger.info("Removing portfolio file", { index }, "🗑️");

      setPortfolioFiles((prev) => {
        // Revoke object URL to prevent memory leaks
        releasePortfolioFilePreviewUrls(prev[index]);

        const updated = prev.filter((_, i) => i !== index);
        logger.info("Portfolio file removed", {
          remainingFiles: updated.length,
        });
        return updated;
      });

      showToast("File removed from portfolio");
    },
    [setPortfolioFiles, showToast],
  );

  /**
   * Clear all portfolio files
   */
  const clearPortfolio = useCallback(() => {
    logger.info(
      "Clearing all portfolio files",
      { count: portfolioFiles.length },
      "🗑️",
    );

    // Revoke all object URLs
    portfolioFiles.forEach(releasePortfolioFilePreviewUrls);

    setPortfolioFiles([]);
    showToast("Portfolio cleared");
  }, [portfolioFiles, setPortfolioFiles, showToast]);

  /**
   * Update material weight (0=100% local, 1=100% portfolio)
   */
  const updateMaterialWeight = useCallback(
    (weight) => {
      const normalized = Math.max(0, Math.min(1, weight));
      setMaterialWeight(normalized);

      logger.info("Material weight updated", {
        weight: normalized,
        local: `${Math.round((1 - normalized) * 100)}%`,
        portfolio: `${Math.round(normalized * 100)}%`,
      });
    },
    [setMaterialWeight],
  );

  /**
   * Update characteristic weight (0=100% local, 1=100% portfolio)
   */
  const updateCharacteristicWeight = useCallback(
    (weight) => {
      const normalized = Math.max(0, Math.min(1, weight));
      setCharacteristicWeight(normalized);

      logger.info("Characteristic weight updated", {
        weight: normalized,
        local: `${Math.round((1 - normalized) * 100)}%`,
        portfolio: `${Math.round(normalized * 100)}%`,
      });
    },
    [setCharacteristicWeight],
  );

  /**
   * Get portfolio statistics
   */
  const getPortfolioStats = useCallback(() => {
    const totalSize = portfolioFiles.reduce((sum, file) => {
      return sum + (parseFloat(file.size) || 0);
    }, 0);

    const fileTypes = portfolioFiles.reduce((types, file) => {
      const ext = file.name.split(".").pop().toLowerCase();
      types[ext] = (types[ext] || 0) + 1;
      return types;
    }, {});

    return {
      count: portfolioFiles.length,
      totalSizeMB: totalSize.toFixed(2),
      fileTypes,
      materialBlend: {
        local: Math.round((1 - materialWeight) * 100),
        portfolio: Math.round(materialWeight * 100),
      },
      characteristicBlend: {
        local: Math.round((1 - characteristicWeight) * 100),
        portfolio: Math.round(characteristicWeight * 100),
      },
    };
  }, [portfolioFiles, materialWeight, characteristicWeight]);

  /**
   * Validate portfolio files
   */
  const validatePortfolio = useCallback(() => {
    const errors = [];
    const warnings = [];

    // Check file count
    if (portfolioFiles.length === 0) {
      warnings.push(
        "No portfolio files uploaded - will use location-based styles only",
      );
    }

    if (portfolioFiles.length > 10) {
      warnings.push(
        "Large portfolio may slow down analysis - consider using 5-10 representative images",
      );
    }

    // Check file sizes
    const oversizedFiles = portfolioFiles.filter(
      (file) => parseFloat(file.size) > 10,
    );
    if (oversizedFiles.length > 0) {
      warnings.push(
        `${oversizedFiles.length} file(s) exceed 10MB - may slow down processing`,
      );
    }

    // Check file types
    const invalidFiles = portfolioFiles.filter((file) => {
      const type = file.type.toLowerCase();
      return !type.startsWith("image/") && type !== "application/pdf";
    });

    if (invalidFiles.length > 0) {
      errors.push(
        `${invalidFiles.length} invalid file type(s) - only images are supported`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }, [portfolioFiles]);

  return {
    // State
    portfolioFiles,
    materialWeight,
    characteristicWeight,
    isUploading,

    // Actions
    handlePortfolioUpload,
    removePortfolioFile,
    clearPortfolio,
    updateMaterialWeight,
    updateCharacteristicWeight,

    // Utilities
    getPortfolioStats,
    validatePortfolio,

    // Convenience flags
    hasPortfolio: portfolioFiles.length > 0,
    portfolioCount: portfolioFiles.length,
    isBalancedBlend:
      Math.abs(materialWeight - 0.5) < 0.1 &&
      Math.abs(characteristicWeight - 0.5) < 0.1,
  };
};

export default usePortfolio;
