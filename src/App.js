/**
 * Main App Component - Deepgram-Inspired Design
 *
 * Entry point with theme integration
 */

import React from "react";
import ArchitectAIWizardContainer from "./components/ArchitectAIWizardContainer.jsx";
import ForceHybridMode from "./components/ForceHybridMode.jsx";
import ToastProvider from "./components/ui/ToastProvider.jsx";
import "./styles/deepgram.css";
import "./App.css";

function App() {
  return (
    <ToastProvider position="bottom-right">
      <ForceHybridMode />
      <ArchitectAIWizardContainer />
    </ToastProvider>
  );
}

export default App;
