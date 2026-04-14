/**
 * Main App Component - Deepgram-Inspired Design
 *
 * Entry point with theme integration and Clerk authentication.
 */

import React from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import ArchitectAIWizardContainer from "./components/ArchitectAIWizardContainer.jsx";
import ForceHybridMode from "./components/ForceHybridMode.jsx";
import "./styles/deepgram.css";
import "./App.css";

const CLERK_KEY = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

function App() {
  // If Clerk is not configured, render without auth (dev/testing mode)
  if (!CLERK_KEY) {
    return (
      <>
        <ForceHybridMode />
        <ArchitectAIWizardContainer />
      </>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY}>
      <ForceHybridMode />
      <ArchitectAIWizardContainer />
    </ClerkProvider>
  );
}

export default App;
