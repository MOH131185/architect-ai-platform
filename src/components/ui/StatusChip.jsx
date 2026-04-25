import React from "react";
import { Check, X, AlertTriangle, Info, Clock, CircleDot } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Tooltip } from "./feedback/Tooltip";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Predefined status mappings: tone (color family) + default icon + default label.
 * Composes with the existing dark Badge styling pattern (bg-X/10 + ring + text)
 * but renders as a self-contained chip with icon and tooltip support.
 */
const STATUS = {
  ready: {
    label: "Ready",
    Icon: Check,
    classes: "bg-emerald-500/10 border-emerald-500/30 text-emerald-200",
    iconClass: "text-emerald-300",
  },
  pass: {
    label: "Pass",
    Icon: Check,
    classes: "bg-emerald-500/10 border-emerald-500/30 text-emerald-200",
    iconClass: "text-emerald-300",
  },
  blocked: {
    label: "Blocked",
    Icon: X,
    classes: "bg-red-500/10 border-red-500/30 text-red-200",
    iconClass: "text-red-300",
  },
  fail: {
    label: "Fail",
    Icon: X,
    classes: "bg-red-500/10 border-red-500/30 text-red-200",
    iconClass: "text-red-300",
  },
  warning: {
    label: "Warning",
    Icon: AlertTriangle,
    classes: "bg-amber-500/10 border-amber-500/30 text-amber-200",
    iconClass: "text-amber-300",
  },
  info: {
    label: "Info",
    Icon: Info,
    classes: "bg-royal-500/10 border-royal-500/30 text-royal-200",
    iconClass: "text-royal-300",
  },
  pending: {
    label: "Pending",
    Icon: Clock,
    classes: "bg-white/5 border-white/15 text-white/70",
    iconClass: "text-white/55",
  },
  neutral: {
    label: "Neutral",
    Icon: CircleDot,
    classes: "bg-white/5 border-white/15 text-white/70",
    iconClass: "text-white/55",
  },
};

const SIZES = {
  sm: {
    chip: "px-2 py-0.5 text-[11px] gap-1 rounded-md",
    icon: "w-3 h-3",
  },
  md: {
    chip: "px-2.5 py-1 text-xs gap-1.5 rounded-md",
    icon: "w-3.5 h-3.5",
  },
};

/**
 * StatusChip — small, on-brand status indicator with icon + label + optional tooltip.
 *
 * Props:
 *   status: 'ready' | 'pass' | 'blocked' | 'fail' | 'warning' | 'info' | 'pending' | 'neutral'
 *   label?: override default label (e.g. "60s remaining")
 *   icon?:  override default Lucide icon component
 *   tooltip?: optional explainer string, wraps chip in Tooltip
 *   size?: 'sm' | 'md'
 *   className?: extra classes
 */
const StatusChip = ({
  status = "neutral",
  label,
  icon: IconOverride,
  tooltip,
  size = "md",
  className,
  ...props
}) => {
  const config = STATUS[status] || STATUS.neutral;
  const Icon = IconOverride || config.Icon;
  const sizing = SIZES[size] || SIZES.md;
  const text = label ?? config.label;

  const chip = (
    <span
      className={cn(
        "inline-flex items-center font-medium border uppercase tracking-wide",
        sizing.chip,
        config.classes,
        className,
      )}
      {...props}
    >
      {Icon && (
        <Icon className={cn(sizing.icon, config.iconClass)} strokeWidth={2} />
      )}
      {text}
    </span>
  );

  if (tooltip) {
    return <Tooltip content={tooltip}>{chip}</Tooltip>;
  }

  return chip;
};

export default StatusChip;
export { StatusChip };
