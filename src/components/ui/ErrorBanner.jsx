import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, AlertTriangle, Info, X, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Inline content banner for errors / warnings / info notices.
 * Distinct from the floating Toast — appears WITHIN page content
 * (e.g. above a form, inside a panel) to surface a contextual message.
 */
const VARIANTS = {
  error: {
    icon: AlertCircle,
    container: "bg-red-500/10 border-red-500/30",
    iconClass: "text-red-300",
    titleClass: "text-red-100",
    messageClass: "text-red-200/80",
    actionClass: "text-red-200 hover:text-white",
  },
  warning: {
    icon: AlertTriangle,
    container: "bg-amber-500/10 border-amber-500/30",
    iconClass: "text-amber-300",
    titleClass: "text-amber-100",
    messageClass: "text-amber-200/80",
    actionClass: "text-amber-200 hover:text-white",
  },
  info: {
    icon: Info,
    container: "bg-royal-500/10 border-royal-500/30",
    iconClass: "text-royal-300",
    titleClass: "text-royal-100",
    messageClass: "text-royal-200/80",
    actionClass: "text-royal-200 hover:text-white",
  },
};

const ErrorBanner = ({
  variant = "error",
  title,
  message,
  onRetry,
  onDismiss,
  visible = true,
  className,
  children,
}) => {
  const config = VARIANTS[variant] || VARIANTS.error;
  const Icon = config.icon;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="error-banner"
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{
            opacity: 1,
            y: 0,
            height: "auto",
            transition: {
              duration: 0.35,
              ease: [0.16, 1, 0.3, 1],
            },
          }}
          exit={{
            opacity: 0,
            y: -8,
            height: 0,
            transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
          }}
          className={cn("overflow-hidden", className)}
          role={variant === "error" ? "alert" : "status"}
        >
          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4",
              config.container,
            )}
          >
            <Icon
              className={cn("mt-0.5 h-5 w-5 flex-shrink-0", config.iconClass)}
              strokeWidth={1.75}
            />

            <div className="min-w-0 flex-1">
              {title && (
                <p className={cn("text-sm font-semibold", config.titleClass)}>
                  {title}
                </p>
              )}
              {message && (
                <p
                  className={cn(
                    "text-sm",
                    config.messageClass,
                    title && "mt-1",
                  )}
                >
                  {message}
                </p>
              )}
              {children && <div className="mt-2">{children}</div>}

              {(onRetry || onDismiss) && (
                <div className="mt-3 flex items-center gap-3">
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium transition-colors",
                        config.actionClass,
                      )}
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Try again
                    </button>
                  )}
                  {onDismiss && (
                    <button
                      type="button"
                      onClick={onDismiss}
                      className={cn(
                        "text-xs font-medium transition-colors",
                        config.actionClass,
                      )}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              )}
            </div>

            {onDismiss && !onRetry && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                className="ml-2 flex-shrink-0 rounded-md p-1 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ErrorBanner;
export { ErrorBanner };
