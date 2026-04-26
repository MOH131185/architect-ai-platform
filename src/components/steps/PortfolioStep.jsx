/**
 * Portfolio Step — Pro-Level Polish
 *
 * Step 3: Upload portfolio for style blending. Tighter dropzone with drag-over
 * state, semantic tokens, unified slider styling.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Image as ImageIcon,
  X,
  ArrowRight,
  ArrowLeft,
  FileText,
} from "lucide-react";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import IconWrapper from "../ui/IconWrapper.jsx";
import StepContainer from "../layout/StepContainer.jsx";
import { Skeleton } from "../ui/feedback/Loader.jsx";
import { useToastContext } from "../ui/ToastProvider.jsx";
import { fadeInUp, staggerChildren } from "../../styles/animations.js";
import logger from "../../utils/logger.js";

const PortfolioStep = ({
  portfolioFiles,
  materialWeight = 0.7,
  characteristicWeight = 0.7,
  isUploading,
  onPortfolioUpload,
  onRemoveFile,
  onMaterialWeightChange,
  onCharacteristicWeightChange,
  onNext,
  onBack,
  fileInputRef,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (onPortfolioUpload) {
        onPortfolioUpload(files);
      }
    },
    [onPortfolioUpload],
  );

  const handleFilesSelected = useCallback(
    (files) => {
      if (onPortfolioUpload) onPortfolioUpload(files);
    },
    [onPortfolioUpload],
  );

  const handleFileRemove = useCallback(
    (index) => {
      if (onRemoveFile) onRemoveFile(index);
    },
    [onRemoveFile],
  );

  // Toast on upload completion: fire when file count increases.
  const { toast } = useToastContext();
  const previousFileCount = useRef(portfolioFiles.length);
  useEffect(() => {
    if (portfolioFiles.length > previousFileCount.current) {
      const added = portfolioFiles.length - previousFileCount.current;
      toast.success(
        added === 1 ? "File added" : `${added} files added`,
        "Portfolio updated. Continue when ready.",
      );
    }
    previousFileCount.current = portfolioFiles.length;
  }, [portfolioFiles.length, toast]);

  const sliderTrackStyle = (value) => ({
    background: `linear-gradient(to right, var(--brand-500) 0%, var(--brand-500) ${value * 100}%, rgba(255,255,255,0.10) ${value * 100}%, rgba(255,255,255,0.10) 100%)`,
  });

  return (
    <StepContainer
      backgroundVariant="default"
      enableParallax={true}
      maxWidth="6xl"
    >
      <motion.div
        className="space-y-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center">
          <div className="mb-5 flex justify-center">
            <IconWrapper size="lg" variant="gradient">
              <ImageIcon className="h-7 w-7" strokeWidth={1.75} />
            </IconWrapper>
          </div>
          <p className="text-eyebrow mb-2">Step 3 — Portfolio</p>
          <h2 className="text-display-sm md:text-display-md mb-3 text-balance text-white">
            Reference designs (optional)
          </h2>
          <p className="mx-auto max-w-2xl text-base text-white/65">
            Upload reference designs for AI style blending. The system mixes
            your portfolio with local context for the final output.
          </p>
        </motion.div>

        {/* Upload Zone */}
        <motion.div variants={fadeInUp}>
          <Card variant="glass" padding="none" className="overflow-hidden">
            <div
              role="button"
              tabIndex={0}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-500/40 ${
                isDragOver
                  ? "border-royal-400/70 bg-royal-500/[0.08]"
                  : "border-white/15 hover:border-royal-500/40 hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex flex-col items-center gap-4">
                <IconWrapper size="lg" variant="glass">
                  <Upload className="h-7 w-7" strokeWidth={1.75} />
                </IconWrapper>
                <div>
                  <p className="mb-2 text-lg font-semibold text-white">
                    {isDragOver
                      ? "Drop to upload"
                      : "Drop files here, or click to browse"}
                  </p>
                  <p className="text-sm text-white/55">
                    Images (JPG, PNG) or PDFs · Max 10 files · PDF thumbnails
                    auto-generated
                  </p>
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesSelected(Array.from(e.target.files));
                }
              }}
              className="hidden"
            />
          </Card>
        </motion.div>

        {/* Upload-in-progress skeletons (placeholder while files parse) */}
        {isUploading && portfolioFiles.length === 0 && (
          <motion.div variants={fadeInUp}>
            <Card variant="glass" className="p-6">
              <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    variant="image"
                    className="aspect-square w-full"
                  />
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Portfolio Grid */}
        {portfolioFiles.length > 0 && (
          <motion.div variants={fadeInUp}>
            <Card variant="glass" className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-base font-semibold tabular-nums text-white">
                  Uploaded files ({portfolioFiles.length})
                </h3>
                <span className="text-xs text-white/55">
                  Click images to view larger
                </span>
              </div>
              <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
                {portfolioFiles.map((file, index) => {
                  let previewUrl = "";
                  const fileName = file.name || file.file?.name || "";
                  const fileType = file.file?.type || file.type || "";
                  const isPDF =
                    fileName.toLowerCase().endsWith(".pdf") ||
                    fileType === "application/pdf";

                  try {
                    if (file.preview) {
                      previewUrl = file.preview;
                    } else if (file.file && file.file instanceof Blob) {
                      previewUrl = URL.createObjectURL(file.file);
                    } else if (file instanceof File || file instanceof Blob) {
                      previewUrl = URL.createObjectURL(file);
                    }
                  } catch (err) {
                    logger.error("Error creating preview URL:", err, file);
                  }

                  return (
                    <div key={index} className="group">
                      <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 transition-all duration-200 hover:border-royal-500/40 hover:shadow-soft-lg">
                        {previewUrl ? (
                          <>
                            <img
                              src={previewUrl}
                              alt={
                                file.name ||
                                (isPDF ? "PDF preview" : "Portfolio image")
                              }
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            {isPDF && (
                              <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-error-500/30 bg-error-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-error-200 backdrop-blur-sm">
                                <FileText
                                  className="h-3 w-3"
                                  strokeWidth={1.75}
                                />
                                PDF
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center bg-white/[0.03] p-4">
                            <FileText
                              className="mb-3 h-12 w-12 text-error-300"
                              strokeWidth={1.5}
                            />
                            <span className="text-xs font-semibold text-error-200">
                              PDF document
                            </span>
                            <span className="mt-1 max-w-full truncate px-2 text-center text-xs text-white/45">
                              {fileName}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <div className="absolute inset-x-3 bottom-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFileRemove(index);
                              }}
                              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-navy-900/85 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-error-500/20 hover:border-error-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500/40"
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={2} />
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="truncate text-xs font-medium text-white/85">
                          {file.name || `Image ${index + 1}`}
                        </p>
                        {file.size && (
                          <p className="text-[11px] text-white/45 tabular-nums">
                            {file.size}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Style Blending Controls */}
        {portfolioFiles.length > 0 && (
          <motion.div variants={fadeInUp}>
            <Card variant="glass" padding="lg" className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-white">
                  Style blending
                </h3>
                <p className="mt-1 text-sm text-white/55">
                  Adjust how much your portfolio influences the design vs. the
                  local architectural context.
                </p>
              </div>

              {/* Material Weight Slider */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label
                    htmlFor="material-weight"
                    className="text-sm font-medium text-white/95"
                  >
                    Material preference
                  </label>
                  <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs tabular-nums text-white/85">
                    {Math.round((1 - materialWeight) * 100)}% local /{" "}
                    {Math.round(materialWeight * 100)}% portfolio
                  </span>
                </div>
                <div className="relative py-2">
                  <input
                    id="material-weight"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={materialWeight}
                    onChange={(e) =>
                      onMaterialWeightChange?.(parseFloat(e.target.value))
                    }
                    className="w-full cursor-pointer"
                    style={sliderTrackStyle(materialWeight)}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-white/45">
                  <span>← 100% local</span>
                  <span>100% portfolio →</span>
                </div>
              </div>

              {/* Characteristic Weight Slider */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label
                    htmlFor="characteristic-weight"
                    className="text-sm font-medium text-white/95"
                  >
                    Design characteristics
                  </label>
                  <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs tabular-nums text-white/85">
                    {Math.round((1 - characteristicWeight) * 100)}% local /{" "}
                    {Math.round(characteristicWeight * 100)}% portfolio
                  </span>
                </div>
                <div className="relative py-2">
                  <input
                    id="characteristic-weight"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={characteristicWeight}
                    onChange={(e) =>
                      onCharacteristicWeightChange?.(parseFloat(e.target.value))
                    }
                    className="w-full cursor-pointer"
                    style={sliderTrackStyle(characteristicWeight)}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-white/45">
                  <span>← 100% local</span>
                  <span>100% portfolio →</span>
                </div>
              </div>

              <div className="rounded-xl border border-royal-500/20 bg-royal-500/[0.06] p-4">
                <p className="text-sm text-white/75">
                  <span className="font-semibold text-royal-200">Tip:</span> For
                  balanced results keep both sliders around 70%. Higher for
                  portfolio influence; lower for local context emphasis.
                </p>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Navigation */}
        <motion.div variants={fadeInUp} className="flex justify-between">
          <Button
            variant="ghost"
            size="lg"
            onClick={onBack}
            icon={<ArrowLeft className="h-5 w-5" />}
          >
            Back
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={onNext}
            disabled={portfolioFiles.length === 0 || isUploading}
            loading={isUploading}
            icon={<ArrowRight className="h-5 w-5" />}
            iconPosition="right"
          >
            Continue to Specifications
          </Button>
        </motion.div>
      </motion.div>
    </StepContainer>
  );
};

export default PortfolioStep;
