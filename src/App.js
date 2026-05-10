/**
 * Main App Component - Deepgram-Inspired Design
 *
 * Entry point with theme integration
 */

import React from "react";
import ArchitectAIWizardContainer from "./components/ArchitectAIWizardContainer.jsx";
import ForceHybridMode from "./components/ForceHybridMode.jsx";
import ToastProvider from "./components/ui/ToastProvider.jsx";
import { TooltipProvider } from "./components/ui/feedback/Tooltip.jsx";
import "./styles/deepgram.css";
import "./App.css";

function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <ToastProvider position="bottom-right">
        <ForceHybridMode />
        <ArchitectAIWizardContainer />
      </ToastProvider>
    </TooltipProvider>
  );
}

export default App;
