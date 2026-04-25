import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Toast configuration by type (dark blueprint surface)
const toastConfig = {
  success: {
    icon: CheckCircle,
    classes:
      "bg-navy-900/85 border-emerald-500/30 ring-1 ring-emerald-500/10 text-emerald-100",
    iconClass: "text-emerald-300",
  },
  error: {
    icon: AlertCircle,
    classes:
      "bg-navy-900/85 border-red-500/30 ring-1 ring-red-500/10 text-red-100",
    iconClass: "text-red-300",
  },
  warning: {
    icon: AlertTriangle,
    classes:
      "bg-navy-900/85 border-amber-500/30 ring-1 ring-amber-500/10 text-amber-100",
    iconClass: "text-amber-300",
  },
  info: {
    icon: Info,
    classes:
      "bg-navy-900/85 border-royal-500/30 ring-1 ring-royal-500/10 text-royal-100",
    iconClass: "text-royal-300",
  },
  default: {
    icon: null,
    classes: "bg-navy-900/85 border-white/10 ring-1 ring-white/5 text-white/85",
    iconClass: "text-white/50",
  },
};

/**
 * Individual toast notification
 */
const Toast = ({
  id,
  type = "default",
  title,
  message,
  onClose,
  duration = 5000,
  action,
  ...props
}) => {
  const config = toastConfig[type] || toastConfig.default;
  const Icon = config.icon;

  React.useEffect(() => {
    if (duration && onClose) {
      const timer = setTimeout(() => onClose(id), duration);
      return () => clearTimeout(timer);
    }
  }, [duration, id, onClose]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "relative flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-soft-lg w-full max-w-sm",
        config.classes,
      )}
      {...props}
    >
      {/* Icon */}
      {Icon && (
        <Icon
          className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.iconClass)}
          strokeWidth={1.75}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium text-white/95">{title}</p>}
        {message && (
          <p className={cn("text-sm text-white/75", title && "mt-1")}>
            {message}
          </p>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>

      {/* Close button */}
      {onClose && (
        <button
          onClick={() => onClose(id)}
          className="flex-shrink-0 p-1 rounded-lg text-white/40 hover:text-white/85 hover:bg-white/5 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}
    </motion.div>
  );
};

/**
 * Toast container for positioning multiple toasts
 */
const ToastContainer = ({
  toasts = [],
  onClose,
  position = "bottom-right",
  ...props
}) => {
  const positionClasses = {
    "top-left": "top-4 left-4",
    "top-center": "top-4 left-1/2 -translate-x-1/2",
    "top-right": "top-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
    "bottom-right": "bottom-4 right-4",
  };

  return (
    <div
      className={cn(
        "fixed z-toast flex flex-col gap-3 pointer-events-none",
        positionClasses[position],
      )}
      {...props}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast {...toast} onClose={onClose} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};

/**
 * Hook for managing toasts
 */
function useToast() {
  const [toasts, setToasts] = React.useState([]);

  const addToast = React.useCallback((toast) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = React.useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearToasts = React.useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const toast = {
    success: (title, message, options = {}) =>
      addToast({ type: "success", title, message, ...options }),
    error: (title, message, options = {}) =>
      addToast({ type: "error", title, message, ...options }),
    warning: (title, message, options = {}) =>
      addToast({ type: "warning", title, message, ...options }),
    info: (title, message, options = {}) =>
      addToast({ type: "info", title, message, ...options }),
    default: (title, message, options = {}) =>
      addToast({ type: "default", title, message, ...options }),
  };

  return {
    toasts,
    addToast,
    removeToast,
    clearToasts,
    toast,
  };
}

export { Toast, ToastContainer, useToast };
export default Toast;
