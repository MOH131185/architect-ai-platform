/**
 * LandingPage - Blueprint Architectural Theme
 *
 * Wrapper that uses the centralized LandingPage component.
 * Provides the workflow hook integration.
 */

import React from "react";
import { useArchitectWorkflow } from "../hooks/useArchitectWorkflow.js";
import LandingPage from "../components/LandingPage.jsx";

const LandingPageWrapper = () => {
  const { nextStep } = useArchitectWorkflow();

  return <LandingPage onStart={nextStep} />;
};

export default LandingPageWrapper;
