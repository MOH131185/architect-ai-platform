import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
// REFACTORED: Using new modular architecture (5,646 lines → 100 lines)
import ArchitectAIEnhanced from './ArchitectAIEnhancedNew';
// Legacy (kept for rollback): import ArchitectAIEnhanced from './ArchitectAIEnhanced';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route
            path="/"
            element={
              <ErrorBoundary fallback={<div className="p-8 text-center">
                <h2 className="text-2xl font-bold text-red-600 mb-4">Application Error</h2>
                <p className="text-gray-600 mb-4">Something went wrong loading the application.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Reload Application
                </button>
              </div>}>
                <ArchitectAIEnhanced />
              </ErrorBoundary>
            }
          />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
