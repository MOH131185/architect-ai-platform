import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import App from "./App.js";
import globalErrorHandler from "./utils/globalErrorHandler.js";
import logger from "./utils/logger.js";

// Initialize global error handling
globalErrorHandler.initialize();
logger.info("Application starting", {
  environment: process.env.NODE_ENV,
  version: process.env.REACT_APP_VERSION || "1.0.0",
});

const clerkPublishableKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  // Keep the message loud in console but don't crash the bundle — the app can
  // still boot for static browsing; SignIn/UserButton will simply render as null.
  console.error(
    "REACT_APP_CLERK_PUBLISHABLE_KEY is not set. Auth features are disabled.",
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
