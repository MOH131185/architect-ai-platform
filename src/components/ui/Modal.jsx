import React, { useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import PropTypes from "prop-types";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  showClose = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
  initialFocusRef,
}) => {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  const handleKeyDown = useCallback(
    (e) => {
      if (!open) return;

      if (e.key === "Escape" && closeOnEscape) {
        e.stopPropagation();
        onClose?.();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusables =
          dialogRef.current.querySelectorAll(FOCUSABLE_SELECTORS);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [open, onClose, closeOnEscape],
  );

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement;
    const target =
      initialFocusRef?.current ||
      dialogRef.current?.querySelector(FOCUSABLE_SELECTORS);
    target?.focus?.();

    document.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, handleKeyDown, initialFocusRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-modal flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          <div
            className="absolute inset-0 bg-navy-950/75 backdrop-blur-sm"
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title" : undefined}
            aria-describedby={description ? "modal-description" : undefined}
            className={cn(
              "relative w-full overflow-hidden rounded-2xl border border-white/10",
              "bg-navy-900/95 backdrop-blur-2xl shadow-2xl",
              "shadow-soft-inner",
              SIZES[size] || SIZES.md,
              className,
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {(title || showClose) && (
              <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2
                      id="modal-title"
                      className="text-lg font-semibold tracking-tight text-white"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p
                      id="modal-description"
                      className="mt-1 text-sm text-white/60"
                    >
                      {description}
                    </p>
                  )}
                </div>
                {showClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="flex-shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-500/40"
                  >
                    <X className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )}

            <div className="px-6 py-5 text-sm text-white/80">{children}</div>

            {footer && (
              <div className="flex items-center justify-end gap-3 border-t border-white/8 bg-white/[0.02] px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

Modal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.node,
  description: PropTypes.node,
  children: PropTypes.node,
  footer: PropTypes.node,
  size: PropTypes.oneOf(["sm", "md", "lg", "xl"]),
  showClose: PropTypes.bool,
  closeOnBackdrop: PropTypes.bool,
  closeOnEscape: PropTypes.bool,
  className: PropTypes.string,
  initialFocusRef: PropTypes.shape({ current: PropTypes.any }),
};

export default Modal;
export { Modal };
