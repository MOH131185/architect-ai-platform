/**
 * Toast Hook
 * Provides easy toast notification management
 *
 * Usage:
 * const toast = useToast();
 * toast.success('Operation completed!');
 * toast.error('Something went wrong');
 * toast.warning('Please check your input');
 * toast.info('New feature available');
 */

import { useState, useCallback } from 'react';

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type, duration };

    setToasts(prev => [...prev, newToast]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
      }, duration + 300); // +300ms for exit animation
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    showToast,
    removeToast,
    clearAll,
    success: useCallback((message, duration) => showToast(message, 'success', duration), [showToast]),
    error: useCallback((message, duration) => showToast(message, 'error', duration), [showToast]),
    warning: useCallback((message, duration) => showToast(message, 'warning', duration), [showToast]),
    info: useCallback((message, duration) => showToast(message, 'info', duration), [showToast])
  };
};

export default useToast;
