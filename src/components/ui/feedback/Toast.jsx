import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Toast configuration by type
const toastConfig = {
  success: {
    icon: CheckCircle,
    classes: 'bg-white border-success-200 text-success-700',
    iconClass: 'text-success-500',
  },
  error: {
    icon: AlertCircle,
    classes: 'bg-white border-error-200 text-error-700',
    iconClass: 'text-error-500',
  },
  warning: {
    icon: AlertTriangle,
    classes: 'bg-white border-warning-200 text-warning-700',
    iconClass: 'text-warning-500',
  },
  info: {
    icon: Info,
    classes: 'bg-white border-info-200 text-info-700',
    iconClass: 'text-info-500',
  },
  default: {
    icon: null,
    classes: 'bg-white border-gray-200 text-gray-700',
    iconClass: 'text-gray-500',
  },
};

/**
 * Individual toast notification
 */
const Toast = ({
  id,
  type = 'default',
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
        'relative flex items-start gap-3 p-4 rounded-xl border shadow-soft-lg w-full max-w-sm',
        config.classes
      )}
      {...props}
    >
      {/* Icon */}
      {Icon && (
        <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.iconClass)} />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-medium text-gray-900">{title}</p>
        )}
        {message && (
          <p className={cn('text-sm', title && 'mt-1')}>{message}</p>
        )}
        {action && (
          <div className="mt-3">{action}</div>
        )}
      </div>

      {/* Close button */}
      {onClose && (
        <button
          onClick={() => onClose(id)}
          className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
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
  position = 'bottom-right',
  ...props
}) => {
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4',
  };

  return (
    <div
      className={cn(
        'fixed z-toast flex flex-col gap-3 pointer-events-none',
        positionClasses[position]
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
      addToast({ type: 'success', title, message, ...options }),
    error: (title, message, options = {}) =>
      addToast({ type: 'error', title, message, ...options }),
    warning: (title, message, options = {}) =>
      addToast({ type: 'warning', title, message, ...options }),
    info: (title, message, options = {}) =>
      addToast({ type: 'info', title, message, ...options }),
    default: (title, message, options = {}) =>
      addToast({ type: 'default', title, message, ...options }),
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
