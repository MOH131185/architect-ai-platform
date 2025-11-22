import React from 'react';
import { MapPin, Compass, Loader2, Check, Cpu } from 'lucide-react';
import { useLocationData } from '../hooks/useLocationData.js';

/**
 * LocationAnalysis - Step 1: Address input and location detection
 *
 * Features:
 * - Address input field
 * - Automatic location detection button
 * - Loading states for analysis
 * - AI analysis preview (climate, solar, architecture, zoning)
 *
 * @component
 */
const LocationAnalysis = () => {
  const {
    address,
    setAddress,
    isLoading,
    isDetectingLocation,
    analyzeLocation,
    detectUserLocation
  } = useLocationData();

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      analyzeLocation();
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mr-4">
            <MapPin className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Location Analysis</h2>
            <p className="text-gray-600">Enter the project address to begin intelligent site analysis</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Address
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder={isDetectingLocation ? "Detecting your location..." : "Enter full address or let us detect your location..."}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isDetectingLocation}
              />
              {isDetectingLocation && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                </div>
              )}
            </div>
            {!address && !isDetectingLocation && (
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  We'll automatically detect your location when you start
                </p>
                <button
                  onClick={detectUserLocation}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center"
                >
                  <MapPin className="w-4 h-4 mr-1" />
                  Detect Location
                </button>
              </div>
            )}
          </div>

          <div className="bg-blue-50 rounded-xl p-4">
            <h4 className="font-medium text-blue-900 mb-2 flex items-center">
              <Cpu className="w-4 h-4 mr-2" />
              AI will analyze:
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-blue-800">
              <div className="flex items-center">
                <Check className="w-4 h-4 mr-1" /> Climate patterns
              </div>
              <div className="flex items-center">
                <Check className="w-4 h-4 mr-1" /> Solar orientation
              </div>
              <div className="flex items-center">
                <Check className="w-4 h-4 mr-1" /> Local architecture
              </div>
              <div className="flex items-center">
                <Check className="w-4 h-4 mr-1" /> Zoning regulations
              </div>
            </div>
          </div>

          <button
            onClick={analyzeLocation}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 flex items-center justify-center font-medium"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 animate-spin" />
                Analyzing Location Data...
              </>
            ) : (
              <>
                <Compass className="mr-2" />
                Analyze Location
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationAnalysis;
