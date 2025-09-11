import React from 'react';
// import ArchitectAIEnhanced from './ArchitectAIEnhanced';
import './App.css';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6">ArchitectAI Platform</h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
            AI-powered architectural design generation platform. 
            Transform any location into intelligent architectural designs in minutes.
          </p>
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-6 py-4 rounded-lg mb-8 inline-block">
            <p className="font-medium">🚧 Website Under Maintenance</p>
            <p className="text-sm mt-1">We're fixing technical issues with the interactive features. Please check back soon!</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">🏗️</div>
              <h3 className="text-lg font-semibold mb-2">Location Intelligence</h3>
              <p className="text-sm text-gray-300">Climate, zoning & architectural analysis</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">🤖</div>
              <h3 className="text-lg font-semibold mb-2">AI Design Generation</h3>
              <p className="text-sm text-gray-300">Complete 2D/3D designs in minutes</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">📐</div>
              <h3 className="text-lg font-semibold mb-2">Technical Documentation</h3>
              <p className="text-sm text-gray-300">Auto-generate CAD files & drawings</p>
            </div>
            
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">⚡</div>
              <h3 className="text-lg font-semibold mb-2">Industry Standards</h3>
              <p className="text-sm text-gray-300">Export to DWG, RVT, IFC formats</p>
            </div>
          </div>
          
          <div className="mt-12 text-center">
            <p className="text-gray-400 text-sm">
              Platform Status: <span className="text-yellow-400">Under Development</span> • 
              Expected Resolution: <span className="text-green-400">Soon</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
