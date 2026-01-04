/**
 * Main App Component - Deepgram-Inspired Design
 * 
 * Entry point with theme integration
 */

import React from 'react';
import ArchitectAIWizardContainer from './components/ArchitectAIWizardContainer.jsx';
import ForceHybridMode from './components/ForceHybridMode.jsx';
import './styles/deepgram.css';
import './App.css';

function App() {
  return (
    <>
      <ForceHybridMode />
      <ArchitectAIWizardContainer />
    </>
  );
}

export default App;
