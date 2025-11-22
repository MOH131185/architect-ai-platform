/**
 * Portfolio Step - Deepgram-Inspired Design
 * 
 * Step 3: Upload portfolio for style blending
 */

import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, Image as ImageIcon, X, ArrowRight, ArrowLeft, FileText } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import IconWrapper from '../ui/IconWrapper.jsx';
import StepContainer from '../layout/StepContainer.jsx';
import { fadeInUp, staggerChildren } from '../../styles/animations.js';
import logger from '../../utils/logger.js';


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
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (onPortfolioUpload) {
      onPortfolioUpload(files);
    }
  }, [onPortfolioUpload]);
  
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);
  
  const handleFilesSelected = useCallback((files) => {
    if (onPortfolioUpload) {
      onPortfolioUpload(files);
    }
  }, [onPortfolioUpload]);
  
  const handleFileRemove = useCallback((index) => {
    if (onRemoveFile) {
      onRemoveFile(index);
    }
  }, [onRemoveFile]);
  
  return (
    <StepContainer backgroundVariant="default" enableParallax={true} maxWidth="6xl">
      <motion.div
        className="space-y-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
      {/* Header */}
      <motion.div variants={fadeInUp} className="text-center">
        <div className="flex justify-center mb-6">
          <IconWrapper size="xl" variant="gradient" glow>
            <ImageIcon className="w-12 h-12" />
          </IconWrapper>
        </div>
        <h2 className="text-4xl font-bold text-white mb-4 font-heading">
          Portfolio Upload
        </h2>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Upload reference designs for AI style blending
        </p>
      </motion.div>

      {/* Upload Zone */}
      <motion.div variants={fadeInUp}>
        <Card variant="glass" padding="none" className="overflow-hidden">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="p-12 text-center cursor-pointer hover:bg-white/5 transition-all duration-300 border-2 border-dashed border-navy-700 hover:border-royal-600 rounded-2xl"
          >
            <div className="flex flex-col items-center gap-4">
              <IconWrapper size="xl" variant="glass">
                <Upload className="w-12 h-12" />
              </IconWrapper>
              <div>
                <p className="text-xl font-semibold text-white mb-2">
                  Drop files here or click to browse
                </p>
                <p className="text-gray-400">
                  Images (JPG, PNG) or PDFs • Max 10 files • PDF thumbnails auto-generated
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

      {/* Portfolio Grid */}
      {portfolioFiles.length > 0 && (
        <motion.div variants={fadeInUp}>
          <Card variant="glass" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Uploaded Files ({portfolioFiles.length})
              </h3>
              <span className="text-sm text-gray-400">
                Click images to view larger
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {portfolioFiles.map((file, index) => {
                // Safely get preview URL and determine file type
                let previewUrl = '';
                const fileName = file.name || file.file?.name || '';
                const fileType = file.file?.type || file.type || '';
                const isPDF = fileName.toLowerCase().endsWith('.pdf') || fileType === 'application/pdf';

                try {
                  if (file.preview) {
                    previewUrl = file.preview;
                  } else if (file.file && file.file instanceof Blob) {
                    previewUrl = URL.createObjectURL(file.file);
                  } else if (file instanceof File || file instanceof Blob) {
                    previewUrl = URL.createObjectURL(file);
                  }
                } catch (err) {
                  logger.error('Error creating preview URL:', err, file);
                }

                return (
                  <div key={index} className="group">
                    <div className="relative overflow-hidden rounded-xl aspect-square border-2 border-navy-700 hover:border-royal-500 transition-all duration-300 shadow-lg hover:shadow-royal-500/20">
                      {previewUrl ? (
                        <>
                          <img
                            src={previewUrl}
                            alt={file.name || (isPDF ? 'PDF Preview' : 'Portfolio image')}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          {isPDF && (
                            <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded-md text-xs font-bold shadow-lg flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              PDF
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-900/20 to-navy-800 p-4">
                          <FileText className="w-16 h-16 text-red-400 mb-3" />
                          <span className="text-xs text-red-300 font-semibold">PDF Document</span>
                          <span className="text-xs text-gray-500 mt-1 text-center px-2 truncate max-w-full">
                            {fileName}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFileRemove(index);
                            }}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors duration-200"
                          >
                            <X className="w-4 h-4" />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-sm text-gray-300 truncate font-medium">
                        {file.name || `Image ${index + 1}`}
                      </p>
                      {file.size && (
                        <p className="text-xs text-gray-500">
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
          <Card variant="glass" className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Style Blending Configuration</h3>
              <p className="text-gray-400 text-sm">
                Adjust how much your portfolio influences the design vs. local architectural context
              </p>
            </div>

            {/* Material Weight Slider */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-white">Material Preference</label>
                <span className="text-sm text-royal-400 font-mono bg-royal-600/20 px-3 py-1 rounded-lg">
                  {Math.round((1 - materialWeight) * 100)}% Local / {Math.round(materialWeight * 100)}% Portfolio
                </span>
              </div>
              <div className="relative py-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={materialWeight}
                  onChange={(e) => onMaterialWeightChange?.(parseFloat(e.target.value))}
                  className="w-full cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${materialWeight * 100}%, rgba(100, 116, 139, 0.3) ${materialWeight * 100}%, rgba(100, 116, 139, 0.3) 100%)`
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span className="font-medium">← 100% Local</span>
                <span className="font-medium">100% Portfolio →</span>
              </div>
            </div>

            {/* Characteristic Weight Slider */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-white">Design Characteristics</label>
                <span className="text-sm text-purple-400 font-mono bg-purple-600/20 px-3 py-1 rounded-lg">
                  {Math.round((1 - characteristicWeight) * 100)}% Local / {Math.round(characteristicWeight * 100)}% Portfolio
                </span>
              </div>
              <div className="relative py-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={characteristicWeight}
                  onChange={(e) => onCharacteristicWeightChange?.(parseFloat(e.target.value))}
                  className="w-full cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${characteristicWeight * 100}%, rgba(100, 116, 139, 0.3) ${characteristicWeight * 100}%, rgba(100, 116, 139, 0.3) 100%)`
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span className="font-medium">← 100% Local</span>
                <span className="font-medium">100% Portfolio →</span>
              </div>
            </div>

            <div className="p-4 bg-royal-600/10 border border-royal-600/20 rounded-xl">
              <p className="text-sm text-gray-300">
                <span className="font-semibold text-royal-400">Tip:</span> For balanced results, keep both sliders around 70%.
                Adjust higher for portfolio influence or lower for local context emphasis.
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
          icon={<ArrowLeft className="w-5 h-5" />}
        >
          Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={onNext}
          disabled={portfolioFiles.length === 0 || isUploading}
          loading={isUploading}
          icon={<ArrowRight className="w-5 h-5" />}
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
