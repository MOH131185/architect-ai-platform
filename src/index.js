import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.js";
import { AsyncErrorBoundary } from "./components/ErrorBoundary.jsx";
import {
  clerkAuthConfigured,
  OptionalClerkProvider,
} from "./services/auth/clerkFacade.js";
import globalErrorHandler from "./utils/globalErrorHandler.js";
import logger from "./utils/logger.js";

// Initialize global error handling
globalErrorHandler.initialize();
logger.info("Application starting", {
  environment: process.env.NODE_ENV,
  version: process.env.REACT_APP_VERSION || "1.0.0",
});
if (!clerkAuthConfigured) {
  logger.warn(
    "Clerk publishable key missing. Rendering in anonymous mode without Clerk auth.",
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AsyncErrorBoundary name="app-root">
      <OptionalClerkProvider>
        <App />
      </OptionalClerkProvider>
    </AsyncErrorBoundary>
  </React.StrictMode>,
);
