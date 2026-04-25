import React, { createContext, useContext } from "react";
import { ToastContainer, useToast } from "./feedback/Toast";

/**
 * ToastContext exposes the `toast` helper + `addToast`/`removeToast`/`clearToasts`
 * across the app. Wrap the app once near the root (e.g. inside ErrorBoundary in App.js)
 * so any component can `const { toast } = useToastContext()` and call
 * `toast.success('Saved')`, `toast.error('Failed', detail)`, etc.
 */
const ToastContext = createContext(null);

export const ToastProvider = ({ children, position = "bottom-right" }) => {
  const { toasts, addToast, removeToast, clearToasts, toast } = useToast();

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, clearToasts, toast }}
    >
      {children}
      <ToastContainer
        toasts={toasts}
        onClose={removeToast}
        position={position}
      />
    </ToastContext.Provider>
  );
};

export const useToastContext = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      "useToastContext must be used within a <ToastProvider>. Wrap your app at the root.",
    );
  }
  return ctx;
};

export default ToastProvider;
