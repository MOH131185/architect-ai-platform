import React, { useRef } from 'react';
import { Upload, ArrowRight, ChevronLeft, X, Image as ImageIcon } from 'lucide-react';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow.js';
import { usePortfolio } from '../hooks/usePortfolio.js';

/**
 * PortfolioUpload - Step 3: Upload portfolio and configure style blending
 *
 * Features:
 * - Drag & drop or click to upload portfolio images
 * - PDF automatic conversion to PNG
 * - Material weight slider (local vs portfolio materials)
 * - Characteristic weight slider (local vs portfolio style)
 * - Portfolio preview grid
 * - File management (remove individual files)
 *
 * @component
 */
const PortfolioUpload = () => {
  const { nextStep, prevStep } = useArchitectWorkflow();
  const {
    portfolioFiles,
    materialWeight,
    characteristicWeight,
    isUploading,
    handlePortfolioUpload,
    removePortfolioFile,
    updateMaterialWeight,
    updateCharacteristicWeight
  } = usePortfolio();

  const fileInputRef = useRef(null);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center mb-6">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mr-4">
            <Upload className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Portfolio Upload</h2>
            <p className="text-gray-600">Upload architectural images to guide AI style generation</p>
          </div>
        </div>

        {/* Upload Zone */}
        <div
          onClick={handleFileSelect}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
        >
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            {isUploading ? 'Processing files...' : 'Click to upload or drag and drop'}
          </p>
          <p className="text-sm text-gray-500">
            PNG, JPG, PDF • Up to 10MB per file
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handlePortfolioUpload}
            className="hidden"
            disabled={isUploading}
          />
        </div>

        {/* Portfolio Grid */}
        {portfolioFiles.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-800 mb-3">
              Uploaded Files ({portfolioFiles.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {portfolioFiles.map((file, index) => (
                <div key={index} className="relative group">
                  <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border-2 border-gray-200">
                    <img
                      src={file.preview}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => removePortfolioFile(index)}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <p className="text-xs text-gray-600 mt-1 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">{file.size}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {portfolioFiles.length === 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <div className="flex items-start">
              <ImageIcon className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Portfolio Optional
                </p>
                <p className="text-sm text-gray-600">
                  Upload your architectural portfolio to blend your design style with local context.
                  If skipped, AI will use location-appropriate styles only.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Style Blending Controls */}
      {portfolioFiles.length > 0 && (
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-xl font-bold text-gray-800 mb-6">Style Blending Configuration</h3>

          {/* Material Weight Slider */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Material Preference</label>
              <span className="text-sm text-gray-600">
                {Math.round((1 - materialWeight) * 100)}% Local / {Math.round(materialWeight * 100)}% Portfolio
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={materialWeight}
              onChange={(e) => updateMaterialWeight(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>100% Local Materials</span>
              <span>100% Portfolio Materials</span>
            </div>
          </div>

          {/* Characteristic Weight Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Design Characteristics</label>
              <span className="text-sm text-gray-600">
                {Math.round((1 - characteristicWeight) * 100)}% Local / {Math.round(characteristicWeight * 100)}% Portfolio
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={characteristicWeight}
              onChange={(e) => updateCharacteristicWeight(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>100% Local Style</span>
              <span>100% Portfolio Style</span>
            </div>
          </div>

          <div className="mt-4 p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">Tip:</span> For balanced results, keep both sliders around 50%.
              Adjust higher for portfolio influence or lower for local context emphasis.
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="flex items-center px-6 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back
        </button>
        <button
          onClick={nextStep}
          className="flex items-center px-8 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all duration-300 font-medium"
        >
          Continue to Specifications
          <ArrowRight className="w-5 h-5 ml-2" />
        </button>
      </div>
    </div>
  );
};

export default PortfolioUpload;
