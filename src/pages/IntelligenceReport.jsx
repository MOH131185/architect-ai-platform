import React from 'react';
import { Sun, MapPin, Building2, ArrowRight, ChevronLeft, AlertCircle } from 'lucide-react';
import { useDesignContext } from '../context/DesignContext';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow';
import { useLocationData } from '../hooks/useLocationData';
import PrecisionSiteDrawer from '../components/PrecisionSiteDrawer';
import SiteBoundaryInfo from '../components/SiteBoundaryInfo';
import ErrorBoundary from '../components/ErrorBoundary';

/**
 * IntelligenceReport - Step 2: Display location intelligence analysis
 *
 * Features:
 * - Climate analysis with seasonal data
 * - Zoning information and regulations
 * - Architectural style recommendations
 * - 3D Google Maps view
 * - Site polygon drawing interface
 * - Site boundary detection results
 *
 * @component
 */
const IntelligenceReport = () => {
  const { locationData } = useDesignContext();
  const { nextStep, prevStep } = useArchitectWorkflow();
  const { sitePolygon, siteMetrics, updateSitePolygon } = useLocationData();

  if (!locationData) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex items-center text-amber-600 mb-4">
          <AlertCircle className="w-6 h-6 mr-2" />
          <h3 className="text-lg font-semibold">No Location Data</h3>
        </div>
        <p className="text-gray-600 mb-6">
          Please complete location analysis first.
        </p>
        <button
          onClick={prevStep}
          className="flex items-center text-blue-600 hover:text-blue-700 font-medium"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Location Analysis
        </button>
      </div>
    );
  }

  const climate = locationData.climate || {};
  const zoning = locationData.zoning || {};
  const sunPath = locationData.sunPath || {};

  return (
    <ErrorBoundary>
      <div className="space-y-8 animate-fadeIn">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-2xl shadow-2xl p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <MapPin className="w-8 h-8 mr-3" />
                <div>
                  <h2 className="text-2xl font-bold">Site Intelligence Report</h2>
                  <p className="text-blue-100">{locationData.address}</p>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                <p className="text-sm text-blue-100">Climate Type</p>
                <p className="text-lg font-semibold">{climate.type || 'N/A'}</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                <p className="text-sm text-blue-100">Zoning</p>
                <p className="text-lg font-semibold">{zoning.type || 'N/A'}</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-4">
                <p className="text-sm text-blue-100">Recommended Style</p>
                <p className="text-lg font-semibold">{locationData.recommendedStyle || 'Contemporary'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Climate Analysis */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center mb-4">
            <Sun className="w-6 h-6 text-yellow-500 mr-2" />
            <h3 className="text-xl font-bold text-gray-800">Climate Analysis</h3>
          </div>

          {climate.seasonal && (
            <div className="grid md:grid-cols-4 gap-4">
              {Object.entries(climate.seasonal).map(([season, data]) => (
                <div key={season} className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-semibold text-gray-800 capitalize mb-2">{season}</h4>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>
                      <span className="font-medium">Temp:</span> {data.avgTemp || 'N/A'}
                    </p>
                    <p>
                      <span className="font-medium">Rain:</span> {data.precipitation || 'N/A'}
                    </p>
                    <p>
                      <span className="font-medium">Solar:</span> {data.solar || 'N/A'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sunPath.optimalOrientation && (
            <div className="mt-4 p-4 bg-blue-50 rounded-xl">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Optimal Orientation:</span> {sunPath.optimalOrientation}
              </p>
            </div>
          )}
        </div>

        {/* Zoning Information */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center mb-4">
            <Building2 className="w-6 h-6 text-blue-600 mr-2" />
            <h3 className="text-xl font-bold text-gray-800">Zoning & Regulations</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Zoning Type</p>
              <p className="text-lg font-semibold text-gray-800">{zoning.type || 'Mixed Use'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Max Height</p>
              <p className="text-lg font-semibold text-gray-800">{zoning.maxHeight || 'Check local codes'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Density Limit</p>
              <p className="text-lg font-semibold text-gray-800">{zoning.density || 'Standard'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Setbacks</p>
              <p className="text-lg font-semibold text-gray-800">{zoning.setbacks || 'Per code'}</p>
            </div>
          </div>
        </div>

        {/* Site Boundary Drawing */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Site Boundary (Optional)</h3>

          {siteMetrics && (
            <SiteBoundaryInfo siteMetrics={siteMetrics} />
          )}

          <PrecisionSiteDrawer
            address={locationData.address}
            coordinates={locationData.coordinates}
            onSitePolygonChange={updateSitePolygon}
            initialPolygon={sitePolygon}
          />

          <p className="text-sm text-gray-500 mt-4">
            Draw your site boundary for more accurate designs, or skip to use auto-detected boundaries.
          </p>
        </div>

        {/* Architectural Recommendations */}
        {locationData.localStyles && locationData.localStyles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Local Architectural Styles</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {locationData.localStyles.map((style, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-4">
                  <p className="font-semibold text-gray-800">{style}</p>
                </div>
              ))}
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
            className="flex items-center px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 font-medium"
          >
            Continue to Portfolio
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default IntelligenceReport;
